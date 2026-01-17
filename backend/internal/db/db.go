package db

import (
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"time"

	"github.com/shalteor/cryptd-poc/backend/internal/models"
	_ "modernc.org/sqlite"
)

var (
	ErrUserNotFound   = errors.New("user not found")
	ErrUserExists     = errors.New("user already exists")
	ErrBlobNotFound   = errors.New("blob not found")
	ErrInvalidKDFType = errors.New("invalid KDF type")
)

type DB struct {
	conn *sql.DB
}

// New creates a new database connection and initializes the schema
func New(dataSourceName string) (*DB, error) {
	conn, err := sql.Open("sqlite3", dataSourceName)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	// Enable foreign keys
	if _, err := conn.Exec("PRAGMA foreign_keys = ON"); err != nil {
		conn.Close()
		return nil, fmt.Errorf("failed to enable foreign keys: %w", err)
	}

	// Initialize schema
	if _, err := conn.Exec(schema); err != nil {
		conn.Close()
		return nil, fmt.Errorf("failed to initialize schema: %w", err)
	}

	return &DB{conn: conn}, nil
}

// Close closes the database connection
func (db *DB) Close() error {
	return db.conn.Close()
}

// CreateUser creates a new user
func (db *DB) CreateUser(user *models.User) error {
	// Validate KDF type
	if user.KDFType != models.KDFTypePBKDF2SHA256 && user.KDFType != models.KDFTypeArgon2id {
		return ErrInvalidKDFType
	}

	query := `
		INSERT INTO users (
			username, kdf_type, kdf_iterations, kdf_memory_kib, kdf_parallelism,
			login_verifier_hash, wrapped_account_key_nonce, wrapped_account_key_ciphertext, 
			wrapped_account_key_tag, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`

	now := time.Now().UTC()
	result, err := db.conn.Exec(
		query,
		user.Username,
		string(user.KDFType),
		user.KDFIterations,
		user.KDFMemoryKiB,
		user.KDFParallelism,
		user.LoginVerifierHash,
		user.WrappedAccountKey.Nonce,
		user.WrappedAccountKey.Ciphertext,
		user.WrappedAccountKey.Tag,
		now,
		now,
	)

	if err != nil {
		if err.Error() == "UNIQUE constraint failed: users.username" {
			return ErrUserExists
		}
		return fmt.Errorf("failed to create user: %w", err)
	}

	id, err := result.LastInsertId()
	if err != nil {
		return fmt.Errorf("failed to get last insert id: %w", err)
	}

	user.ID = id
	user.CreatedAt = now
	user.UpdatedAt = now

	return nil
}

// GetUserByUsername retrieves a user by username
func (db *DB) GetUserByUsername(username string) (*models.User, error) {
	query := `
		SELECT id, username, kdf_type, kdf_iterations, kdf_memory_kib, kdf_parallelism,
			   login_verifier_hash, wrapped_account_key_nonce, wrapped_account_key_ciphertext,
			   wrapped_account_key_tag, created_at, updated_at
		FROM users
		WHERE username = ?
	`

	user := &models.User{}
	var kdfType string

	err := db.conn.QueryRow(query, username).Scan(
		&user.ID,
		&user.Username,
		&kdfType,
		&user.KDFIterations,
		&user.KDFMemoryKiB,
		&user.KDFParallelism,
		&user.LoginVerifierHash,
		&user.WrappedAccountKey.Nonce,
		&user.WrappedAccountKey.Ciphertext,
		&user.WrappedAccountKey.Tag,
		&user.CreatedAt,
		&user.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, ErrUserNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get user: %w", err)
	}

	user.KDFType = models.KDFType(kdfType)
	return user, nil
}

// GetUserByID retrieves a user by ID
func (db *DB) GetUserByID(id int64) (*models.User, error) {
	query := `
		SELECT id, username, kdf_type, kdf_iterations, kdf_memory_kib, kdf_parallelism,
			   login_verifier_hash, wrapped_account_key_nonce, wrapped_account_key_ciphertext,
			   wrapped_account_key_tag, created_at, updated_at
		FROM users
		WHERE id = ?
	`

	user := &models.User{}
	var kdfType string

	err := db.conn.QueryRow(query, id).Scan(
		&user.ID,
		&user.Username,
		&kdfType,
		&user.KDFIterations,
		&user.KDFMemoryKiB,
		&user.KDFParallelism,
		&user.LoginVerifierHash,
		&user.WrappedAccountKey.Nonce,
		&user.WrappedAccountKey.Ciphertext,
		&user.WrappedAccountKey.Tag,
		&user.CreatedAt,
		&user.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, ErrUserNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get user: %w", err)
	}

	user.KDFType = models.KDFType(kdfType)
	return user, nil
}

// UpdateUser updates a user's credentials
func (db *DB) UpdateUser(user *models.User) error {
	query := `
		UPDATE users
		SET username = ?, kdf_type = ?, kdf_iterations = ?, kdf_memory_kib = ?, 
		    kdf_parallelism = ?, login_verifier_hash = ?, wrapped_account_key_nonce = ?,
		    wrapped_account_key_ciphertext = ?, wrapped_account_key_tag = ?, updated_at = ?
		WHERE id = ?
	`

	now := time.Now().UTC()
	result, err := db.conn.Exec(
		query,
		user.Username,
		string(user.KDFType),
		user.KDFIterations,
		user.KDFMemoryKiB,
		user.KDFParallelism,
		user.LoginVerifierHash,
		user.WrappedAccountKey.Nonce,
		user.WrappedAccountKey.Ciphertext,
		user.WrappedAccountKey.Tag,
		now,
		user.ID,
	)

	if err != nil {
		if err.Error() == "UNIQUE constraint failed: users.username" {
			return ErrUserExists
		}
		return fmt.Errorf("failed to update user: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rowsAffected == 0 {
		return ErrUserNotFound
	}

	user.UpdatedAt = now
	return nil
}

// UpsertBlob creates or updates a blob
func (db *DB) UpsertBlob(blob *models.Blob) error {
	query := `
		INSERT INTO blobs (user_id, blob_name, encrypted_blob_nonce, encrypted_blob_ciphertext, 
		                   encrypted_blob_tag, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(user_id, blob_name) DO UPDATE SET
			encrypted_blob_nonce = excluded.encrypted_blob_nonce,
			encrypted_blob_ciphertext = excluded.encrypted_blob_ciphertext,
			encrypted_blob_tag = excluded.encrypted_blob_tag,
			updated_at = excluded.updated_at
		RETURNING id, created_at, updated_at
	`

	now := time.Now().UTC()
	err := db.conn.QueryRow(
		query,
		blob.UserID,
		blob.BlobName,
		blob.EncryptedBlob.Nonce,
		blob.EncryptedBlob.Ciphertext,
		blob.EncryptedBlob.Tag,
		now,
		now,
	).Scan(&blob.ID, &blob.CreatedAt, &blob.UpdatedAt)

	if err != nil {
		return fmt.Errorf("failed to upsert blob: %w", err)
	}

	return nil
}

// GetBlob retrieves a blob by user ID and blob name
func (db *DB) GetBlob(userID int64, blobName string) (*models.Blob, error) {
	query := `
		SELECT id, user_id, blob_name, encrypted_blob_nonce, encrypted_blob_ciphertext,
		       encrypted_blob_tag, created_at, updated_at
		FROM blobs
		WHERE user_id = ? AND blob_name = ?
	`

	blob := &models.Blob{}
	err := db.conn.QueryRow(query, userID, blobName).Scan(
		&blob.ID,
		&blob.UserID,
		&blob.BlobName,
		&blob.EncryptedBlob.Nonce,
		&blob.EncryptedBlob.Ciphertext,
		&blob.EncryptedBlob.Tag,
		&blob.CreatedAt,
		&blob.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, ErrBlobNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get blob: %w", err)
	}

	return blob, nil
}

// ListBlobs retrieves all blob metadata for a user
func (db *DB) ListBlobs(userID int64) ([]models.BlobListItem, error) {
	query := `
		SELECT blob_name, updated_at, encrypted_blob_ciphertext
		FROM blobs
		WHERE user_id = ?
		ORDER BY blob_name
	`

	rows, err := db.conn.Query(query, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to list blobs: %w", err)
	}
	defer rows.Close()

	var blobs []models.BlobListItem
	for rows.Next() {
		var item models.BlobListItem
		var ciphertext string

		if err := rows.Scan(&item.BlobName, &item.UpdatedAt, &ciphertext); err != nil {
			return nil, fmt.Errorf("failed to scan blob: %w", err)
		}

		// Calculate encrypted size from base64 ciphertext
		decoded, err := base64.StdEncoding.DecodeString(ciphertext)
		if err == nil {
			item.EncryptedSize = len(decoded)
		}

		blobs = append(blobs, item)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("failed to iterate blobs: %w", err)
	}

	return blobs, nil
}

// DeleteBlob deletes a blob by user ID and blob name
func (db *DB) DeleteBlob(userID int64, blobName string) error {
	query := `DELETE FROM blobs WHERE user_id = ? AND blob_name = ?`

	result, err := db.conn.Exec(query, userID, blobName)
	if err != nil {
		return fmt.Errorf("failed to delete blob: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rowsAffected == 0 {
		return ErrBlobNotFound
	}

	return nil
}
