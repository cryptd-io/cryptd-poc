package db

import (
	"os"
	"testing"

	"github.com/shalteor/cryptd-poc/backend/internal/models"
)

func setupTestDB(t *testing.T) *DB {
	t.Helper()

	// Create temporary database
	db, err := New(":memory:")
	if err != nil {
		t.Fatalf("failed to create test database: %v", err)
	}

	return db
}

func TestCreateUser(t *testing.T) {
	db := setupTestDB(t)
	defer func() { _ = db.Close() }()

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
			Nonce:      "nonce123",
			Ciphertext: "ciphertext123",
			Tag:        "tag123",
		},
	}

	err := db.CreateUser(user)
	if err != nil {
		t.Fatalf("failed to create user: %v", err)
	}

	if user.ID == 0 {
		t.Error("user ID not set after creation")
	}

	if user.CreatedAt.IsZero() {
		t.Error("created_at not set")
	}

	if user.UpdatedAt.IsZero() {
		t.Error("updated_at not set")
	}
}

func TestCreateUserDuplicate(t *testing.T) {
	db := setupTestDB(t)
	defer func() { _ = db.Close() }()

	user1 := &models.User{
		Username:          "alice",
		KDFType:           models.KDFTypePBKDF2SHA256,
		KDFIterations:     600_000,
		LoginVerifierHash: []byte("test-hash"),
		WrappedAccountKey: models.Container{
			Nonce:      "nonce1",
			Ciphertext: "ciphertext1",
			Tag:        "tag1",
		},
	}

	err := db.CreateUser(user1)
	if err != nil {
		t.Fatalf("failed to create first user: %v", err)
	}

	user2 := &models.User{
		Username:          "alice",
		KDFType:           models.KDFTypePBKDF2SHA256,
		KDFIterations:     600_000,
		LoginVerifierHash: []byte("test-hash2"),
		WrappedAccountKey: models.Container{
			Nonce:      "nonce2",
			Ciphertext: "ciphertext2",
			Tag:        "tag2",
		},
	}

	err = db.CreateUser(user2)
	if err != ErrUserExists {
		t.Errorf("expected ErrUserExists, got %v", err)
	}
}

func TestGetUserByUsername(t *testing.T) {
	db := setupTestDB(t)
	defer func() { _ = db.Close() }()

	memKiB := 65536
	parallelism := 4

	original := &models.User{
		Username:          "alice",
		KDFType:           models.KDFTypeArgon2id,
		KDFIterations:     3,
		KDFMemoryKiB:      &memKiB,
		KDFParallelism:    &parallelism,
		LoginVerifierHash: []byte("test-hash"),
		WrappedAccountKey: models.Container{
			Nonce:      "nonce123",
			Ciphertext: "ciphertext123",
			Tag:        "tag123",
		},
	}

	err := db.CreateUser(original)
	if err != nil {
		t.Fatalf("failed to create user: %v", err)
	}

	retrieved, err := db.GetUserByUsername("alice")
	if err != nil {
		t.Fatalf("failed to get user: %v", err)
	}

	if retrieved.ID != original.ID {
		t.Errorf("ID mismatch: expected %d, got %d", original.ID, retrieved.ID)
	}

	if retrieved.Username != original.Username {
		t.Errorf("username mismatch: expected %s, got %s", original.Username, retrieved.Username)
	}

	if retrieved.KDFType != original.KDFType {
		t.Errorf("KDF type mismatch: expected %s, got %s", original.KDFType, retrieved.KDFType)
	}

	if string(retrieved.LoginVerifierHash) != string(original.LoginVerifierHash) {
		t.Error("login verifier hash mismatch")
	}
}

func TestGetUserByUsernameNotFound(t *testing.T) {
	db := setupTestDB(t)
	defer func() { _ = db.Close() }()

	_, err := db.GetUserByUsername("nonexistent")
	if err != ErrUserNotFound {
		t.Errorf("expected ErrUserNotFound, got %v", err)
	}
}

func TestGetUserByID(t *testing.T) {
	db := setupTestDB(t)
	defer func() { _ = db.Close() }()

	user := &models.User{
		Username:          "alice",
		KDFType:           models.KDFTypePBKDF2SHA256,
		KDFIterations:     600_000,
		LoginVerifierHash: []byte("test-hash"),
		WrappedAccountKey: models.Container{
			Nonce:      "nonce123",
			Ciphertext: "ciphertext123",
			Tag:        "tag123",
		},
	}

	err := db.CreateUser(user)
	if err != nil {
		t.Fatalf("failed to create user: %v", err)
	}

	retrieved, err := db.GetUserByID(user.ID)
	if err != nil {
		t.Fatalf("failed to get user: %v", err)
	}

	if retrieved.Username != user.Username {
		t.Errorf("username mismatch: expected %s, got %s", user.Username, retrieved.Username)
	}
}

func TestUpdateUser(t *testing.T) {
	db := setupTestDB(t)
	defer func() { _ = db.Close() }()

	user := &models.User{
		Username:          "alice",
		KDFType:           models.KDFTypePBKDF2SHA256,
		KDFIterations:     600_000,
		LoginVerifierHash: []byte("test-hash"),
		WrappedAccountKey: models.Container{
			Nonce:      "nonce123",
			Ciphertext: "ciphertext123",
			Tag:        "tag123",
		},
	}

	err := db.CreateUser(user)
	if err != nil {
		t.Fatalf("failed to create user: %v", err)
	}

	// Update user
	user.Username = "alice-new"
	user.LoginVerifierHash = []byte("new-hash")
	user.WrappedAccountKey.Nonce = "new-nonce"

	err = db.UpdateUser(user)
	if err != nil {
		t.Fatalf("failed to update user: %v", err)
	}

	// Retrieve and verify
	updated, err := db.GetUserByID(user.ID)
	if err != nil {
		t.Fatalf("failed to get updated user: %v", err)
	}

	if updated.Username != "alice-new" {
		t.Errorf("username not updated: expected alice-new, got %s", updated.Username)
	}

	if string(updated.LoginVerifierHash) != "new-hash" {
		t.Error("login verifier hash not updated")
	}

	if updated.WrappedAccountKey.Nonce != "new-nonce" {
		t.Error("wrapped account key not updated")
	}
}

func TestUpsertBlob(t *testing.T) {
	db := setupTestDB(t)
	defer func() { _ = db.Close() }()

	// Create user first
	user := &models.User{
		Username:          "alice",
		KDFType:           models.KDFTypePBKDF2SHA256,
		KDFIterations:     600_000,
		LoginVerifierHash: []byte("test-hash"),
		WrappedAccountKey: models.Container{
			Nonce:      "nonce",
			Ciphertext: "ciphertext",
			Tag:        "tag",
		},
	}

	err := db.CreateUser(user)
	if err != nil {
		t.Fatalf("failed to create user: %v", err)
	}

	// Insert blob
	blob := &models.Blob{
		UserID:   user.ID,
		BlobName: "vault",
		EncryptedBlob: models.Container{
			Nonce:      "blob-nonce",
			Ciphertext: "blob-ciphertext",
			Tag:        "blob-tag",
		},
	}

	err = db.UpsertBlob(blob)
	if err != nil {
		t.Fatalf("failed to upsert blob: %v", err)
	}

	if blob.ID == 0 {
		t.Error("blob ID not set after creation")
	}

	// Update blob
	blob.EncryptedBlob.Ciphertext = "updated-ciphertext"
	err = db.UpsertBlob(blob)
	if err != nil {
		t.Fatalf("failed to update blob: %v", err)
	}

	// Retrieve and verify
	retrieved, err := db.GetBlob(user.ID, "vault")
	if err != nil {
		t.Fatalf("failed to get blob: %v", err)
	}

	if retrieved.EncryptedBlob.Ciphertext != "updated-ciphertext" {
		t.Error("blob ciphertext not updated")
	}
}

func TestGetBlob(t *testing.T) {
	db := setupTestDB(t)
	defer func() { _ = db.Close() }()

	user := &models.User{
		Username:          "alice",
		KDFType:           models.KDFTypePBKDF2SHA256,
		KDFIterations:     600_000,
		LoginVerifierHash: []byte("test-hash"),
		WrappedAccountKey: models.Container{
			Nonce:      "nonce",
			Ciphertext: "ciphertext",
			Tag:        "tag",
		},
	}

	err := db.CreateUser(user)
	if err != nil {
		t.Fatalf("failed to create user: %v", err)
	}

	blob := &models.Blob{
		UserID:   user.ID,
		BlobName: "vault",
		EncryptedBlob: models.Container{
			Nonce:      "blob-nonce",
			Ciphertext: "blob-ciphertext",
			Tag:        "blob-tag",
		},
	}

	err = db.UpsertBlob(blob)
	if err != nil {
		t.Fatalf("failed to upsert blob: %v", err)
	}

	retrieved, err := db.GetBlob(user.ID, "vault")
	if err != nil {
		t.Fatalf("failed to get blob: %v", err)
	}

	if retrieved.BlobName != "vault" {
		t.Errorf("blob name mismatch: expected vault, got %s", retrieved.BlobName)
	}

	if retrieved.EncryptedBlob.Ciphertext != "blob-ciphertext" {
		t.Error("blob ciphertext mismatch")
	}
}

func TestGetBlobNotFound(t *testing.T) {
	db := setupTestDB(t)
	defer func() { _ = db.Close() }()

	user := &models.User{
		Username:          "alice",
		KDFType:           models.KDFTypePBKDF2SHA256,
		KDFIterations:     600_000,
		LoginVerifierHash: []byte("test-hash"),
		WrappedAccountKey: models.Container{
			Nonce:      "nonce",
			Ciphertext: "ciphertext",
			Tag:        "tag",
		},
	}

	err := db.CreateUser(user)
	if err != nil {
		t.Fatalf("failed to create user: %v", err)
	}

	_, err = db.GetBlob(user.ID, "nonexistent")
	if err != ErrBlobNotFound {
		t.Errorf("expected ErrBlobNotFound, got %v", err)
	}
}

func TestListBlobs(t *testing.T) {
	db := setupTestDB(t)
	defer func() { _ = db.Close() }()

	user := &models.User{
		Username:          "alice",
		KDFType:           models.KDFTypePBKDF2SHA256,
		KDFIterations:     600_000,
		LoginVerifierHash: []byte("test-hash"),
		WrappedAccountKey: models.Container{
			Nonce:      "nonce",
			Ciphertext: "ciphertext",
			Tag:        "tag",
		},
	}

	err := db.CreateUser(user)
	if err != nil {
		t.Fatalf("failed to create user: %v", err)
	}

	// Create multiple blobs
	blobs := []string{"vault", "notes", "journal"}
	for _, name := range blobs {
		blob := &models.Blob{
			UserID:   user.ID,
			BlobName: name,
			EncryptedBlob: models.Container{
				Nonce:      "nonce-" + name,
				Ciphertext: "Y2lwaGVydGV4dC0=", // base64 encoded
				Tag:        "tag-" + name,
			},
		}
		err = db.UpsertBlob(blob)
		if err != nil {
			t.Fatalf("failed to create blob %s: %v", name, err)
		}
	}

	// List blobs
	list, err := db.ListBlobs(user.ID)
	if err != nil {
		t.Fatalf("failed to list blobs: %v", err)
	}

	if len(list) != 3 {
		t.Errorf("expected 3 blobs, got %d", len(list))
	}

	// Verify ordering (should be by blob name)
	if list[0].BlobName != "journal" {
		t.Errorf("expected first blob to be 'journal', got %s", list[0].BlobName)
	}

	// Verify encrypted size is calculated
	if list[0].EncryptedSize == 0 {
		t.Error("encrypted size not calculated")
	}
}

func TestDeleteBlob(t *testing.T) {
	db := setupTestDB(t)
	defer func() { _ = db.Close() }()

	user := &models.User{
		Username:          "alice",
		KDFType:           models.KDFTypePBKDF2SHA256,
		KDFIterations:     600_000,
		LoginVerifierHash: []byte("test-hash"),
		WrappedAccountKey: models.Container{
			Nonce:      "nonce",
			Ciphertext: "ciphertext",
			Tag:        "tag",
		},
	}

	err := db.CreateUser(user)
	if err != nil {
		t.Fatalf("failed to create user: %v", err)
	}

	blob := &models.Blob{
		UserID:   user.ID,
		BlobName: "vault",
		EncryptedBlob: models.Container{
			Nonce:      "nonce",
			Ciphertext: "ciphertext",
			Tag:        "tag",
		},
	}

	err = db.UpsertBlob(blob)
	if err != nil {
		t.Fatalf("failed to create blob: %v", err)
	}

	// Delete blob
	err = db.DeleteBlob(user.ID, "vault")
	if err != nil {
		t.Fatalf("failed to delete blob: %v", err)
	}

	// Verify deletion
	_, err = db.GetBlob(user.ID, "vault")
	if err != ErrBlobNotFound {
		t.Errorf("expected ErrBlobNotFound after deletion, got %v", err)
	}
}

func TestDeleteBlobNotFound(t *testing.T) {
	db := setupTestDB(t)
	defer func() { _ = db.Close() }()

	user := &models.User{
		Username:          "alice",
		KDFType:           models.KDFTypePBKDF2SHA256,
		KDFIterations:     600_000,
		LoginVerifierHash: []byte("test-hash"),
		WrappedAccountKey: models.Container{
			Nonce:      "nonce",
			Ciphertext: "ciphertext",
			Tag:        "tag",
		},
	}

	err := db.CreateUser(user)
	if err != nil {
		t.Fatalf("failed to create user: %v", err)
	}

	err = db.DeleteBlob(user.ID, "nonexistent")
	if err != ErrBlobNotFound {
		t.Errorf("expected ErrBlobNotFound, got %v", err)
	}
}

func TestMain(m *testing.M) {
	// Run tests
	code := m.Run()
	os.Exit(code)
}
