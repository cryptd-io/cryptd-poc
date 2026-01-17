package api

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/shalteor/cryptd-poc/backend/internal/crypto"
	"github.com/shalteor/cryptd-poc/backend/internal/db"
	"github.com/shalteor/cryptd-poc/backend/internal/middleware"
	"github.com/shalteor/cryptd-poc/backend/internal/models"
)

// Server represents the API server
type Server struct {
	db        *db.DB
	jwtConfig *middleware.JWTConfig
}

// NewServer creates a new API server
func NewServer(database *db.DB, jwtSecret string) *Server {
	return &Server{
		db:        database,
		jwtConfig: middleware.NewJWTConfig(jwtSecret),
	}
}

// GetKDFParams handles GET /v1/auth/kdf
func (s *Server) GetKDFParams(w http.ResponseWriter, r *http.Request) {
	username := r.URL.Query().Get("username")
	if username == "" {
		respondError(w, http.StatusBadRequest, "username is required")
		return
	}

	user, err := s.db.GetUserByUsername(username)
	if err == db.ErrUserNotFound {
		respondError(w, http.StatusNotFound, "user not found")
		return
	}
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to get user")
		return
	}

	params := models.KDFParams{
		Type:        user.KDFType,
		Iterations:  user.KDFIterations,
		MemoryKiB:   user.KDFMemoryKiB,
		Parallelism: user.KDFParallelism,
	}

	respondJSON(w, http.StatusOK, params)
}

// RegisterRequest represents the registration request
type RegisterRequest struct {
	Username          string           `json:"username"`
	KDFType           models.KDFType   `json:"kdfType"`
	KDFIterations     int              `json:"kdfIterations"`
	KDFMemoryKiB      *int             `json:"kdfMemoryKiB,omitempty"`
	KDFParallelism    *int             `json:"kdfParallelism,omitempty"`
	LoginVerifier     string           `json:"loginVerifier"` // base64
	WrappedAccountKey models.Container `json:"wrappedAccountKey"`
}

// Register handles POST /v1/auth/register
func (s *Server) Register(w http.ResponseWriter, r *http.Request) {
	var req RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Validate username
	if req.Username == "" {
		respondError(w, http.StatusBadRequest, "username is required")
		return
	}

	// Validate KDF params
	params := models.KDFParams{
		Type:        req.KDFType,
		Iterations:  req.KDFIterations,
		MemoryKiB:   req.KDFMemoryKiB,
		Parallelism: req.KDFParallelism,
	}
	if err := crypto.ValidateKDFParams(params); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Decode login verifier
	loginVerifier, err := crypto.DecodeBase64(req.LoginVerifier)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid login verifier encoding")
		return
	}

	if len(loginVerifier) != 32 {
		respondError(w, http.StatusBadRequest, "login verifier must be 32 bytes")
		return
	}

	// Hash login verifier
	loginVerifierHash := crypto.HashLoginVerifier(loginVerifier, req.Username)

	// Create user
	user := &models.User{
		Username:          req.Username,
		KDFType:           req.KDFType,
		KDFIterations:     req.KDFIterations,
		KDFMemoryKiB:      req.KDFMemoryKiB,
		KDFParallelism:    req.KDFParallelism,
		LoginVerifierHash: loginVerifierHash,
		WrappedAccountKey: req.WrappedAccountKey,
	}

	if err := s.db.CreateUser(user); err != nil {
		if err == db.ErrUserExists {
			respondError(w, http.StatusConflict, "username already exists")
			return
		}
		respondError(w, http.StatusInternalServerError, "failed to create user")
		return
	}

	respondJSON(w, http.StatusCreated, map[string]interface{}{
		"username":  user.Username,
		"createdAt": user.CreatedAt,
	})
}

// VerifyRequest represents the login verification request
type VerifyRequest struct {
	Username      string `json:"username"`
	LoginVerifier string `json:"loginVerifier"` // base64
}

// VerifyResponse represents the login verification response
type VerifyResponse struct {
	Token             string           `json:"token"`
	WrappedAccountKey models.Container `json:"wrappedAccountKey"`
}

// Verify handles POST /v1/auth/verify
func (s *Server) Verify(w http.ResponseWriter, r *http.Request) {
	var req VerifyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Get user
	user, err := s.db.GetUserByUsername(req.Username)
	if err == db.ErrUserNotFound {
		respondError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to get user")
		return
	}

	// Decode login verifier
	loginVerifier, err := crypto.DecodeBase64(req.LoginVerifier)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid login verifier encoding")
		return
	}

	// Verify login verifier
	if !crypto.VerifyLoginVerifier(loginVerifier, req.Username, user.LoginVerifierHash) {
		respondError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	// Generate JWT token
	token, err := s.jwtConfig.GenerateToken(user.ID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to generate token")
		return
	}

	respondJSON(w, http.StatusOK, VerifyResponse{
		Token:             token,
		WrappedAccountKey: user.WrappedAccountKey,
	})
}

// UpdateUserRequest represents the credential rotation request
type UpdateUserRequest struct {
	Username          *string          `json:"username,omitempty"`
	LoginVerifier     string           `json:"loginVerifier"`
	WrappedAccountKey models.Container `json:"wrappedAccountKey"`
}

// UpdateUser handles PATCH /v1/users/me
func (s *Server) UpdateUser(w http.ResponseWriter, r *http.Request) {
	userID, err := middleware.GetUserIDFromContext(r.Context())
	if err != nil {
		respondError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req UpdateUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Get current user
	user, err := s.db.GetUserByID(userID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to get user")
		return
	}

	// Update username if provided
	if req.Username != nil && *req.Username != "" {
		user.Username = *req.Username
	}

	// Decode and hash new login verifier
	loginVerifier, err := crypto.DecodeBase64(req.LoginVerifier)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid login verifier encoding")
		return
	}

	if len(loginVerifier) != 32 {
		respondError(w, http.StatusBadRequest, "login verifier must be 32 bytes")
		return
	}

	user.LoginVerifierHash = crypto.HashLoginVerifier(loginVerifier, user.Username)
	user.WrappedAccountKey = req.WrappedAccountKey

	// Update user in database
	if err := s.db.UpdateUser(user); err != nil {
		if err == db.ErrUserExists {
			respondError(w, http.StatusConflict, "username already exists")
			return
		}
		respondError(w, http.StatusInternalServerError, "failed to update user")
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"username":  user.Username,
		"updatedAt": user.UpdatedAt,
	})
}

// UpsertBlobRequest represents the blob upsert request
type UpsertBlobRequest struct {
	EncryptedBlob models.Container `json:"encryptedBlob"`
}

// UpsertBlob handles PUT /v1/blobs/{blobName}
func (s *Server) UpsertBlob(w http.ResponseWriter, r *http.Request) {
	userID, err := middleware.GetUserIDFromContext(r.Context())
	if err != nil {
		respondError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	blobName := chi.URLParam(r, "blobName")
	if blobName == "" {
		respondError(w, http.StatusBadRequest, "blob name is required")
		return
	}

	var req UpsertBlobRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	blob := &models.Blob{
		UserID:        userID,
		BlobName:      blobName,
		EncryptedBlob: req.EncryptedBlob,
	}

	if err := s.db.UpsertBlob(blob); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to upsert blob")
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"blobName":  blob.BlobName,
		"updatedAt": blob.UpdatedAt,
	})
}

// GetBlob handles GET /v1/blobs/{blobName}
func (s *Server) GetBlob(w http.ResponseWriter, r *http.Request) {
	userID, err := middleware.GetUserIDFromContext(r.Context())
	if err != nil {
		respondError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	blobName := chi.URLParam(r, "blobName")
	if blobName == "" {
		respondError(w, http.StatusBadRequest, "blob name is required")
		return
	}

	blob, err := s.db.GetBlob(userID, blobName)
	if err == db.ErrBlobNotFound {
		respondError(w, http.StatusNotFound, "blob not found")
		return
	}
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to get blob")
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"encryptedBlob": blob.EncryptedBlob,
	})
}

// ListBlobs handles GET /v1/blobs
func (s *Server) ListBlobs(w http.ResponseWriter, r *http.Request) {
	userID, err := middleware.GetUserIDFromContext(r.Context())
	if err != nil {
		respondError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	blobs, err := s.db.ListBlobs(userID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to list blobs")
		return
	}

	respondJSON(w, http.StatusOK, blobs)
}

// DeleteBlob handles DELETE /v1/blobs/{blobName}
func (s *Server) DeleteBlob(w http.ResponseWriter, r *http.Request) {
	userID, err := middleware.GetUserIDFromContext(r.Context())
	if err != nil {
		respondError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	blobName := chi.URLParam(r, "blobName")
	if blobName == "" {
		respondError(w, http.StatusBadRequest, "blob name is required")
		return
	}

	if err := s.db.DeleteBlob(userID, blobName); err != nil {
		if err == db.ErrBlobNotFound {
			respondError(w, http.StatusNotFound, "blob not found")
			return
		}
		respondError(w, http.StatusInternalServerError, "failed to delete blob")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// Helper functions

func respondJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func respondError(w http.ResponseWriter, status int, message string) {
	respondJSON(w, status, map[string]string{"error": message})
}
