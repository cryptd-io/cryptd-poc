package db

const schema = `
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    kdf_type TEXT NOT NULL,
    kdf_iterations INTEGER NOT NULL,
    kdf_memory_kib INTEGER,
    kdf_parallelism INTEGER,
    login_verifier_hash BLOB NOT NULL,
    wrapped_account_key_nonce TEXT NOT NULL,
    wrapped_account_key_ciphertext TEXT NOT NULL,
    wrapped_account_key_tag TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

CREATE TABLE IF NOT EXISTS blobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    blob_name TEXT NOT NULL,
    encrypted_blob_nonce TEXT NOT NULL,
    encrypted_blob_ciphertext TEXT NOT NULL,
    encrypted_blob_tag TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, blob_name)
);

CREATE INDEX IF NOT EXISTS idx_blobs_user_id ON blobs(user_id);
CREATE INDEX IF NOT EXISTS idx_blobs_user_id_blob_name ON blobs(user_id, blob_name);
`
