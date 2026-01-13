package db

import (
	"context"
	"database/sql"
	"fmt"
)

// CreateUser inserts a new user into the database
func (db *DB) CreateUser(ctx context.Context, user *User) error {
	query := `
		INSERT INTO users (
			id, username,
			kdf_type, kdf_salt_b64, kdf_memory_kib, kdf_iterations, kdf_parallelism,
			auth_salt_b64, auth_hash_b64,
			wrapped_uek_b64, wrapped_uek_nonce_b64, wrapped_uek_alg
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`

	_, err := db.ExecContext(ctx, query,
		user.ID, user.Username,
		user.KDFType, user.KDFSaltB64, user.KDFMemoryKiB, user.KDFIterations, user.KDFParallelism,
		user.AuthSaltB64, user.AuthHashB64,
		user.WrappedUEKB64, user.WrappedUEKNonceB64, user.WrappedUEKAlg,
	)

	if err != nil {
		return fmt.Errorf("failed to create user: %w", err)
	}

	return nil
}

// GetUserByUsername retrieves a user by username
func (db *DB) GetUserByUsername(ctx context.Context, username string) (*User, error) {
	query := `
		SELECT 
			id, username,
			kdf_type, kdf_salt_b64, kdf_memory_kib, kdf_iterations, kdf_parallelism,
			auth_salt_b64, auth_hash_b64,
			wrapped_uek_b64, wrapped_uek_nonce_b64, wrapped_uek_alg,
			created_at
		FROM users
		WHERE username = ?
	`

	user := &User{}
	err := db.QueryRowContext(ctx, query, username).Scan(
		&user.ID, &user.Username,
		&user.KDFType, &user.KDFSaltB64, &user.KDFMemoryKiB, &user.KDFIterations, &user.KDFParallelism,
		&user.AuthSaltB64, &user.AuthHashB64,
		&user.WrappedUEKB64, &user.WrappedUEKNonceB64, &user.WrappedUEKAlg,
		&user.CreatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get user: %w", err)
	}

	return user, nil
}

// GetUserByID retrieves a user by ID
func (db *DB) GetUserByID(ctx context.Context, userID string) (*User, error) {
	query := `
		SELECT 
			id, username,
			kdf_type, kdf_salt_b64, kdf_memory_kib, kdf_iterations, kdf_parallelism,
			auth_salt_b64, auth_hash_b64,
			wrapped_uek_b64, wrapped_uek_nonce_b64, wrapped_uek_alg,
			created_at
		FROM users
		WHERE id = ?
	`

	user := &User{}
	err := db.QueryRowContext(ctx, query, userID).Scan(
		&user.ID, &user.Username,
		&user.KDFType, &user.KDFSaltB64, &user.KDFMemoryKiB, &user.KDFIterations, &user.KDFParallelism,
		&user.AuthSaltB64, &user.AuthHashB64,
		&user.WrappedUEKB64, &user.WrappedUEKNonceB64, &user.WrappedUEKAlg,
		&user.CreatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get user: %w", err)
	}

	return user, nil
}
