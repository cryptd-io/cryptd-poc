package api

import (
	"encoding/base64"
	"fmt"
	"net/http"
	"strconv"

	"github.com/google/uuid"
	"github.com/shalteor/cryptd-poc/internal/db"
)

// BlobRequest represents the blob PUT request
type BlobRequest struct {
	WrappedDEK WrappedKey `json:"wrapped_dek"`
	Blob       BlobData   `json:"blob"`
	Version    int        `json:"version"`
}

type BlobData struct {
	Alg          string `json:"alg"`
	NonceB64     string `json:"nonce_b64"`
	CiphertextB64 string `json:"ciphertext_b64"`
}

// BlobResponse represents the blob response
type BlobResponse struct {
	BlobID     string     `json:"blob_id"`
	Version    int        `json:"version"`
	WrappedDEK WrappedKey `json:"wrapped_dek,omitempty"`
	Blob       *BlobData  `json:"blob,omitempty"`
	UpdatedAt  string     `json:"updated_at,omitempty"`
}

// BlobListResponse represents the blob list response
type BlobListResponse struct {
	Items      []BlobListItem `json:"items"`
	NextCursor string         `json:"next_cursor,omitempty"`
}

type BlobListItem struct {
	BlobID    string `json:"blob_id"`
	Version   int    `json:"version"`
	UpdatedAt string `json:"updated_at"`
}

// HandlePutBlob implements PUT /v1/blobs/{blob_id}
func (s *Server) HandlePutBlob(w http.ResponseWriter, r *http.Request) {
	userID, ok := GetUserID(r.Context())
	if !ok {
		WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	// Extract blob_id from URL path
	blobID := r.PathValue("blob_id")
	if blobID == "" {
		WriteError(w, http.StatusBadRequest, "blob_id is required")
		return
	}

	// Validate UUID
	if _, err := uuid.Parse(blobID); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid blob_id format")
		return
	}

	var req BlobRequest
	if err := DecodeJSON(r, &req); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Validate request
	if err := validateBlobRequest(&req); err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Check if blob exists for version control
	existingBlob, err := s.db.GetBlob(r.Context(), userID, blobID)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "database error")
		return
	}

	isNewBlob := existingBlob == nil
	statusCode := http.StatusOK

	if isNewBlob {
		statusCode = http.StatusCreated
	}

	// Create/update blob
	blob := &db.Blob{
		ID:     blobID,
		UserID: userID,

		WrappedDEKB64:      req.WrappedDEK.CiphertextB64,
		WrappedDEKNonceB64: req.WrappedDEK.NonceB64,
		WrappedDEKAlg:      req.WrappedDEK.Alg,

		CiphertextB64: req.Blob.CiphertextB64,
		NonceB64:      req.Blob.NonceB64,
		Alg:           req.Blob.Alg,
		Version:       req.Version,
	}

	if err := s.db.UpsertBlob(r.Context(), blob); err != nil {
		WriteError(w, http.StatusInternalServerError, fmt.Sprintf("failed to save blob: %v", err))
		return
	}

	// Fetch the saved blob to get updated_at
	savedBlob, err := s.db.GetBlob(r.Context(), userID, blobID)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "failed to fetch saved blob")
		return
	}

	resp := BlobResponse{
		BlobID:    blobID,
		Version:   savedBlob.Version,
		UpdatedAt: savedBlob.UpdatedAt.Format("2006-01-02T15:04:05.999Z07:00"),
	}

	WriteJSON(w, statusCode, resp)
}

// HandleGetBlob implements GET /v1/blobs/{blob_id}
func (s *Server) HandleGetBlob(w http.ResponseWriter, r *http.Request) {
	userID, ok := GetUserID(r.Context())
	if !ok {
		WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	blobID := r.PathValue("blob_id")
	if blobID == "" {
		WriteError(w, http.StatusBadRequest, "blob_id is required")
		return
	}

	blob, err := s.db.GetBlob(r.Context(), userID, blobID)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "database error")
		return
	}

	if blob == nil {
		WriteError(w, http.StatusNotFound, "blob not found")
		return
	}

	resp := BlobResponse{
		BlobID:  blob.ID,
		Version: blob.Version,
		WrappedDEK: WrappedKey{
			Alg:          blob.WrappedDEKAlg,
			NonceB64:     blob.WrappedDEKNonceB64,
			CiphertextB64: blob.WrappedDEKB64,
		},
		Blob: &BlobData{
			Alg:          blob.Alg,
			NonceB64:     blob.NonceB64,
			CiphertextB64: blob.CiphertextB64,
		},
		UpdatedAt: blob.UpdatedAt.Format("2006-01-02T15:04:05.999Z07:00"),
	}

	WriteJSON(w, http.StatusOK, resp)
}

// HandleListBlobs implements GET /v1/blobs
func (s *Server) HandleListBlobs(w http.ResponseWriter, r *http.Request) {
	userID, ok := GetUserID(r.Context())
	if !ok {
		WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	// Parse query parameters
	limitStr := r.URL.Query().Get("limit")
	if limitStr == "" {
		limitStr = "50"
	}
	limit, err := strconv.Atoi(limitStr)
	if err != nil || limit < 1 || limit > 1000 {
		WriteError(w, http.StatusBadRequest, "invalid limit parameter (must be 1-1000)")
		return
	}

	// Simple offset-based pagination for PoC
	offsetStr := r.URL.Query().Get("offset")
	if offsetStr == "" {
		offsetStr = "0"
	}
	offset, err := strconv.Atoi(offsetStr)
	if err != nil || offset < 0 {
		WriteError(w, http.StatusBadRequest, "invalid offset parameter")
		return
	}

	blobs, err := s.db.ListBlobs(r.Context(), userID, limit+1, offset) // Fetch limit+1 to check if there are more
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "database error")
		return
	}

	hasMore := len(blobs) > limit
	if hasMore {
		blobs = blobs[:limit]
	}

	items := make([]BlobListItem, len(blobs))
	for i, blob := range blobs {
		items[i] = BlobListItem{
			BlobID:    blob.ID,
			Version:   blob.Version,
			UpdatedAt: blob.UpdatedAt.Format("2006-01-02T15:04:05.999Z07:00"),
		}
	}

	resp := BlobListResponse{
		Items: items,
	}

	if hasMore {
		resp.NextCursor = strconv.Itoa(offset + limit)
	}

	WriteJSON(w, http.StatusOK, resp)
}

// HandleDeleteBlob implements DELETE /v1/blobs/{blob_id}
func (s *Server) HandleDeleteBlob(w http.ResponseWriter, r *http.Request) {
	userID, ok := GetUserID(r.Context())
	if !ok {
		WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	blobID := r.PathValue("blob_id")
	if blobID == "" {
		WriteError(w, http.StatusBadRequest, "blob_id is required")
		return
	}

	err := s.db.DeleteBlob(r.Context(), userID, blobID)
	if err != nil {
		if err.Error() == "sql: no rows in result set" {
			WriteError(w, http.StatusNotFound, "blob not found")
			return
		}
		WriteError(w, http.StatusInternalServerError, "failed to delete blob")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// validateBlobRequest validates the blob request
func validateBlobRequest(req *BlobRequest) error {
	if req.WrappedDEK.Alg == "" {
		return fmt.Errorf("wrapped_dek.alg is required")
	}
	if req.WrappedDEK.NonceB64 == "" {
		return fmt.Errorf("wrapped_dek.nonce_b64 is required")
	}
	if req.WrappedDEK.CiphertextB64 == "" {
		return fmt.Errorf("wrapped_dek.ciphertext_b64 is required")
	}
	if req.Blob.Alg == "" {
		return fmt.Errorf("blob.alg is required")
	}
	if req.Blob.NonceB64 == "" {
		return fmt.Errorf("blob.nonce_b64 is required")
	}
	if req.Blob.CiphertextB64 == "" {
		return fmt.Errorf("blob.ciphertext_b64 is required")
	}

	// Validate base64
	fields := map[string]string{
		"wrapped_dek.nonce_b64":     req.WrappedDEK.NonceB64,
		"wrapped_dek.ciphertext_b64": req.WrappedDEK.CiphertextB64,
		"blob.nonce_b64":            req.Blob.NonceB64,
		"blob.ciphertext_b64":       req.Blob.CiphertextB64,
	}

	for field, value := range fields {
		if _, err := base64.StdEncoding.DecodeString(value); err != nil {
			return fmt.Errorf("invalid base64 in %s", field)
		}
	}

	return nil
}
