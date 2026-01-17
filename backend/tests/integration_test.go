package tests

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	_ "modernc.org/sqlite" // Import sqlite driver

	"github.com/shalteor/cryptd-poc/backend/internal/api"
	"github.com/shalteor/cryptd-poc/backend/internal/crypto"
	"github.com/shalteor/cryptd-poc/backend/internal/db"
	"github.com/shalteor/cryptd-poc/backend/internal/models"
)

// TestFullAuthFlow tests the complete authentication flow
func TestFullAuthFlow(t *testing.T) {
	// Setup
	database, err := db.New(":memory:")
	if err != nil {
		t.Fatalf("failed to create database: %v", err)
	}
	defer database.Close()

	server := api.NewServer(database, "test-jwt-secret")
	router := server.NewRouter()

	// Test data
	username := "alice"
	password := "secure-password-123"

	// Step 1: Register a new user
	t.Run("Register", func(t *testing.T) {
		memKiB := 65536
		parallelism := 4
		kdfParams := models.KDFParams{
			Type:        models.KDFTypeArgon2id,
			Iterations:  3,
			MemoryKiB:   &memKiB,
			Parallelism: &parallelism,
		}

		// Derive credentials (client-side simulation)
		masterSecret, err := crypto.DerivePasswordSecret(password, username, kdfParams)
		if err != nil {
			t.Fatalf("failed to derive master secret: %v", err)
		}

		loginVerifier, err := crypto.DeriveLoginVerifier(masterSecret)
		if err != nil {
			t.Fatalf("failed to derive login verifier: %v", err)
		}

		// Generate random account key
		accountKey, err := crypto.GenerateRandomBytes(32)
		if err != nil {
			t.Fatalf("failed to generate account key: %v", err)
		}

		// For testing, we'll just create a mock wrapped account key
		// In production, this would be AES-GCM encrypted
		wrappedAccountKey := models.Container{
			Nonce:      crypto.EncodeBase64([]byte("test-nonce-12345")),
			Ciphertext: crypto.EncodeBase64(accountKey),
			Tag:        crypto.EncodeBase64([]byte("test-tag-16bytes")),
		}

		// Register request
		registerReq := map[string]interface{}{
			"username":          username,
			"kdfType":           string(kdfParams.Type),
			"kdfIterations":     kdfParams.Iterations,
			"kdfMemoryKiB":      *kdfParams.MemoryKiB,
			"kdfParallelism":    *kdfParams.Parallelism,
			"loginVerifier":     crypto.EncodeBase64(loginVerifier),
			"wrappedAccountKey": wrappedAccountKey,
		}

		body, _ := json.Marshal(registerReq)
		req := httptest.NewRequest("POST", "/v1/auth/register", bytes.NewReader(body))
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)

		if w.Code != http.StatusCreated {
			t.Fatalf("registration failed: status %d, body: %s", w.Code, w.Body.String())
		}

		t.Logf("User registered successfully")
	})

	// Step 2: Get KDF params
	var retrievedParams models.KDFParams
	t.Run("GetKDFParams", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/v1/auth/kdf?username="+username, nil)
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("failed to get KDF params: status %d", w.Code)
		}

		if err := json.NewDecoder(w.Body).Decode(&retrievedParams); err != nil {
			t.Fatalf("failed to decode KDF params: %v", err)
		}

		if retrievedParams.Type != models.KDFTypeArgon2id {
			t.Errorf("expected KDF type argon2id, got %s", retrievedParams.Type)
		}

		t.Logf("Retrieved KDF params: %+v", retrievedParams)
	})

	// Step 3: Login/Verify
	var token string
	t.Run("Verify", func(t *testing.T) {
		// Re-derive credentials using retrieved params
		masterSecret, err := crypto.DerivePasswordSecret(password, username, retrievedParams)
		if err != nil {
			t.Fatalf("failed to derive master secret: %v", err)
		}

		loginVerifier, err := crypto.DeriveLoginVerifier(masterSecret)
		if err != nil {
			t.Fatalf("failed to derive login verifier: %v", err)
		}

		verifyReq := map[string]interface{}{
			"username":      username,
			"loginVerifier": crypto.EncodeBase64(loginVerifier),
		}

		body, _ := json.Marshal(verifyReq)
		req := httptest.NewRequest("POST", "/v1/auth/verify", bytes.NewReader(body))
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("verification failed: status %d, body: %s", w.Code, w.Body.String())
		}

		var verifyResp map[string]interface{}
		if err := json.NewDecoder(w.Body).Decode(&verifyResp); err != nil {
			t.Fatalf("failed to decode verify response: %v", err)
		}

		token = verifyResp["token"].(string)
		if token == "" {
			t.Fatal("no token in response")
		}

		t.Logf("Login successful, got token")
	})

	// Step 4: Test authenticated endpoints
	t.Run("AuthenticatedRequests", func(t *testing.T) {
		// Create blob
		t.Run("CreateBlob", func(t *testing.T) {
			blobReq := map[string]interface{}{
				"encryptedBlob": map[string]string{
					"nonce":      crypto.EncodeBase64([]byte("blob-nonce-12345")),
					"ciphertext": crypto.EncodeBase64([]byte("encrypted-blob-data")),
					"tag":        crypto.EncodeBase64([]byte("blob-tag-16bytes")),
				},
			}

			body, _ := json.Marshal(blobReq)
			req := httptest.NewRequest("PUT", "/v1/blobs/vault", bytes.NewReader(body))
			req.Header.Set("Authorization", "Bearer "+token)
			w := httptest.NewRecorder()

			router.ServeHTTP(w, req)

			if w.Code != http.StatusOK {
				t.Fatalf("failed to create blob: status %d, body: %s", w.Code, w.Body.String())
			}

			t.Logf("Blob created successfully")
		})

		// List blobs
		t.Run("ListBlobs", func(t *testing.T) {
			req := httptest.NewRequest("GET", "/v1/blobs", nil)
			req.Header.Set("Authorization", "Bearer "+token)
			w := httptest.NewRecorder()

			router.ServeHTTP(w, req)

			if w.Code != http.StatusOK {
				t.Fatalf("failed to list blobs: status %d", w.Code)
			}

			var blobs []models.BlobListItem
			if err := json.NewDecoder(w.Body).Decode(&blobs); err != nil {
				t.Fatalf("failed to decode blobs: %v", err)
			}

			if len(blobs) != 1 {
				t.Errorf("expected 1 blob, got %d", len(blobs))
			}

			if blobs[0].BlobName != "vault" {
				t.Errorf("expected blob name 'vault', got '%s'", blobs[0].BlobName)
			}

			t.Logf("Listed %d blob(s)", len(blobs))
		})

		// Get blob
		t.Run("GetBlob", func(t *testing.T) {
			req := httptest.NewRequest("GET", "/v1/blobs/vault", nil)
			req.Header.Set("Authorization", "Bearer "+token)
			w := httptest.NewRecorder()

			router.ServeHTTP(w, req)

			if w.Code != http.StatusOK {
				t.Fatalf("failed to get blob: status %d", w.Code)
			}

			var resp map[string]interface{}
			json.NewDecoder(w.Body).Decode(&resp)

			if _, ok := resp["encryptedBlob"]; !ok {
				t.Error("expected encryptedBlob in response")
			}

			t.Logf("Retrieved blob successfully")
		})

		// Update blob
		t.Run("UpdateBlob", func(t *testing.T) {
			blobReq := map[string]interface{}{
				"encryptedBlob": map[string]string{
					"nonce":      crypto.EncodeBase64([]byte("updated-nonce-12")),
					"ciphertext": crypto.EncodeBase64([]byte("updated-blob-data")),
					"tag":        crypto.EncodeBase64([]byte("updated-tag-16by")),
				},
			}

			body, _ := json.Marshal(blobReq)
			req := httptest.NewRequest("PUT", "/v1/blobs/vault", bytes.NewReader(body))
			req.Header.Set("Authorization", "Bearer "+token)
			w := httptest.NewRecorder()

			router.ServeHTTP(w, req)

			if w.Code != http.StatusOK {
				t.Fatalf("failed to update blob: status %d", w.Code)
			}

			t.Logf("Blob updated successfully")
		})

		// Delete blob
		t.Run("DeleteBlob", func(t *testing.T) {
			req := httptest.NewRequest("DELETE", "/v1/blobs/vault", nil)
			req.Header.Set("Authorization", "Bearer "+token)
			w := httptest.NewRecorder()

			router.ServeHTTP(w, req)

			if w.Code != http.StatusNoContent {
				t.Fatalf("failed to delete blob: status %d", w.Code)
			}

			t.Logf("Blob deleted successfully")
		})

		// Verify deletion
		t.Run("VerifyDeletion", func(t *testing.T) {
			req := httptest.NewRequest("GET", "/v1/blobs/vault", nil)
			req.Header.Set("Authorization", "Bearer "+token)
			w := httptest.NewRecorder()

			router.ServeHTTP(w, req)

			if w.Code != http.StatusNotFound {
				t.Fatalf("expected status 404 after deletion, got %d", w.Code)
			}

			t.Logf("Verified blob was deleted")
		})
	})
}

// TestCredentialRotation tests password and username rotation
func TestCredentialRotation(t *testing.T) {
	database, err := db.New(":memory:")
	if err != nil {
		t.Fatalf("failed to create database: %v", err)
	}
	defer database.Close()

	server := api.NewServer(database, "test-jwt-secret")
	router := server.NewRouter()

	username := "alice"
	password := "old-password"
	newPassword := "new-password"
	newUsername := "alice-new"

	// Register user
	memKiB := 65536
	parallelism := 4
	kdfParams := models.KDFParams{
		Type:        models.KDFTypeArgon2id,
		Iterations:  3,
		MemoryKiB:   &memKiB,
		Parallelism: &parallelism,
	}

	masterSecret, _ := crypto.DerivePasswordSecret(password, username, kdfParams)
	loginVerifier, _ := crypto.DeriveLoginVerifier(masterSecret)
	accountKey, _ := crypto.GenerateRandomBytes(32)

	registerReq := map[string]interface{}{
		"username":       username,
		"kdfType":        string(kdfParams.Type),
		"kdfIterations":  kdfParams.Iterations,
		"kdfMemoryKiB":   *kdfParams.MemoryKiB,
		"kdfParallelism": *kdfParams.Parallelism,
		"loginVerifier":  crypto.EncodeBase64(loginVerifier),
		"wrappedAccountKey": models.Container{
			Nonce:      crypto.EncodeBase64([]byte("test-nonce-12345")),
			Ciphertext: crypto.EncodeBase64(accountKey),
			Tag:        crypto.EncodeBase64([]byte("test-tag-16bytes")),
		},
	}

	body, _ := json.Marshal(registerReq)
	req := httptest.NewRequest("POST", "/v1/auth/register", bytes.NewReader(body))
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("registration failed: %d", w.Code)
	}

	// Login to get token
	verifyReq := map[string]interface{}{
		"username":      username,
		"loginVerifier": crypto.EncodeBase64(loginVerifier),
	}

	body, _ = json.Marshal(verifyReq)
	req = httptest.NewRequest("POST", "/v1/auth/verify", bytes.NewReader(body))
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)

	var verifyResp map[string]interface{}
	json.NewDecoder(w.Body).Decode(&verifyResp)
	token := verifyResp["token"].(string)

	// Rotate credentials
	t.Run("RotateCredentials", func(t *testing.T) {
		// Derive new credentials
		newMasterSecret, _ := crypto.DerivePasswordSecret(newPassword, newUsername, kdfParams)
		newLoginVerifier, _ := crypto.DeriveLoginVerifier(newMasterSecret)

		updateReq := map[string]interface{}{
			"username":      newUsername,
			"loginVerifier": crypto.EncodeBase64(newLoginVerifier),
			"wrappedAccountKey": models.Container{
				Nonce:      crypto.EncodeBase64([]byte("new-nonce-123456")),
				Ciphertext: crypto.EncodeBase64(accountKey),
				Tag:        crypto.EncodeBase64([]byte("new-tag-16bytess")),
			},
		}

		body, _ := json.Marshal(updateReq)
		req := httptest.NewRequest("PATCH", "/v1/users/me", bytes.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("credential rotation failed: status %d, body: %s", w.Code, w.Body.String())
		}

		t.Logf("Credentials rotated successfully")
	})

	// Verify old credentials don't work
	t.Run("OldCredentialsFail", func(t *testing.T) {
		verifyReq := map[string]interface{}{
			"username":      username,
			"loginVerifier": crypto.EncodeBase64(loginVerifier),
		}

		body, _ := json.Marshal(verifyReq)
		req := httptest.NewRequest("POST", "/v1/auth/verify", bytes.NewReader(body))
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)

		if w.Code != http.StatusUnauthorized {
			t.Errorf("expected 401, got %d (old credentials should fail)", w.Code)
		}

		t.Logf("Old credentials correctly rejected")
	})

	// Verify new credentials work
	t.Run("NewCredentialsWork", func(t *testing.T) {
		newMasterSecret, _ := crypto.DerivePasswordSecret(newPassword, newUsername, kdfParams)
		newLoginVerifier, _ := crypto.DeriveLoginVerifier(newMasterSecret)

		verifyReq := map[string]interface{}{
			"username":      newUsername,
			"loginVerifier": crypto.EncodeBase64(newLoginVerifier),
		}

		body, _ := json.Marshal(verifyReq)
		req := httptest.NewRequest("POST", "/v1/auth/verify", bytes.NewReader(body))
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("new credentials should work, got status %d", w.Code)
		}

		t.Logf("New credentials work correctly")
	})
}

// TestMultipleUsersIsolation tests that users can't access each other's blobs
func TestMultipleUsersIsolation(t *testing.T) {
	database, err := db.New(":memory:")
	if err != nil {
		t.Fatalf("failed to create database: %v", err)
	}
	defer database.Close()

	server := api.NewServer(database, "test-jwt-secret")
	router := server.NewRouter()

	// Helper function to register and login a user
	registerAndLogin := func(username, password string) string {
		memKiB := 65536
		parallelism := 4
		kdfParams := models.KDFParams{
			Type:        models.KDFTypeArgon2id,
			Iterations:  3,
			MemoryKiB:   &memKiB,
			Parallelism: &parallelism,
		}

		masterSecret, _ := crypto.DerivePasswordSecret(password, username, kdfParams)
		loginVerifier, _ := crypto.DeriveLoginVerifier(masterSecret)
		accountKey, _ := crypto.GenerateRandomBytes(32)

		// Register
		registerReq := map[string]interface{}{
			"username":       username,
			"kdfType":        string(kdfParams.Type),
			"kdfIterations":  kdfParams.Iterations,
			"kdfMemoryKiB":   *kdfParams.MemoryKiB,
			"kdfParallelism": *kdfParams.Parallelism,
			"loginVerifier":  crypto.EncodeBase64(loginVerifier),
			"wrappedAccountKey": models.Container{
				Nonce:      crypto.EncodeBase64([]byte("test-nonce-12345")),
				Ciphertext: crypto.EncodeBase64(accountKey),
				Tag:        crypto.EncodeBase64([]byte("test-tag-16bytes")),
			},
		}

		body, _ := json.Marshal(registerReq)
		req := httptest.NewRequest("POST", "/v1/auth/register", bytes.NewReader(body))
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		// Login
		verifyReq := map[string]interface{}{
			"username":      username,
			"loginVerifier": crypto.EncodeBase64(loginVerifier),
		}

		body, _ = json.Marshal(verifyReq)
		req = httptest.NewRequest("POST", "/v1/auth/verify", bytes.NewReader(body))
		w = httptest.NewRecorder()
		router.ServeHTTP(w, req)

		var verifyResp map[string]interface{}
		json.NewDecoder(w.Body).Decode(&verifyResp)
		return verifyResp["token"].(string)
	}

	// Create two users
	aliceToken := registerAndLogin("alice", "alice-password")
	bobToken := registerAndLogin("bob", "bob-password")

	// Alice creates a blob
	blobReq := map[string]interface{}{
		"encryptedBlob": map[string]string{
			"nonce":      crypto.EncodeBase64([]byte("alice-nonce-1234")),
			"ciphertext": crypto.EncodeBase64([]byte("alice-secret-data")),
			"tag":        crypto.EncodeBase64([]byte("alice-tag-16byte")),
		},
	}

	body, _ := json.Marshal(blobReq)
	req := httptest.NewRequest("PUT", "/v1/blobs/secret", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+aliceToken)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("alice failed to create blob: %d", w.Code)
	}

	// Bob tries to access Alice's blob (should fail)
	t.Run("BobCannotAccessAliceBlob", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/v1/blobs/secret", nil)
		req.Header.Set("Authorization", "Bearer "+bobToken)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusNotFound {
			t.Errorf("expected 404, got %d (Bob should not see Alice's blob)", w.Code)
		}

		t.Logf("Bob correctly cannot access Alice's blob")
	})

	// Alice can still access her blob
	t.Run("AliceCanAccessOwnBlob", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/v1/blobs/secret", nil)
		req.Header.Set("Authorization", "Bearer "+aliceToken)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Errorf("expected 200, got %d (Alice should access her own blob)", w.Code)
		}

		t.Logf("Alice can access her own blob")
	})
}
