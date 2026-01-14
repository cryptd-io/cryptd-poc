package crypto

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"io"

	"golang.org/x/crypto/argon2"
	"golang.org/x/crypto/hkdf"
	"golang.org/x/crypto/pbkdf2"
	"github.com/shalteor/cryptd-poc/backend/internal/models"
)

const (
	// HKDF constants
	HKDFSalt         = "cryptd:hkdf:v1"
	HKDFInfoLogin    = "login-verifier:v1"
	HKDFInfoMaster   = "master-key:v1"
	HKDFOutputLength = 32

	// Login verifier hash constants
	LoginVerifierIterations = 600_000

	// Minimum KDF parameter floors
	MinPBKDF2Iterations = 100_000
	MinArgon2Memory     = 16384  // 16 MiB in KiB
	MinArgon2Iterations = 2
	MinArgon2Parallelism = 1
)

var (
	ErrInvalidKDFParams = errors.New("invalid KDF parameters")
	ErrInvalidKDFType   = errors.New("invalid KDF type")
)

// DerivePasswordSecret derives masterSecret from password using the specified KDF
func DerivePasswordSecret(password, username string, params models.KDFParams) ([]byte, error) {
	switch params.Type {
	case models.KDFTypePBKDF2SHA256:
		return derivePBKDF2(password, username, params.Iterations)
	case models.KDFTypeArgon2id:
		if params.MemoryKiB == nil || params.Parallelism == nil {
			return nil, ErrInvalidKDFParams
		}
		return deriveArgon2id(password, username, params.Iterations, *params.MemoryKiB, *params.Parallelism)
	default:
		return nil, ErrInvalidKDFType
	}
}

// derivePBKDF2 derives a key using PBKDF2-HMAC-SHA256
func derivePBKDF2(password, salt string, iterations int) ([]byte, error) {
	if iterations < MinPBKDF2Iterations {
		return nil, fmt.Errorf("%w: PBKDF2 iterations %d < minimum %d", ErrInvalidKDFParams, iterations, MinPBKDF2Iterations)
	}
	return pbkdf2.Key([]byte(password), []byte(salt), iterations, 32, sha256.New), nil
}

// deriveArgon2id derives a key using Argon2id
func deriveArgon2id(password, salt string, iterations, memoryKiB, parallelism int) ([]byte, error) {
	if memoryKiB < MinArgon2Memory {
		return nil, fmt.Errorf("%w: Argon2 memory %d KiB < minimum %d KiB", ErrInvalidKDFParams, memoryKiB, MinArgon2Memory)
	}
	if iterations < MinArgon2Iterations {
		return nil, fmt.Errorf("%w: Argon2 iterations %d < minimum %d", ErrInvalidKDFParams, iterations, MinArgon2Iterations)
	}
	if parallelism < MinArgon2Parallelism {
		return nil, fmt.Errorf("%w: Argon2 parallelism %d < minimum %d", ErrInvalidKDFParams, parallelism, MinArgon2Parallelism)
	}

	return argon2.IDKey([]byte(password), []byte(salt), uint32(iterations), uint32(memoryKiB), uint8(parallelism), 32), nil
}

// DeriveLoginVerifier derives the login verifier from masterSecret using HKDF
func DeriveLoginVerifier(masterSecret []byte) ([]byte, error) {
	return deriveHKDF(masterSecret, HKDFInfoLogin)
}

// DeriveMasterKey derives the master key from masterSecret using HKDF
func DeriveMasterKey(masterSecret []byte) ([]byte, error) {
	return deriveHKDF(masterSecret, HKDFInfoMaster)
}

// deriveHKDF derives a key using HKDF-HMAC-SHA256
func deriveHKDF(masterSecret []byte, info string) ([]byte, error) {
	// HKDF (combines Extract and Expand)
	hkdfReader := hkdf.New(sha256.New, masterSecret, []byte(HKDFSalt), []byte(info))

	// Read the derived key
	key := make([]byte, HKDFOutputLength)
	if _, err := io.ReadFull(hkdfReader, key); err != nil {
		return nil, fmt.Errorf("failed to derive HKDF key: %w", err)
	}

	return key, nil
}

// HashLoginVerifier hashes the login verifier for storage
func HashLoginVerifier(loginVerifier []byte, username string) []byte {
	return pbkdf2.Key(loginVerifier, []byte(username), LoginVerifierIterations, 32, sha256.New)
}

// VerifyLoginVerifier verifies a login verifier against a stored hash
func VerifyLoginVerifier(loginVerifier []byte, username string, storedHash []byte) bool {
	computedHash := HashLoginVerifier(loginVerifier, username)
	return constantTimeCompare(computedHash, storedHash)
}

// constantTimeCompare performs constant-time comparison of two byte slices
func constantTimeCompare(a, b []byte) bool {
	if len(a) != len(b) {
		return false
	}
	var result byte
	for i := 0; i < len(a); i++ {
		result |= a[i] ^ b[i]
	}
	return result == 0
}

// GenerateRandomBytes generates n random bytes
func GenerateRandomBytes(n int) ([]byte, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return nil, fmt.Errorf("failed to generate random bytes: %w", err)
	}
	return b, nil
}

// EncodeBase64 encodes bytes to base64 string
func EncodeBase64(data []byte) string {
	return base64.StdEncoding.EncodeToString(data)
}

// DecodeBase64 decodes base64 string to bytes
func DecodeBase64(s string) ([]byte, error) {
	data, err := base64.StdEncoding.DecodeString(s)
	if err != nil {
		return nil, fmt.Errorf("failed to decode base64: %w", err)
	}
	return data, nil
}

// ValidateKDFParams validates KDF parameters against minimum requirements
func ValidateKDFParams(params models.KDFParams) error {
	switch params.Type {
	case models.KDFTypePBKDF2SHA256:
		if params.Iterations < MinPBKDF2Iterations {
			return fmt.Errorf("%w: PBKDF2 iterations %d < minimum %d", ErrInvalidKDFParams, params.Iterations, MinPBKDF2Iterations)
		}
	case models.KDFTypeArgon2id:
		if params.MemoryKiB == nil {
			return fmt.Errorf("%w: Argon2 memory must be specified", ErrInvalidKDFParams)
		}
		if params.Parallelism == nil {
			return fmt.Errorf("%w: Argon2 parallelism must be specified", ErrInvalidKDFParams)
		}
		if *params.MemoryKiB < MinArgon2Memory {
			return fmt.Errorf("%w: Argon2 memory %d KiB < minimum %d KiB", ErrInvalidKDFParams, *params.MemoryKiB, MinArgon2Memory)
		}
		if params.Iterations < MinArgon2Iterations {
			return fmt.Errorf("%w: Argon2 iterations %d < minimum %d", ErrInvalidKDFParams, params.Iterations, MinArgon2Iterations)
		}
		if *params.Parallelism < MinArgon2Parallelism {
			return fmt.Errorf("%w: Argon2 parallelism %d < minimum %d", ErrInvalidKDFParams, *params.Parallelism, MinArgon2Parallelism)
		}
	default:
		return ErrInvalidKDFType
	}
	return nil
}
