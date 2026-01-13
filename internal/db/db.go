package db

import (
	"database/sql"
	"fmt"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

const schema = `
CREATE TABLE IF NOT EXISTS users (
	id TEXT PRIMARY KEY,
	username TEXT UNIQUE NOT NULL,
	
	-- KDF parameters (client-side parameters for deriving ROOT)
	kdf_type TEXT NOT NULL,
	kdf_salt_b64 TEXT NOT NULL,
	kdf_memory_kib INTEGER NOT NULL,
	kdf_iterations INTEGER NOT NULL,
	kdf_parallelism INTEGER NOT NULL,
	
	-- Authentication (server stores "power-hash" of verifier)
	auth_salt_b64 TEXT NOT NULL,
	auth_hash_b64 TEXT NOT NULL,
	
	-- Wrapped UEK (client can decrypt after login)
	wrapped_uek_b64 TEXT NOT NULL,
	wrapped_uek_nonce_b64 TEXT NOT NULL,
	wrapped_uek_alg TEXT NOT NULL,
	
	-- Metadata
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS blobs (
	id TEXT PRIMARY KEY,
	user_id TEXT NOT NULL,
	
	-- Key material (DEK wrapped by UEK on client)
	wrapped_dek_b64 TEXT NOT NULL,
	wrapped_dek_nonce_b64 TEXT NOT NULL,
	wrapped_dek_alg TEXT NOT NULL,
	
	-- Encrypted data
	ciphertext_b64 TEXT NOT NULL,
	nonce_b64 TEXT NOT NULL,
	alg TEXT NOT NULL,
	version INTEGER NOT NULL DEFAULT 1,
	
	-- Metadata
	deleted_at TIMESTAMP NULL,
	updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	
	FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
	UNIQUE (user_id, id)
);

CREATE INDEX IF NOT EXISTS idx_blobs_user_updated ON blobs(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_blobs_user_id ON blobs(user_id, id);
`

type DB struct {
	*sql.DB
}

func New(path string) (*DB, error) {
	db, err := sql.Open("sqlite3", fmt.Sprintf("file:%s?_foreign_keys=on", path))
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	if _, err := db.Exec(schema); err != nil {
		return nil, fmt.Errorf("failed to execute schema: %w", err)
	}

	return &DB{db}, nil
}

// User represents a user in the database
type User struct {
	ID       string
	Username string

	// KDF parameters
	KDFType   string
	KDFParams string // json encoded

	// Auth
	AuthSaltB64 string
	AuthHashB64 string

	// Wrapped UEK
	WrappedUEKB64      string
	WrappedUEKNonceB64 string
	WrappedUEKAlg      string

	CreatedAt time.Time
}

// Blob represents an encrypted blob in the database
type Blob struct {
	ID     string
	UserID string

	// Wrapped DEK
	WrappedDEKB64      string
	WrappedDEKNonceB64 string
	WrappedDEKAlg      string

	// Encrypted data
	CiphertextB64 string
	NonceB64      string
	Alg           string
	Version       int

	DeletedAt *time.Time
	UpdatedAt time.Time
	CreatedAt time.Time
}
