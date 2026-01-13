package api

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"github.com/shalteor/cryptd-poc/internal/db"
)

// setupTestDB creates a temporary test database
func setupTestDB(t *testing.T) *db.DB {
	database, err := db.New(":memory:")
	if err != nil {
		t.Fatalf("Failed to create test database: %v", err)
	}
	return database
}

// makeRequest is a helper to make HTTP requests
func makeRequest(t *testing.T, method, path string, body interface{}, token string) *httptest.ResponseRecorder {
	var buf bytes.Buffer
	if body != nil {
		if err := json.NewEncoder(&buf).Encode(body); err != nil {
			t.Fatalf("Failed to encode request body: %v", err)
		}
	}

	req := httptest.NewRequest(method, path, &buf)
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	rr := httptest.NewRecorder()
	return rr
}

func TestRegister(t *testing.T) {
	database := setupTestDB(t)
	defer database.Close()

	server := NewServer(database)
	router := server.Router()

	t.Run("successful registration", func(t *testing.T) {
		req := RegisterRequest{
			Username: "alice",
			KDF: KDFParams{
				Type:        "argon2id",
				SaltB64:     base64.StdEncoding.EncodeToString([]byte("test-kdf-salt-16")),
				MemoryKiB:   65536,
				Iterations:  3,
				Parallelism: 1,
			},
			AuthVerifierB64: base64.StdEncoding.EncodeToString(make([]byte, 32)),
			WrappedUEK: WrappedKey{
				Alg:          "A256GCM",
				NonceB64:     base64.StdEncoding.EncodeToString(make([]byte, 12)),
				CiphertextB64: base64.StdEncoding.EncodeToString([]byte("encrypted-uek")),
			},
		}

		var buf bytes.Buffer
		json.NewEncoder(&buf).Encode(req)

		httpReq := httptest.NewRequest("POST", "/v1/register", &buf)
		httpReq.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		router.ServeHTTP(rr, httpReq)

		if rr.Code != http.StatusCreated {
			t.Errorf("Expected status 201, got %d: %s", rr.Code, rr.Body.String())
		}

		var resp RegisterResponse
		if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
			t.Fatalf("Failed to decode response: %v", err)
		}

		if resp.UserID == "" {
			t.Error("Expected user_id in response")
		}

		// Verify UUID format
		if _, err := uuid.Parse(resp.UserID); err != nil {
			t.Errorf("Invalid UUID format for user_id: %v", err)
		}
	})

	t.Run("duplicate username", func(t *testing.T) {
		req := RegisterRequest{
			Username: "alice", // Same as above
			KDF: KDFParams{
				Type:        "argon2id",
				SaltB64:     base64.StdEncoding.EncodeToString([]byte("test-kdf-salt-16")),
				MemoryKiB:   65536,
				Iterations:  3,
				Parallelism: 1,
			},
			AuthVerifierB64: base64.StdEncoding.EncodeToString(make([]byte, 32)),
			WrappedUEK: WrappedKey{
				Alg:          "A256GCM",
				NonceB64:     base64.StdEncoding.EncodeToString(make([]byte, 12)),
				CiphertextB64: base64.StdEncoding.EncodeToString([]byte("encrypted-uek")),
			},
		}

		var buf bytes.Buffer
		json.NewEncoder(&buf).Encode(req)

		httpReq := httptest.NewRequest("POST", "/v1/register", &buf)
		rr := httptest.NewRecorder()

		router.ServeHTTP(rr, httpReq)

		if rr.Code != http.StatusConflict {
			t.Errorf("Expected status 409, got %d", rr.Code)
		}
	})

	t.Run("missing username", func(t *testing.T) {
		req := RegisterRequest{
			KDF: KDFParams{
				Type:        "argon2id",
				SaltB64:     base64.StdEncoding.EncodeToString([]byte("test-kdf-salt-16")),
				MemoryKiB:   65536,
				Iterations:  3,
				Parallelism: 1,
			},
			AuthVerifierB64: base64.StdEncoding.EncodeToString(make([]byte, 32)),
			WrappedUEK: WrappedKey{
				Alg:          "A256GCM",
				NonceB64:     base64.StdEncoding.EncodeToString(make([]byte, 12)),
				CiphertextB64: base64.StdEncoding.EncodeToString([]byte("encrypted-uek")),
			},
		}

		var buf bytes.Buffer
		json.NewEncoder(&buf).Encode(req)

		httpReq := httptest.NewRequest("POST", "/v1/register", &buf)
		rr := httptest.NewRecorder()

		router.ServeHTTP(rr, httpReq)

		if rr.Code != http.StatusBadRequest {
			t.Errorf("Expected status 400, got %d", rr.Code)
		}
	})
}

func TestLogin(t *testing.T) {
	database := setupTestDB(t)
	defer database.Close()

	server := NewServer(database)
	router := server.Router()

	// First register a user
	verifier := make([]byte, 32)
	for i := range verifier {
		verifier[i] = byte(i)
	}

	registerReq := RegisterRequest{
		Username: "bob",
		KDF: KDFParams{
			Type:        "argon2id",
			SaltB64:     base64.StdEncoding.EncodeToString([]byte("test-kdf-salt-16")),
			MemoryKiB:   65536,
			Iterations:  3,
			Parallelism: 1,
		},
		AuthVerifierB64: base64.StdEncoding.EncodeToString(verifier),
		WrappedUEK: WrappedKey{
			Alg:          "A256GCM",
			NonceB64:     base64.StdEncoding.EncodeToString(make([]byte, 12)),
			CiphertextB64: base64.StdEncoding.EncodeToString([]byte("encrypted-uek")),
		},
	}

	var buf bytes.Buffer
	json.NewEncoder(&buf).Encode(registerReq)
	httpReq := httptest.NewRequest("POST", "/v1/register", &buf)
	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, httpReq)

	if rr.Code != http.StatusCreated {
		t.Fatalf("Registration failed: %d %s", rr.Code, rr.Body.String())
	}

	t.Run("successful login", func(t *testing.T) {
		loginReq := LoginRequest{
			Username:        "bob",
			AuthVerifierB64: base64.StdEncoding.EncodeToString(verifier),
		}

		var buf bytes.Buffer
		json.NewEncoder(&buf).Encode(loginReq)

		httpReq := httptest.NewRequest("POST", "/v1/login", &buf)
		rr := httptest.NewRecorder()

		router.ServeHTTP(rr, httpReq)

		if rr.Code != http.StatusOK {
			t.Errorf("Expected status 200, got %d: %s", rr.Code, rr.Body.String())
		}

		var resp LoginResponse
		if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
			t.Fatalf("Failed to decode response: %v", err)
		}

		if resp.Token == "" {
			t.Error("Expected token in response")
		}

		if resp.User.UserID == "" {
			t.Error("Expected user_id in response")
		}

		if resp.User.WrappedUEK.CiphertextB64 == "" {
			t.Error("Expected wrapped_uek in response")
		}
	})

	t.Run("wrong password", func(t *testing.T) {
		wrongVerifier := make([]byte, 32)
		for i := range wrongVerifier {
			wrongVerifier[i] = byte(i + 1)
		}

		loginReq := LoginRequest{
			Username:        "bob",
			AuthVerifierB64: base64.StdEncoding.EncodeToString(wrongVerifier),
		}

		var buf bytes.Buffer
		json.NewEncoder(&buf).Encode(loginReq)

		httpReq := httptest.NewRequest("POST", "/v1/login", &buf)
		rr := httptest.NewRecorder()

		router.ServeHTTP(rr, httpReq)

		if rr.Code != http.StatusUnauthorized {
			t.Errorf("Expected status 401, got %d", rr.Code)
		}
	})

	t.Run("nonexistent user", func(t *testing.T) {
		loginReq := LoginRequest{
			Username:        "nonexistent",
			AuthVerifierB64: base64.StdEncoding.EncodeToString(verifier),
		}

		var buf bytes.Buffer
		json.NewEncoder(&buf).Encode(loginReq)

		httpReq := httptest.NewRequest("POST", "/v1/login", &buf)
		rr := httptest.NewRecorder()

		router.ServeHTTP(rr, httpReq)

		if rr.Code != http.StatusUnauthorized {
			t.Errorf("Expected status 401, got %d", rr.Code)
		}
	})
}

func TestBlobOperations(t *testing.T) {
	database := setupTestDB(t)
	defer database.Close()

	server := NewServer(database)
	router := server.Router()

	// Register and login to get a token
	verifier := make([]byte, 32)
	registerReq := RegisterRequest{
		Username: "charlie",
		KDF: KDFParams{
			Type:        "argon2id",
			SaltB64:     base64.StdEncoding.EncodeToString([]byte("test-kdf-salt-16")),
			MemoryKiB:   65536,
			Iterations:  3,
			Parallelism: 1,
		},
		AuthVerifierB64: base64.StdEncoding.EncodeToString(verifier),
		WrappedUEK: WrappedKey{
			Alg:          "A256GCM",
			NonceB64:     base64.StdEncoding.EncodeToString(make([]byte, 12)),
			CiphertextB64: base64.StdEncoding.EncodeToString([]byte("encrypted-uek")),
		},
	}

	var buf bytes.Buffer
	json.NewEncoder(&buf).Encode(registerReq)
	httpReq := httptest.NewRequest("POST", "/v1/register", &buf)
	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, httpReq)

	loginReq := LoginRequest{
		Username:        "charlie",
		AuthVerifierB64: base64.StdEncoding.EncodeToString(verifier),
	}

	buf.Reset()
	json.NewEncoder(&buf).Encode(loginReq)
	httpReq = httptest.NewRequest("POST", "/v1/login", &buf)
	rr = httptest.NewRecorder()
	router.ServeHTTP(rr, httpReq)

	var loginResp LoginResponse
	json.NewDecoder(rr.Body).Decode(&loginResp)
	token := loginResp.Token

	blobID := uuid.New().String()

	t.Run("put blob", func(t *testing.T) {
		blobReq := BlobRequest{
			WrappedDEK: WrappedKey{
				Alg:          "A256GCM",
				NonceB64:     base64.StdEncoding.EncodeToString(make([]byte, 12)),
				CiphertextB64: base64.StdEncoding.EncodeToString([]byte("wrapped-dek")),
			},
			Blob: BlobData{
				Alg:          "A256GCM",
				NonceB64:     base64.StdEncoding.EncodeToString(make([]byte, 12)),
				CiphertextB64: base64.StdEncoding.EncodeToString([]byte("encrypted-data")),
			},
			Version: 1,
		}

		var buf bytes.Buffer
		json.NewEncoder(&buf).Encode(blobReq)

		httpReq := httptest.NewRequest("PUT", "/v1/blobs/"+blobID, &buf)
		httpReq.Header.Set("Authorization", "Bearer "+token)
		httpReq.SetPathValue("blob_id", blobID)
		rr := httptest.NewRecorder()

		router.ServeHTTP(rr, httpReq)

		if rr.Code != http.StatusCreated {
			t.Errorf("Expected status 201, got %d: %s", rr.Code, rr.Body.String())
		}

		var resp BlobResponse
		if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
			t.Fatalf("Failed to decode response: %v", err)
		}

		if resp.BlobID != blobID {
			t.Errorf("Expected blob_id %s, got %s", blobID, resp.BlobID)
		}

		if resp.Version != 1 {
			t.Errorf("Expected version 1, got %d", resp.Version)
		}
	})

	t.Run("get blob", func(t *testing.T) {
		httpReq := httptest.NewRequest("GET", "/v1/blobs/"+blobID, nil)
		httpReq.Header.Set("Authorization", "Bearer "+token)
		httpReq.SetPathValue("blob_id", blobID)
		rr := httptest.NewRecorder()

		router.ServeHTTP(rr, httpReq)

		if rr.Code != http.StatusOK {
			t.Errorf("Expected status 200, got %d: %s", rr.Code, rr.Body.String())
		}

		var resp BlobResponse
		if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
			t.Fatalf("Failed to decode response: %v", err)
		}

		if resp.BlobID != blobID {
			t.Errorf("Expected blob_id %s, got %s", blobID, resp.BlobID)
		}

		if resp.Blob == nil {
			t.Error("Expected blob data in response")
		}

		if resp.WrappedDEK.CiphertextB64 == "" {
			t.Error("Expected wrapped_dek in response")
		}
	})

	t.Run("update blob", func(t *testing.T) {
		blobReq := BlobRequest{
			WrappedDEK: WrappedKey{
				Alg:          "A256GCM",
				NonceB64:     base64.StdEncoding.EncodeToString(make([]byte, 12)),
				CiphertextB64: base64.StdEncoding.EncodeToString([]byte("wrapped-dek-v2")),
			},
			Blob: BlobData{
				Alg:          "A256GCM",
				NonceB64:     base64.StdEncoding.EncodeToString(make([]byte, 12)),
				CiphertextB64: base64.StdEncoding.EncodeToString([]byte("encrypted-data-v2")),
			},
			Version: 2,
		}

		var buf bytes.Buffer
		json.NewEncoder(&buf).Encode(blobReq)

		httpReq := httptest.NewRequest("PUT", "/v1/blobs/"+blobID, &buf)
		httpReq.Header.Set("Authorization", "Bearer "+token)
		httpReq.SetPathValue("blob_id", blobID)
		rr := httptest.NewRecorder()

		router.ServeHTTP(rr, httpReq)

		if rr.Code != http.StatusOK {
			t.Errorf("Expected status 200, got %d: %s", rr.Code, rr.Body.String())
		}

		var resp BlobResponse
		json.NewDecoder(rr.Body).Decode(&resp)

		if resp.Version != 2 {
			t.Errorf("Expected version 2, got %d", resp.Version)
		}
	})

	t.Run("list blobs", func(t *testing.T) {
		// Create another blob
		anotherBlobID := uuid.New().String()
		blobReq := BlobRequest{
			WrappedDEK: WrappedKey{
				Alg:          "A256GCM",
				NonceB64:     base64.StdEncoding.EncodeToString(make([]byte, 12)),
				CiphertextB64: base64.StdEncoding.EncodeToString([]byte("wrapped-dek")),
			},
			Blob: BlobData{
				Alg:          "A256GCM",
				NonceB64:     base64.StdEncoding.EncodeToString(make([]byte, 12)),
				CiphertextB64: base64.StdEncoding.EncodeToString([]byte("encrypted-data")),
			},
			Version: 1,
		}

		var buf bytes.Buffer
		json.NewEncoder(&buf).Encode(blobReq)

		httpReq := httptest.NewRequest("PUT", "/v1/blobs/"+anotherBlobID, &buf)
		httpReq.Header.Set("Authorization", "Bearer "+token)
		httpReq.SetPathValue("blob_id", anotherBlobID)
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, httpReq)

		// List blobs
		httpReq = httptest.NewRequest("GET", "/v1/blobs?limit=10", nil)
		httpReq.Header.Set("Authorization", "Bearer "+token)
		rr = httptest.NewRecorder()

		router.ServeHTTP(rr, httpReq)

		if rr.Code != http.StatusOK {
			t.Errorf("Expected status 200, got %d: %s", rr.Code, rr.Body.String())
		}

		var resp BlobListResponse
		if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
			t.Fatalf("Failed to decode response: %v", err)
		}

		if len(resp.Items) != 2 {
			t.Errorf("Expected 2 blobs, got %d", len(resp.Items))
		}
	})

	t.Run("delete blob", func(t *testing.T) {
		httpReq := httptest.NewRequest("DELETE", "/v1/blobs/"+blobID, nil)
		httpReq.Header.Set("Authorization", "Bearer "+token)
		httpReq.SetPathValue("blob_id", blobID)
		rr := httptest.NewRecorder()

		router.ServeHTTP(rr, httpReq)

		if rr.Code != http.StatusNoContent {
			t.Errorf("Expected status 204, got %d: %s", rr.Code, rr.Body.String())
		}

		// Verify blob is deleted
		httpReq = httptest.NewRequest("GET", "/v1/blobs/"+blobID, nil)
		httpReq.Header.Set("Authorization", "Bearer "+token)
		httpReq.SetPathValue("blob_id", blobID)
		rr = httptest.NewRecorder()

		router.ServeHTTP(rr, httpReq)

		if rr.Code != http.StatusNotFound {
			t.Errorf("Expected status 404 after deletion, got %d", rr.Code)
		}
	})

	t.Run("unauthorized access", func(t *testing.T) {
		httpReq := httptest.NewRequest("GET", "/v1/blobs", nil)
		rr := httptest.NewRecorder()

		router.ServeHTTP(rr, httpReq)

		if rr.Code != http.StatusUnauthorized {
			t.Errorf("Expected status 401, got %d", rr.Code)
		}
	})

	t.Run("invalid token", func(t *testing.T) {
		httpReq := httptest.NewRequest("GET", "/v1/blobs", nil)
		httpReq.Header.Set("Authorization", "Bearer invalid-token")
		rr := httptest.NewRecorder()

		router.ServeHTTP(rr, httpReq)

		if rr.Code != http.StatusUnauthorized {
			t.Errorf("Expected status 401, got %d", rr.Code)
		}
	})
}

func TestAuthMiddleware(t *testing.T) {
	database := setupTestDB(t)
	defer database.Close()

	server := NewServer(database)

	t.Run("missing authorization header", func(t *testing.T) {
		handler := server.AuthMiddleware(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		})

		req := httptest.NewRequest("GET", "/test", nil)
		rr := httptest.NewRecorder()

		handler(rr, req)

		if rr.Code != http.StatusUnauthorized {
			t.Errorf("Expected status 401, got %d", rr.Code)
		}
	})

	t.Run("invalid authorization format", func(t *testing.T) {
		handler := server.AuthMiddleware(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		})

		req := httptest.NewRequest("GET", "/test", nil)
		req.Header.Set("Authorization", "InvalidFormat")
		rr := httptest.NewRecorder()

		handler(rr, req)

		if rr.Code != http.StatusUnauthorized {
			t.Errorf("Expected status 401, got %d", rr.Code)
		}
	})

	t.Run("valid token", func(t *testing.T) {
		// Create a session
		userID := uuid.New().String()
		token := sessionStore.Create(userID)

		handler := server.AuthMiddleware(func(w http.ResponseWriter, r *http.Request) {
			retrievedUserID, ok := GetUserID(r.Context())
			if !ok || retrievedUserID != userID {
				t.Error("User ID not found in context or mismatch")
			}
			w.WriteHeader(http.StatusOK)
		})

		req := httptest.NewRequest("GET", "/test", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		rr := httptest.NewRecorder()

		handler(rr, req)

		if rr.Code != http.StatusOK {
			t.Errorf("Expected status 200, got %d", rr.Code)
		}
	})
}

func TestDatabaseOperations(t *testing.T) {
	database := setupTestDB(t)
	defer database.Close()

	ctx := context.Background()

	t.Run("create and get user", func(t *testing.T) {
		user := &db.User{
			ID:                 uuid.New().String(),
			Username:           "testuser",
			KDFType:            "argon2id",
			KDFSaltB64:         base64.StdEncoding.EncodeToString(make([]byte, 16)),
			KDFMemoryKiB:       65536,
			KDFIterations:      3,
			KDFParallelism:     1,
			AuthSaltB64:        base64.StdEncoding.EncodeToString(make([]byte, 16)),
			AuthHashB64:        base64.StdEncoding.EncodeToString(make([]byte, 32)),
			WrappedUEKB64:      base64.StdEncoding.EncodeToString([]byte("uek")),
			WrappedUEKNonceB64: base64.StdEncoding.EncodeToString(make([]byte, 12)),
			WrappedUEKAlg:      "A256GCM",
		}

		if err := database.CreateUser(ctx, user); err != nil {
			t.Fatalf("Failed to create user: %v", err)
		}

		retrieved, err := database.GetUserByUsername(ctx, "testuser")
		if err != nil {
			t.Fatalf("Failed to get user: %v", err)
		}

		if retrieved == nil {
			t.Fatal("User not found")
		}

		if retrieved.Username != user.Username {
			t.Errorf("Expected username %s, got %s", user.Username, retrieved.Username)
		}
	})

	t.Run("blob operations", func(t *testing.T) {
		userID := uuid.New().String()
		blobID := uuid.New().String()

		// Create user first
		user := &db.User{
			ID:                 userID,
			Username:           "blobuser",
			KDFType:            "argon2id",
			KDFSaltB64:         base64.StdEncoding.EncodeToString(make([]byte, 16)),
			KDFMemoryKiB:       65536,
			KDFIterations:      3,
			KDFParallelism:     1,
			AuthSaltB64:        base64.StdEncoding.EncodeToString(make([]byte, 16)),
			AuthHashB64:        base64.StdEncoding.EncodeToString(make([]byte, 32)),
			WrappedUEKB64:      base64.StdEncoding.EncodeToString([]byte("uek")),
			WrappedUEKNonceB64: base64.StdEncoding.EncodeToString(make([]byte, 12)),
			WrappedUEKAlg:      "A256GCM",
		}

		if err := database.CreateUser(ctx, user); err != nil {
			t.Fatalf("Failed to create user: %v", err)
		}

		// Create blob
		blob := &db.Blob{
			ID:                 blobID,
			UserID:             userID,
			WrappedDEKB64:      base64.StdEncoding.EncodeToString([]byte("dek")),
			WrappedDEKNonceB64: base64.StdEncoding.EncodeToString(make([]byte, 12)),
			WrappedDEKAlg:      "A256GCM",
			CiphertextB64:      base64.StdEncoding.EncodeToString([]byte("data")),
			NonceB64:           base64.StdEncoding.EncodeToString(make([]byte, 12)),
			Alg:                "A256GCM",
			Version:            1,
		}

		if err := database.UpsertBlob(ctx, blob); err != nil {
			t.Fatalf("Failed to create blob: %v", err)
		}

		// Get blob
		retrieved, err := database.GetBlob(ctx, userID, blobID)
		if err != nil {
			t.Fatalf("Failed to get blob: %v", err)
		}

		if retrieved == nil {
			t.Fatal("Blob not found")
		}

		if retrieved.Version != 1 {
			t.Errorf("Expected version 1, got %d", retrieved.Version)
		}

		// List blobs
		blobs, err := database.ListBlobs(ctx, userID, 10, 0)
		if err != nil {
			t.Fatalf("Failed to list blobs: %v", err)
		}

		if len(blobs) != 1 {
			t.Errorf("Expected 1 blob, got %d", len(blobs))
		}

		// Delete blob
		if err := database.DeleteBlob(ctx, userID, blobID); err != nil {
			t.Fatalf("Failed to delete blob: %v", err)
		}

		// Verify deletion
		deleted, err := database.GetBlob(ctx, userID, blobID)
		if err != nil {
			t.Fatalf("Error checking deleted blob: %v", err)
		}

		if deleted != nil {
			t.Error("Blob should be deleted")
		}
	})
}
