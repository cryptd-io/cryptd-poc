package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/shalteor/cryptd-poc/backend/internal/crypto"
	"github.com/shalteor/cryptd-poc/backend/internal/db"
	"github.com/shalteor/cryptd-poc/backend/internal/models"
)

func setupTestServer(t *testing.T) (*Server, *db.DB) {
	t.Helper()

	database, err := db.New(":memory:")
	if err != nil {
		t.Fatalf("failed to create test database: %v", err)
	}

	server := NewServer(database, "test-jwt-secret")
	return server, database
}

func TestGetKDFParams(t *testing.T) {
	server, database := setupTestServer(t)
	defer func() { _ = database.Close() }()

	// Create a test user
	memKiB := 65536
	parallelism := 4
	user := &models.User{
		Username:          "alice",
		KDFType:           models.KDFTypeArgon2id,
		KDFIterations:     3,
		KDFMemoryKiB:      &memKiB,
		KDFParallelism:    &parallelism,
		LoginVerifierHash: []byte("test-hash"),
		WrappedAccountKey: models.Container{
			Nonce:      "nonce",
			Ciphertext: "ciphertext",
			Tag:        "tag",
		},
	}

	err := database.CreateUser(user)
	if err != nil {
		t.Fatalf("failed to create user: %v", err)
	}

	// Test successful request
	req := httptest.NewRequest("GET", "/v1/auth/kdf?username=alice", nil)
	w := httptest.NewRecorder()

	server.GetKDFParams(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}

	var params models.KDFParams
	if err := json.NewDecoder(w.Body).Decode(&params); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if params.Type != models.KDFTypeArgon2id {
		t.Errorf("expected KDF type argon2id, got %s", params.Type)
	}

	if params.Iterations != 3 {
		t.Errorf("expected iterations 3, got %d", params.Iterations)
	}
}

func TestGetKDFParamsUserNotFound(t *testing.T) {
	server, database := setupTestServer(t)
	defer func() { _ = database.Close() }()

	req := httptest.NewRequest("GET", "/v1/auth/kdf?username=nonexistent", nil)
	w := httptest.NewRecorder()

	server.GetKDFParams(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected status 404, got %d", w.Code)
	}
}

func TestGetKDFParamsMissingUsername(t *testing.T) {
	server, database := setupTestServer(t)
	defer func() { _ = database.Close() }()

	req := httptest.NewRequest("GET", "/v1/auth/kdf", nil)
	w := httptest.NewRecorder()

	server.GetKDFParams(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected status 400, got %d", w.Code)
	}
}

func TestRegister(t *testing.T) {
	server, database := setupTestServer(t)
	defer func() { _ = database.Close() }()

	// Prepare request
	memKiB := 65536
	parallelism := 4
	req := RegisterRequest{
		Username:       "alice",
		KDFType:        models.KDFTypeArgon2id,
		KDFIterations:  3,
		KDFMemoryKiB:   &memKiB,
		KDFParallelism: &parallelism,
		LoginVerifier:  crypto.EncodeBase64(make([]byte, 32)),
		WrappedAccountKey: models.Container{
			Nonce:      "nonce",
			Ciphertext: "ciphertext",
			Tag:        "tag",
		},
	}

	body, _ := json.Marshal(req)
	httpReq := httptest.NewRequest("POST", "/v1/auth/register", bytes.NewReader(body))
	w := httptest.NewRecorder()

	server.Register(w, httpReq)

	if w.Code != http.StatusCreated {
		t.Errorf("expected status 201, got %d: %s", w.Code, w.Body.String())
	}

	// Verify user was created
	user, err := database.GetUserByUsername("alice")
	if err != nil {
		t.Fatalf("failed to get user: %v", err)
	}

	if user.Username != "alice" {
		t.Errorf("expected username alice, got %s", user.Username)
	}
}

func TestRegisterDuplicateUsername(t *testing.T) {
	server, database := setupTestServer(t)
	defer func() { _ = database.Close() }()

	// Create first user
	memKiB := 65536
	parallelism := 4
	req := RegisterRequest{
		Username:       "alice",
		KDFType:        models.KDFTypeArgon2id,
		KDFIterations:  3,
		KDFMemoryKiB:   &memKiB,
		KDFParallelism: &parallelism,
		LoginVerifier:  crypto.EncodeBase64(make([]byte, 32)),
		WrappedAccountKey: models.Container{
			Nonce:      "nonce1",
			Ciphertext: "ciphertext1",
			Tag:        "tag1",
		},
	}

	body, _ := json.Marshal(req)
	httpReq := httptest.NewRequest("POST", "/v1/auth/register", bytes.NewReader(body))
	w := httptest.NewRecorder()
	server.Register(w, httpReq)

	if w.Code != http.StatusCreated {
		t.Fatalf("first registration failed: %d", w.Code)
	}

	// Try to create duplicate
	req.WrappedAccountKey.Nonce = "nonce2"
	body, _ = json.Marshal(req)
	httpReq = httptest.NewRequest("POST", "/v1/auth/register", bytes.NewReader(body))
	w = httptest.NewRecorder()
	server.Register(w, httpReq)

	if w.Code != http.StatusConflict {
		t.Errorf("expected status 409, got %d", w.Code)
	}
}

func TestRegisterInvalidKDFParams(t *testing.T) {
	server, database := setupTestServer(t)
	defer func() { _ = database.Close() }()

	req := RegisterRequest{
		Username:      "alice",
		KDFType:       models.KDFTypePBKDF2SHA256,
		KDFIterations: 100, // Too low
		LoginVerifier: crypto.EncodeBase64(make([]byte, 32)),
		WrappedAccountKey: models.Container{
			Nonce:      "nonce",
			Ciphertext: "ciphertext",
			Tag:        "tag",
		},
	}

	body, _ := json.Marshal(req)
	httpReq := httptest.NewRequest("POST", "/v1/auth/register", bytes.NewReader(body))
	w := httptest.NewRecorder()

	server.Register(w, httpReq)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected status 400, got %d", w.Code)
	}
}

func TestVerify(t *testing.T) {
	server, database := setupTestServer(t)
	defer func() { _ = database.Close() }()

	// Create user with known credentials
	password := "test-password"
	username := "alice"
	memKiB := 65536
	parallelism := 4

	params := models.KDFParams{
		Type:        models.KDFTypeArgon2id,
		Iterations:  3,
		MemoryKiB:   &memKiB,
		Parallelism: &parallelism,
	}

	masterSecret, _ := crypto.DerivePasswordSecret(password, username, params)
	loginVerifier, _ := crypto.DeriveLoginVerifier(masterSecret)
	loginVerifierHash := crypto.HashLoginVerifier(loginVerifier, username)

	user := &models.User{
		Username:          username,
		KDFType:           params.Type,
		KDFIterations:     params.Iterations,
		KDFMemoryKiB:      params.MemoryKiB,
		KDFParallelism:    params.Parallelism,
		LoginVerifierHash: loginVerifierHash,
		WrappedAccountKey: models.Container{
			Nonce:      "nonce",
			Ciphertext: "ciphertext",
			Tag:        "tag",
		},
	}

	err := database.CreateUser(user)
	if err != nil {
		t.Fatalf("failed to create user: %v", err)
	}

	// Test successful verification
	req := VerifyRequest{
		Username:      username,
		LoginVerifier: crypto.EncodeBase64(loginVerifier),
	}

	body, _ := json.Marshal(req)
	httpReq := httptest.NewRequest("POST", "/v1/auth/verify", bytes.NewReader(body))
	w := httptest.NewRecorder()

	server.Verify(w, httpReq)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp VerifyResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if resp.Token == "" {
		t.Error("expected token in response")
	}

	if resp.WrappedAccountKey.Nonce != "nonce" {
		t.Error("expected wrapped account key in response")
	}
}

func TestVerifyInvalidCredentials(t *testing.T) {
	server, database := setupTestServer(t)
	defer func() { _ = database.Close() }()

	// Create user
	memKiB := 65536
	parallelism := 4
	params := models.KDFParams{
		Type:        models.KDFTypeArgon2id,
		Iterations:  3,
		MemoryKiB:   &memKiB,
		Parallelism: &parallelism,
	}

	masterSecret, _ := crypto.DerivePasswordSecret("correct-password", "alice", params)
	loginVerifier, _ := crypto.DeriveLoginVerifier(masterSecret)
	loginVerifierHash := crypto.HashLoginVerifier(loginVerifier, "alice")

	user := &models.User{
		Username:          "alice",
		KDFType:           params.Type,
		KDFIterations:     params.Iterations,
		KDFMemoryKiB:      params.MemoryKiB,
		KDFParallelism:    params.Parallelism,
		LoginVerifierHash: loginVerifierHash,
		WrappedAccountKey: models.Container{
			Nonce:      "nonce",
			Ciphertext: "ciphertext",
			Tag:        "tag",
		},
	}

	_ = database.CreateUser(user)

	// Try with wrong password
	wrongSecret, _ := crypto.DerivePasswordSecret("wrong-password", "alice", params)
	wrongVerifier, _ := crypto.DeriveLoginVerifier(wrongSecret)

	req := VerifyRequest{
		Username:      "alice",
		LoginVerifier: crypto.EncodeBase64(wrongVerifier),
	}

	body, _ := json.Marshal(req)
	httpReq := httptest.NewRequest("POST", "/v1/auth/verify", bytes.NewReader(body))
	w := httptest.NewRecorder()

	server.Verify(w, httpReq)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected status 401, got %d", w.Code)
	}
}

func TestUpdateUser(t *testing.T) {
	server, database := setupTestServer(t)
	defer func() { _ = database.Close() }()

	// Create user
	memKiB := 65536
	parallelism := 4
	user := &models.User{
		Username:          "alice",
		KDFType:           models.KDFTypeArgon2id,
		KDFIterations:     3,
		KDFMemoryKiB:      &memKiB,
		KDFParallelism:    &parallelism,
		LoginVerifierHash: []byte("old-hash"),
		WrappedAccountKey: models.Container{
			Nonce:      "old-nonce",
			Ciphertext: "old-ciphertext",
			Tag:        "old-tag",
		},
	}

	_ = database.CreateUser(user)

	// Generate token
	token, _ := server.jwtConfig.GenerateToken(user.ID)

	// Update user
	newUsername := "alice-new"
	req := UpdateUserRequest{
		Username:      &newUsername,
		LoginVerifier: crypto.EncodeBase64(make([]byte, 32)),
		WrappedAccountKey: models.Container{
			Nonce:      "new-nonce",
			Ciphertext: "new-ciphertext",
			Tag:        "new-tag",
		},
	}

	body, _ := json.Marshal(req)
	httpReq := httptest.NewRequest("PATCH", "/v1/users/me", bytes.NewReader(body))
	httpReq.Header.Set("Authorization", "Bearer "+token)

	// Create router to test with middleware
	router := server.NewRouter()
	w := httptest.NewRecorder()
	router.ServeHTTP(w, httpReq)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d: %s", w.Code, w.Body.String())
	}

	// Verify update
	updated, _ := database.GetUserByID(user.ID)
	if updated.Username != "alice-new" {
		t.Errorf("expected username alice-new, got %s", updated.Username)
	}

	if updated.WrappedAccountKey.Nonce != "new-nonce" {
		t.Error("wrapped account key not updated")
	}
}

func TestUpsertBlob(t *testing.T) {
	server, database := setupTestServer(t)
	defer func() { _ = database.Close() }()

	// Create user
	user := &models.User{
		Username:          "alice",
		KDFType:           models.KDFTypePBKDF2SHA256,
		KDFIterations:     600_000,
		LoginVerifierHash: []byte("hash"),
		WrappedAccountKey: models.Container{
			Nonce:      "nonce",
			Ciphertext: "ciphertext",
			Tag:        "tag",
		},
	}
	_ = database.CreateUser(user)

	// Generate token
	token, _ := server.jwtConfig.GenerateToken(user.ID)

	// Upsert blob
	req := UpsertBlobRequest{
		EncryptedBlob: models.Container{
			Nonce:      "blob-nonce",
			Ciphertext: "blob-ciphertext",
			Tag:        "blob-tag",
		},
	}

	body, _ := json.Marshal(req)
	httpReq := httptest.NewRequest("PUT", "/v1/blobs/vault", bytes.NewReader(body))
	httpReq.Header.Set("Authorization", "Bearer "+token)

	router := server.NewRouter()
	w := httptest.NewRecorder()
	router.ServeHTTP(w, httpReq)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d: %s", w.Code, w.Body.String())
	}

	// Verify blob was created
	blob, err := database.GetBlob(user.ID, "vault")
	if err != nil {
		t.Fatalf("failed to get blob: %v", err)
	}

	if blob.EncryptedBlob.Ciphertext != "blob-ciphertext" {
		t.Error("blob not created correctly")
	}
}

func TestGetBlob(t *testing.T) {
	server, database := setupTestServer(t)
	defer func() { _ = database.Close() }()

	// Create user and blob
	user := &models.User{
		Username:          "alice",
		KDFType:           models.KDFTypePBKDF2SHA256,
		KDFIterations:     600_000,
		LoginVerifierHash: []byte("hash"),
		WrappedAccountKey: models.Container{
			Nonce:      "nonce",
			Ciphertext: "ciphertext",
			Tag:        "tag",
		},
	}
	_ = database.CreateUser(user)

	blob := &models.Blob{
		UserID:   user.ID,
		BlobName: "vault",
		EncryptedBlob: models.Container{
			Nonce:      "blob-nonce",
			Ciphertext: "blob-ciphertext",
		Tag:        "blob-tag",
	},
}
	_ = database.UpsertBlob(blob)

	// Generate token and get blob
	token, _ := server.jwtConfig.GenerateToken(user.ID)

	httpReq := httptest.NewRequest("GET", "/v1/blobs/vault", nil)
	httpReq.Header.Set("Authorization", "Bearer "+token)

	router := server.NewRouter()
	w := httptest.NewRecorder()
	router.ServeHTTP(w, httpReq)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}

	var resp map[string]interface{}
	_ = json.NewDecoder(w.Body).Decode(&resp)

	encBlob := resp["encryptedBlob"].(map[string]interface{})
	if encBlob["ciphertext"] != "blob-ciphertext" {
		t.Error("incorrect blob returned")
	}
}

func TestListBlobs(t *testing.T) {
	server, database := setupTestServer(t)
	defer func() { _ = database.Close() }()

	// Create user and blobs
	user := &models.User{
		Username:          "alice",
		KDFType:           models.KDFTypePBKDF2SHA256,
		KDFIterations:     600_000,
		LoginVerifierHash: []byte("hash"),
		WrappedAccountKey: models.Container{
			Nonce:      "nonce",
			Ciphertext: "ciphertext",
		Tag:        "tag",
	},
}
	_ = database.CreateUser(user)

	blobs := []string{"vault", "notes", "journal"}
	for _, name := range blobs {
		blob := &models.Blob{
			UserID:   user.ID,
			BlobName: name,
			EncryptedBlob: models.Container{
				Nonce:      "nonce-" + name,
				Ciphertext: "Y2lwaGVydGV4dC0=",
			Tag:        "tag-" + name,
		},
	}
		_ = database.UpsertBlob(blob)
	}

	// Generate token and list blobs
	token, _ := server.jwtConfig.GenerateToken(user.ID)

	httpReq := httptest.NewRequest("GET", "/v1/blobs", nil)
	httpReq.Header.Set("Authorization", "Bearer "+token)

	router := server.NewRouter()
	w := httptest.NewRecorder()
	router.ServeHTTP(w, httpReq)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}

	var list []models.BlobListItem
	_ = json.NewDecoder(w.Body).Decode(&list)

	if len(list) != 3 {
		t.Errorf("expected 3 blobs, got %d", len(list))
	}
}

func TestDeleteBlob(t *testing.T) {
	server, database := setupTestServer(t)
	defer func() { _ = database.Close() }()

	// Create user and blob
	user := &models.User{
		Username:          "alice",
		KDFType:           models.KDFTypePBKDF2SHA256,
		KDFIterations:     600_000,
		LoginVerifierHash: []byte("hash"),
		WrappedAccountKey: models.Container{
			Nonce:      "nonce",
			Ciphertext: "ciphertext",
			Tag:        "tag",
		},
	}
	_ = database.CreateUser(user)

	blob := &models.Blob{
		UserID:   user.ID,
		BlobName: "vault",
		EncryptedBlob: models.Container{
			Nonce:      "nonce",
			Ciphertext: "ciphertext",
		Tag:        "tag",
	},
}
	_ = database.UpsertBlob(blob)

	// Generate token and delete blob
	token, _ := server.jwtConfig.GenerateToken(user.ID)

	httpReq := httptest.NewRequest("DELETE", "/v1/blobs/vault", nil)
	httpReq.Header.Set("Authorization", "Bearer "+token)

	router := server.NewRouter()
	w := httptest.NewRecorder()
	router.ServeHTTP(w, httpReq)

	if w.Code != http.StatusNoContent {
		t.Errorf("expected status 204, got %d", w.Code)
	}

	// Verify deletion
	_, err := database.GetBlob(user.ID, "vault")
	if err != db.ErrBlobNotFound {
		t.Error("blob should be deleted")
	}
}
