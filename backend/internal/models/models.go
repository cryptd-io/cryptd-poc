package models

import "time"

// Container represents an AEAD encrypted container (AES-256-GCM)
type Container struct {
	Nonce      string `json:"nonce"`      // base64(12 bytes)
	Ciphertext string `json:"ciphertext"` // base64(bytes)
	Tag        string `json:"tag"`        // base64(16 bytes)
}

// KDFType represents the supported KDF algorithms
type KDFType string

const (
	KDFTypePBKDF2SHA256 KDFType = "pbkdf2_sha256"
	KDFTypeArgon2id     KDFType = "argon2id"
)

// KDFParams represents KDF configuration parameters
type KDFParams struct {
	Type        KDFType `json:"kdfType"`
	Iterations  int     `json:"kdfIterations"`
	MemoryKiB   *int    `json:"kdfMemoryKiB,omitempty"`   // nullable for PBKDF2
	Parallelism *int    `json:"kdfParallelism,omitempty"` // nullable for PBKDF2
}

// User represents a user in the database
type User struct {
	ID                  int64     `json:"id"`
	Username            string    `json:"username"`
	KDFType             KDFType   `json:"-"`
	KDFIterations       int       `json:"-"`
	KDFMemoryKiB        *int      `json:"-"`
	KDFParallelism      *int      `json:"-"`
	LoginVerifierHash   []byte    `json:"-"`
	WrappedAccountKey   Container `json:"-"`
	CreatedAt           time.Time `json:"createdAt"`
	UpdatedAt           time.Time `json:"updatedAt"`
}

// Blob represents an encrypted blob in the database
type Blob struct {
	ID            int64     `json:"id"`
	UserID        int64     `json:"-"`
	BlobName      string    `json:"blobName"`
	EncryptedBlob Container `json:"encryptedBlob"`
	CreatedAt     time.Time `json:"createdAt"`
	UpdatedAt     time.Time `json:"updatedAt"`
}

// BlobListItem represents a blob item in list responses
type BlobListItem struct {
	BlobName      string    `json:"blobName"`
	UpdatedAt     time.Time `json:"updatedAt"`
	EncryptedSize int       `json:"encryptedSize"` // size of ciphertext in bytes
}
