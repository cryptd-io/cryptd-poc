package api

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"golang.org/x/crypto/argon2"
	"golang.org/x/crypto/hkdf"
	"golang.org/x/crypto/sha3"
)

// TestIntegrationRealUsage tests the complete flow with real cryptographic operations
// This mimics what a real client application would do:
// 1. Generate keys from password
// 2. Create account with wrapped UEK
// 3. Login and unwrap UEK
// 4. Upload encrypted blob with wrapped DEK
// 5. Download and decrypt blob
// 6. Verify plaintext matches original
func TestIntegrationRealUsage(t *testing.T) {
	database := setupTestDB(t)
	defer database.Close()

	server := NewServer(database)
	router := server.Router()

	// Test data
	password := "my-super-secret-password-12345"
	username := "alice_integration_" + uuid.New().String()[:8]
	plaintextData := []byte("This is my secret data that should be encrypted end-to-end!")

	t.Log("=== Starting Integration Test with Real Cryptography ===")
	t.Logf("Username: %s", username)
	t.Logf("Password: %s", password)
	t.Logf("Plaintext length: %d bytes", len(plaintextData))

	// ===================================================================
	// STEP 1: Client-side key generation (Registration)
	// ===================================================================
	t.Log("\n--- STEP 1: Generate Keys for Registration ---")

	// Generate KDF salt
	kdfSalt := make([]byte, 16)
	if _, err := io.ReadFull(rand.Reader, kdfSalt); err != nil {
		t.Fatalf("Failed to generate KDF salt: %v", err)
	}

	// Derive ROOT key from password using Argon2id (client parameters)
	const (
		clientArgon2Time    = uint32(3)
		clientArgon2Memory  = uint32(65536) // 64 MiB
		clientArgon2Threads = uint8(1)
		clientArgon2KeyLen  = uint32(32)
	)

	rootKey := argon2.IDKey(
		[]byte(password),
		kdfSalt,
		clientArgon2Time,
		clientArgon2Memory,
		clientArgon2Threads,
		clientArgon2KeyLen,
	)
	t.Logf("ROOT key derived (%d bytes)", len(rootKey))

	// Derive AUTH_KEY and K_WRAP from ROOT using HKDF
	authKey := deriveKey(rootKey, []byte("auth-key"), 32)
	kWrap := deriveKey(rootKey, []byte("wrap-key"), 32)
	t.Logf("AUTH_KEY derived (%d bytes)", len(authKey))
	t.Logf("K_WRAP derived (%d bytes)", len(kWrap))

	// Generate UEK (User Encryption Key)
	uek := make([]byte, 32)
	if _, err := io.ReadFull(rand.Reader, uek); err != nil {
		t.Fatalf("Failed to generate UEK: %v", err)
	}
	t.Logf("UEK generated (%d bytes)", len(uek))

	// Wrap UEK with K_WRAP using AES-256-GCM
	wrappedUEKCiphertext, wrappedUEKNonce, err := encryptAESGCM(kWrap, uek)
	if err != nil {
		t.Fatalf("Failed to wrap UEK: %v", err)
	}
	t.Logf("UEK wrapped (ciphertext: %d bytes, nonce: %d bytes)", len(wrappedUEKCiphertext), len(wrappedUEKNonce))

	// ===================================================================
	// STEP 2: Register user
	// ===================================================================
	t.Log("\n--- STEP 2: Register User ---")

	registerReq := RegisterRequest{
		Username: username,
		KDF: KDFParams{
			Type:        "argon2id",
			SaltB64:     base64.StdEncoding.EncodeToString(kdfSalt),
			MemoryKiB:   int(clientArgon2Memory),
			Iterations:  int(clientArgon2Time),
			Parallelism: int(clientArgon2Threads),
		},
		AuthVerifierB64: base64.StdEncoding.EncodeToString(authKey),
		WrappedUEK: WrappedKey{
			Alg:           "A256GCM",
			NonceB64:      base64.StdEncoding.EncodeToString(wrappedUEKNonce),
			CiphertextB64: base64.StdEncoding.EncodeToString(wrappedUEKCiphertext),
		},
	}

	var buf bytes.Buffer
	json.NewEncoder(&buf).Encode(registerReq)

	httpReq := httptest.NewRequest("POST", "/v1/register", &buf)
	httpReq.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	router.ServeHTTP(rr, httpReq)

	if rr.Code != 201 {
		t.Fatalf("Registration failed with status %d: %s", rr.Code, rr.Body.String())
	}

	var registerResp RegisterResponse
	if err := json.NewDecoder(rr.Body).Decode(&registerResp); err != nil {
		t.Fatalf("Failed to decode register response: %v", err)
	}

	t.Logf("✓ User registered successfully (user_id: %s)", registerResp.UserID)

	// ===================================================================
	// STEP 3: Login and unwrap UEK
	// ===================================================================
	t.Log("\n--- STEP 3: Login and Unwrap UEK ---")

	// Re-derive AUTH_KEY from password (simulating login on a new session)
	rootKeyLogin := argon2.IDKey(
		[]byte(password),
		kdfSalt,
		clientArgon2Time,
		clientArgon2Memory,
		clientArgon2Threads,
		clientArgon2KeyLen,
	)
	authKeyLogin := deriveKey(rootKeyLogin, []byte("auth-key"), 32)
	kWrapLogin := deriveKey(rootKeyLogin, []byte("wrap-key"), 32)
	t.Logf("Keys re-derived for login")

	loginReq := LoginRequest{
		Username:        username,
		AuthVerifierB64: base64.StdEncoding.EncodeToString(authKeyLogin),
	}

	buf.Reset()
	json.NewEncoder(&buf).Encode(loginReq)

	httpReq = httptest.NewRequest("POST", "/v1/login", &buf)
	httpReq.Header.Set("Content-Type", "application/json")
	rr = httptest.NewRecorder()

	router.ServeHTTP(rr, httpReq)

	if rr.Code != 200 {
		t.Fatalf("Login failed with status %d: %s", rr.Code, rr.Body.String())
	}

	var loginResp LoginResponse
	if err := json.NewDecoder(rr.Body).Decode(&loginResp); err != nil {
		t.Fatalf("Failed to decode login response: %v", err)
	}

	token := loginResp.Token
	t.Logf("✓ Login successful (token: %s...)", token[:16])

	// Unwrap UEK from server response
	wrappedUEKCiphertextFromServer, err := base64.StdEncoding.DecodeString(loginResp.User.WrappedUEK.CiphertextB64)
	if err != nil {
		t.Fatalf("Failed to decode wrapped UEK ciphertext: %v", err)
	}

	wrappedUEKNonceFromServer, err := base64.StdEncoding.DecodeString(loginResp.User.WrappedUEK.NonceB64)
	if err != nil {
		t.Fatalf("Failed to decode wrapped UEK nonce: %v", err)
	}

	unwrappedUEK, err := decryptAESGCM(kWrapLogin, wrappedUEKCiphertextFromServer, wrappedUEKNonceFromServer)
	if err != nil {
		t.Fatalf("Failed to unwrap UEK: %v", err)
	}

	if !bytes.Equal(unwrappedUEK, uek) {
		t.Fatalf("Unwrapped UEK doesn't match original! Expected %x, got %x", uek, unwrappedUEK)
	}

	t.Logf("✓ UEK unwrapped successfully and matches original")

	// ===================================================================
	// STEP 4: Encrypt and upload blob
	// ===================================================================
	t.Log("\n--- STEP 4: Encrypt and Upload Blob ---")

	blobID := uuid.New().String()
	t.Logf("Blob ID: %s", blobID)
	t.Logf("Plaintext: %s", string(plaintextData))

	// Generate DEK (Data Encryption Key)
	dek := make([]byte, 32)
	if _, err := io.ReadFull(rand.Reader, dek); err != nil {
		t.Fatalf("Failed to generate DEK: %v", err)
	}
	t.Logf("DEK generated (%d bytes)", len(dek))

	// Wrap DEK with UEK
	wrappedDEKCiphertext, wrappedDEKNonce, err := encryptAESGCM(unwrappedUEK, dek)
	if err != nil {
		t.Fatalf("Failed to wrap DEK: %v", err)
	}
	t.Logf("DEK wrapped (ciphertext: %d bytes, nonce: %d bytes)", len(wrappedDEKCiphertext), len(wrappedDEKNonce))

	// Encrypt plaintext data with DEK
	blobCiphertext, blobNonce, err := encryptAESGCM(dek, plaintextData)
	if err != nil {
		t.Fatalf("Failed to encrypt blob: %v", err)
	}
	t.Logf("Blob encrypted (ciphertext: %d bytes, nonce: %d bytes)", len(blobCiphertext), len(blobNonce))

	// Upload blob
	putBlobReq := BlobRequest{
		WrappedDEK: WrappedKey{
			Alg:           "A256GCM",
			NonceB64:      base64.StdEncoding.EncodeToString(wrappedDEKNonce),
			CiphertextB64: base64.StdEncoding.EncodeToString(wrappedDEKCiphertext),
		},
		Blob: BlobData{
			Alg:           "A256GCM",
			NonceB64:      base64.StdEncoding.EncodeToString(blobNonce),
			CiphertextB64: base64.StdEncoding.EncodeToString(blobCiphertext),
		},
		Version: 1,
	}

	buf.Reset()
	json.NewEncoder(&buf).Encode(putBlobReq)

	httpReq = httptest.NewRequest("PUT", "/v1/blobs/"+blobID, &buf)
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+token)
	httpReq.SetPathValue("blob_id", blobID)
	rr = httptest.NewRecorder()

	router.ServeHTTP(rr, httpReq)

	if rr.Code != 201 {
		t.Fatalf("Blob upload failed with status %d: %s", rr.Code, rr.Body.String())
	}

	t.Logf("✓ Blob uploaded successfully")

	// ===================================================================
	// STEP 5: Download and decrypt blob
	// ===================================================================
	t.Log("\n--- STEP 5: Download and Decrypt Blob ---")

	httpReq = httptest.NewRequest("GET", "/v1/blobs/"+blobID, nil)
	httpReq.Header.Set("Authorization", "Bearer "+token)
	httpReq.SetPathValue("blob_id", blobID)
	rr = httptest.NewRecorder()

	router.ServeHTTP(rr, httpReq)

	if rr.Code != 200 {
		t.Fatalf("Blob download failed with status %d: %s", rr.Code, rr.Body.String())
	}

	var getBlobResp BlobResponse
	if err := json.NewDecoder(rr.Body).Decode(&getBlobResp); err != nil {
		t.Fatalf("Failed to decode blob response: %v", err)
	}

	t.Logf("✓ Blob downloaded successfully")

	// Decode wrapped DEK
	downloadedWrappedDEKCiphertext, err := base64.StdEncoding.DecodeString(getBlobResp.WrappedDEK.CiphertextB64)
	if err != nil {
		t.Fatalf("Failed to decode wrapped DEK ciphertext: %v", err)
	}

	downloadedWrappedDEKNonce, err := base64.StdEncoding.DecodeString(getBlobResp.WrappedDEK.NonceB64)
	if err != nil {
		t.Fatalf("Failed to decode wrapped DEK nonce: %v", err)
	}

	// Unwrap DEK with UEK
	unwrappedDEK, err := decryptAESGCM(unwrappedUEK, downloadedWrappedDEKCiphertext, downloadedWrappedDEKNonce)
	if err != nil {
		t.Fatalf("Failed to unwrap DEK: %v", err)
	}
	t.Logf("✓ DEK unwrapped (%d bytes)", len(unwrappedDEK))

	// Decode blob ciphertext
	downloadedBlobCiphertext, err := base64.StdEncoding.DecodeString(getBlobResp.Blob.CiphertextB64)
	if err != nil {
		t.Fatalf("Failed to decode blob ciphertext: %v", err)
	}

	downloadedBlobNonce, err := base64.StdEncoding.DecodeString(getBlobResp.Blob.NonceB64)
	if err != nil {
		t.Fatalf("Failed to decode blob nonce: %v", err)
	}

	// Decrypt blob with unwrapped DEK
	decryptedPlaintext, err := decryptAESGCM(unwrappedDEK, downloadedBlobCiphertext, downloadedBlobNonce)
	if err != nil {
		t.Fatalf("Failed to decrypt blob: %v", err)
	}
	t.Logf("✓ Blob decrypted (%d bytes)", len(decryptedPlaintext))

	// ===================================================================
	// STEP 6: Verify decrypted data matches original
	// ===================================================================
	t.Log("\n--- STEP 6: Verify Decrypted Data ---")

	if !bytes.Equal(decryptedPlaintext, plaintextData) {
		t.Fatalf("Decrypted data doesn't match original!\nExpected: %s\nGot: %s",
			string(plaintextData), string(decryptedPlaintext))
	}

	t.Logf("✓ Decrypted plaintext matches original!")
	t.Logf("   Original:  %s", string(plaintextData))
	t.Logf("   Decrypted: %s", string(decryptedPlaintext))

	// ===================================================================
	// STEP 7: Additional verification - List blobs
	// ===================================================================
	t.Log("\n--- STEP 7: List Blobs ---")

	httpReq = httptest.NewRequest("GET", "/v1/blobs?limit=10", nil)
	httpReq.Header.Set("Authorization", "Bearer "+token)
	rr = httptest.NewRecorder()

	router.ServeHTTP(rr, httpReq)

	if rr.Code != 200 {
		t.Fatalf("List blobs failed with status %d: %s", rr.Code, rr.Body.String())
	}

	var listResp BlobListResponse
	if err := json.NewDecoder(rr.Body).Decode(&listResp); err != nil {
		t.Fatalf("Failed to decode list response: %v", err)
	}

	if len(listResp.Items) != 1 {
		t.Fatalf("Expected 1 blob in list, got %d", len(listResp.Items))
	}

	if listResp.Items[0].BlobID != blobID {
		t.Fatalf("Blob ID mismatch in list. Expected %s, got %s", blobID, listResp.Items[0].BlobID)
	}

	t.Logf("✓ Blob list verified (1 blob found)")

	// ===================================================================
	// STEP 8: Update blob with new data
	// ===================================================================
	t.Log("\n--- STEP 8: Update Blob with New Data ---")

	newPlaintextData := []byte("This is UPDATED secret data!")
	t.Logf("New plaintext: %s", string(newPlaintextData))

	// Generate new DEK for updated blob
	newDEK := make([]byte, 32)
	if _, err := io.ReadFull(rand.Reader, newDEK); err != nil {
		t.Fatalf("Failed to generate new DEK: %v", err)
	}

	// Wrap new DEK with UEK
	newWrappedDEKCiphertext, newWrappedDEKNonce, err := encryptAESGCM(unwrappedUEK, newDEK)
	if err != nil {
		t.Fatalf("Failed to wrap new DEK: %v", err)
	}

	// Encrypt new plaintext with new DEK
	newBlobCiphertext, newBlobNonce, err := encryptAESGCM(newDEK, newPlaintextData)
	if err != nil {
		t.Fatalf("Failed to encrypt new blob: %v", err)
	}

	// Update blob
	updateBlobReq := BlobRequest{
		WrappedDEK: WrappedKey{
			Alg:           "A256GCM",
			NonceB64:      base64.StdEncoding.EncodeToString(newWrappedDEKNonce),
			CiphertextB64: base64.StdEncoding.EncodeToString(newWrappedDEKCiphertext),
		},
		Blob: BlobData{
			Alg:           "A256GCM",
			NonceB64:      base64.StdEncoding.EncodeToString(newBlobNonce),
			CiphertextB64: base64.StdEncoding.EncodeToString(newBlobCiphertext),
		},
		Version: 2,
	}

	buf.Reset()
	json.NewEncoder(&buf).Encode(updateBlobReq)

	httpReq = httptest.NewRequest("PUT", "/v1/blobs/"+blobID, &buf)
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+token)
	httpReq.SetPathValue("blob_id", blobID)
	rr = httptest.NewRecorder()

	router.ServeHTTP(rr, httpReq)

	if rr.Code != 200 {
		t.Fatalf("Blob update failed with status %d: %s", rr.Code, rr.Body.String())
	}

	t.Logf("✓ Blob updated successfully")

	// Download and verify updated blob
	httpReq = httptest.NewRequest("GET", "/v1/blobs/"+blobID, nil)
	httpReq.Header.Set("Authorization", "Bearer "+token)
	httpReq.SetPathValue("blob_id", blobID)
	rr = httptest.NewRecorder()

	router.ServeHTTP(rr, httpReq)

	if rr.Code != 200 {
		t.Fatalf("Updated blob download failed: %s", rr.Body.String())
	}

	json.NewDecoder(rr.Body).Decode(&getBlobResp)

	// Decrypt updated blob
	updatedWrappedDEKCiphertext, _ := base64.StdEncoding.DecodeString(getBlobResp.WrappedDEK.CiphertextB64)
	updatedWrappedDEKNonce, _ := base64.StdEncoding.DecodeString(getBlobResp.WrappedDEK.NonceB64)
	updatedUnwrappedDEK, err := decryptAESGCM(unwrappedUEK, updatedWrappedDEKCiphertext, updatedWrappedDEKNonce)
	if err != nil {
		t.Fatalf("Failed to unwrap updated DEK: %v", err)
	}

	updatedBlobCiphertext, _ := base64.StdEncoding.DecodeString(getBlobResp.Blob.CiphertextB64)
	updatedBlobNonce, _ := base64.StdEncoding.DecodeString(getBlobResp.Blob.NonceB64)
	updatedDecryptedPlaintext, err := decryptAESGCM(updatedUnwrappedDEK, updatedBlobCiphertext, updatedBlobNonce)
	if err != nil {
		t.Fatalf("Failed to decrypt updated blob: %v", err)
	}

	if !bytes.Equal(updatedDecryptedPlaintext, newPlaintextData) {
		t.Fatalf("Updated decrypted data doesn't match!\nExpected: %s\nGot: %s",
			string(newPlaintextData), string(updatedDecryptedPlaintext))
	}

	t.Logf("✓ Updated blob decrypted correctly: %s", string(updatedDecryptedPlaintext))

	// ===================================================================
	// STEP 9: Delete blob and verify
	// ===================================================================
	t.Log("\n--- STEP 9: Delete Blob ---")

	httpReq = httptest.NewRequest("DELETE", "/v1/blobs/"+blobID, nil)
	httpReq.Header.Set("Authorization", "Bearer "+token)
	httpReq.SetPathValue("blob_id", blobID)
	rr = httptest.NewRecorder()

	router.ServeHTTP(rr, httpReq)

	if rr.Code != 204 {
		t.Fatalf("Blob deletion failed with status %d: %s", rr.Code, rr.Body.String())
	}

	t.Logf("✓ Blob deleted successfully")

	// Verify blob is gone
	httpReq = httptest.NewRequest("GET", "/v1/blobs/"+blobID, nil)
	httpReq.Header.Set("Authorization", "Bearer "+token)
	httpReq.SetPathValue("blob_id", blobID)
	rr = httptest.NewRecorder()

	router.ServeHTTP(rr, httpReq)

	if rr.Code != 404 {
		t.Fatalf("Expected 404 after deletion, got %d", rr.Code)
	}

	t.Logf("✓ Verified blob is deleted (404)")

	t.Log("\n=== ✅ Integration Test Complete - All Steps Passed ===")
	t.Log("Summary:")
	t.Log("  ✓ Key derivation (Argon2id + HKDF)")
	t.Log("  ✓ User registration with wrapped UEK")
	t.Log("  ✓ Login and UEK unwrapping")
	t.Log("  ✓ Blob encryption and upload with wrapped DEK")
	t.Log("  ✓ Blob download and decryption")
	t.Log("  ✓ Plaintext verification")
	t.Log("  ✓ Blob listing")
	t.Log("  ✓ Blob update with new encryption")
	t.Log("  ✓ Blob deletion and verification")
}

// ===================================================================
// Cryptographic Helper Functions
// ===================================================================

// deriveKey uses HKDF-SHA3-256 to derive a key from a master key
func deriveKey(masterKey, info []byte, length int) []byte {
	kdf := hkdf.New(sha3.New256, masterKey, nil, info)
	key := make([]byte, length)
	if _, err := io.ReadFull(kdf, key); err != nil {
		panic(err)
	}
	return key
}

// encryptAESGCM encrypts plaintext using AES-256-GCM
// Returns (ciphertext, nonce, error)
func encryptAESGCM(key, plaintext []byte) ([]byte, []byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, nil, err
	}

	aesgcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, nil, err
	}

	// Generate random nonce
	nonce := make([]byte, aesgcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, nil, err
	}

	ciphertext := aesgcm.Seal(nil, nonce, plaintext, nil)
	return ciphertext, nonce, nil
}

// decryptAESGCM decrypts ciphertext using AES-256-GCM
func decryptAESGCM(key, ciphertext, nonce []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}

	aesgcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}

	plaintext, err := aesgcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return nil, err
	}

	return plaintext, nil
}

// TestCryptographicPrimitives tests the crypto helper functions
func TestCryptographicPrimitives(t *testing.T) {
	t.Run("HKDF key derivation", func(t *testing.T) {
		masterKey := []byte("master-key-32-bytes-long!!!!!!!")
		key1 := deriveKey(masterKey, []byte("context-1"), 32)
		key2 := deriveKey(masterKey, []byte("context-2"), 32)
		key1Again := deriveKey(masterKey, []byte("context-1"), 32)

		if len(key1) != 32 {
			t.Errorf("Expected 32 bytes, got %d", len(key1))
		}

		if bytes.Equal(key1, key2) {
			t.Error("Keys with different contexts should differ")
		}

		if !bytes.Equal(key1, key1Again) {
			t.Error("Same context should produce same key")
		}
	})

	t.Run("AES-GCM encryption/decryption", func(t *testing.T) {
		key := make([]byte, 32)
		rand.Read(key)

		plaintext := []byte("Hello, World! This is a test message.")

		ciphertext, nonce, err := encryptAESGCM(key, plaintext)
		if err != nil {
			t.Fatalf("Encryption failed: %v", err)
		}

		if len(nonce) != 12 {
			t.Errorf("Expected nonce size 12, got %d", len(nonce))
		}

		if bytes.Equal(ciphertext, plaintext) {
			t.Error("Ciphertext should not equal plaintext")
		}

		decrypted, err := decryptAESGCM(key, ciphertext, nonce)
		if err != nil {
			t.Fatalf("Decryption failed: %v", err)
		}

		if !bytes.Equal(decrypted, plaintext) {
			t.Errorf("Decrypted text doesn't match original.\nExpected: %s\nGot: %s",
				string(plaintext), string(decrypted))
		}
	})

	t.Run("AES-GCM with wrong key", func(t *testing.T) {
		correctKey := make([]byte, 32)
		wrongKey := make([]byte, 32)
		rand.Read(correctKey)
		rand.Read(wrongKey)

		plaintext := []byte("Secret message")

		ciphertext, nonce, err := encryptAESGCM(correctKey, plaintext)
		if err != nil {
			t.Fatalf("Encryption failed: %v", err)
		}

		// Try to decrypt with wrong key
		_, err = decryptAESGCM(wrongKey, ciphertext, nonce)
		if err == nil {
			t.Error("Should fail to decrypt with wrong key")
		}
	})

	t.Run("Argon2id key derivation", func(t *testing.T) {
		password := []byte("my-password")
		salt := make([]byte, 16)
		rand.Read(salt)

		key1 := argon2.IDKey(password, salt, 2, 32768, 2, 32)
		key2 := argon2.IDKey(password, salt, 2, 32768, 2, 32)

		if !bytes.Equal(key1, key2) {
			t.Error("Same password and salt should produce same key")
		}

		differentSalt := make([]byte, 16)
		rand.Read(differentSalt)
		key3 := argon2.IDKey(password, differentSalt, 2, 32768, 2, 32)

		if bytes.Equal(key1, key3) {
			t.Error("Different salts should produce different keys")
		}
	})
}
