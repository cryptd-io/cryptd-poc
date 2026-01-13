package db

import (
	"context"
	"database/sql"
	"fmt"
)

// UpsertBlob inserts or updates a blob
func (db *DB) UpsertBlob(ctx context.Context, blob *Blob) error {
	query := `
		INSERT INTO blobs (
			id, user_id,
			wrapped_dek_b64, wrapped_dek_nonce_b64, wrapped_dek_alg,
			ciphertext_b64, nonce_b64, alg, version,
			updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(user_id, id) DO UPDATE SET
			wrapped_dek_b64 = excluded.wrapped_dek_b64,
			wrapped_dek_nonce_b64 = excluded.wrapped_dek_nonce_b64,
			wrapped_dek_alg = excluded.wrapped_dek_alg,
			ciphertext_b64 = excluded.ciphertext_b64,
			nonce_b64 = excluded.nonce_b64,
			alg = excluded.alg,
			version = excluded.version,
			updated_at = CURRENT_TIMESTAMP
	`

	_, err := db.ExecContext(ctx, query,
		blob.ID, blob.UserID,
		blob.WrappedDEKB64, blob.WrappedDEKNonceB64, blob.WrappedDEKAlg,
		blob.CiphertextB64, blob.NonceB64, blob.Alg, blob.Version,
	)

	if err != nil {
		return fmt.Errorf("failed to upsert blob: %w", err)
	}

	return nil
}

// GetBlob retrieves a blob by user ID and blob ID
func (db *DB) GetBlob(ctx context.Context, userID, blobID string) (*Blob, error) {
	query := `
		SELECT 
			id, user_id,
			wrapped_dek_b64, wrapped_dek_nonce_b64, wrapped_dek_alg,
			ciphertext_b64, nonce_b64, alg, version,
			deleted_at, updated_at, created_at
		FROM blobs
		WHERE user_id = ? AND id = ? AND deleted_at IS NULL
	`

	blob := &Blob{}
	err := db.QueryRowContext(ctx, query, userID, blobID).Scan(
		&blob.ID, &blob.UserID,
		&blob.WrappedDEKB64, &blob.WrappedDEKNonceB64, &blob.WrappedDEKAlg,
		&blob.CiphertextB64, &blob.NonceB64, &blob.Alg, &blob.Version,
		&blob.DeletedAt, &blob.UpdatedAt, &blob.CreatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get blob: %w", err)
	}

	return blob, nil
}

// ListBlobs retrieves blobs for a user with pagination
func (db *DB) ListBlobs(ctx context.Context, userID string, limit int, offset int) ([]*Blob, error) {
	query := `
		SELECT 
			id, user_id, version, updated_at, created_at
		FROM blobs
		WHERE user_id = ? AND deleted_at IS NULL
		ORDER BY updated_at DESC, id ASC
		LIMIT ? OFFSET ?
	`

	rows, err := db.QueryContext(ctx, query, userID, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("failed to list blobs: %w", err)
	}
	defer rows.Close()

	var blobs []*Blob
	for rows.Next() {
		blob := &Blob{}
		if err := rows.Scan(&blob.ID, &blob.UserID, &blob.Version, &blob.UpdatedAt, &blob.CreatedAt); err != nil {
			return nil, fmt.Errorf("failed to scan blob: %w", err)
		}
		blobs = append(blobs, blob)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("rows error: %w", err)
	}

	return blobs, nil
}

// DeleteBlob performs a hard delete of a blob
func (db *DB) DeleteBlob(ctx context.Context, userID, blobID string) error {
	query := `DELETE FROM blobs WHERE user_id = ? AND id = ?`

	result, err := db.ExecContext(ctx, query, userID, blobID)
	if err != nil {
		return fmt.Errorf("failed to delete blob: %w", err)
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rows == 0 {
		return sql.ErrNoRows
	}

	return nil
}
