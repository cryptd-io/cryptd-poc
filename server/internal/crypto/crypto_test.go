package crypto

import (
	"bytes"
	"encoding/hex"
	"testing"

	"github.com/shalteor/cryptd-poc/server/internal/models"
)

func TestDerivePBKDF2(t *testing.T) {
	password := "test-password"
	salt := "test-user"
	iterations := 100_000

	key1, err := derivePBKDF2(password, salt, iterations)
	if err != nil {
		t.Fatalf("failed to derive key: %v", err)
	}

	if len(key1) != 32 {
		t.Errorf("expected key length 32, got %d", len(key1))
	}

	// Same input should produce same output
	key2, err := derivePBKDF2(password, salt, iterations)
	if err != nil {
		t.Fatalf("failed to derive key: %v", err)
	}

	if !bytes.Equal(key1, key2) {
		t.Error("same inputs produced different keys")
	}

	// Different password should produce different key
	key3, err := derivePBKDF2("different-password", salt, iterations)
	if err != nil {
		t.Fatalf("failed to derive key: %v", err)
	}

	if bytes.Equal(key1, key3) {
		t.Error("different passwords produced same key")
	}
}

func TestDerivePBKDF2MinIterations(t *testing.T) {
	_, err := derivePBKDF2("password", "salt", MinPBKDF2Iterations-1)
	if err == nil {
		t.Error("expected error for iterations below minimum")
	}
}

func TestDeriveArgon2id(t *testing.T) {
	password := "test-password"
	salt := "test-user"
	iterations := 3
	memoryKiB := 65536
	parallelism := 4

	key1, err := deriveArgon2id(password, salt, iterations, memoryKiB, parallelism)
	if err != nil {
		t.Fatalf("failed to derive key: %v", err)
	}

	if len(key1) != 32 {
		t.Errorf("expected key length 32, got %d", len(key1))
	}

	// Same input should produce same output
	key2, err := deriveArgon2id(password, salt, iterations, memoryKiB, parallelism)
	if err != nil {
		t.Fatalf("failed to derive key: %v", err)
	}

	if !bytes.Equal(key1, key2) {
		t.Error("same inputs produced different keys")
	}

	// Different password should produce different key
	key3, err := deriveArgon2id("different-password", salt, iterations, memoryKiB, parallelism)
	if err != nil {
		t.Fatalf("failed to derive key: %v", err)
	}

	if bytes.Equal(key1, key3) {
		t.Error("different passwords produced same key")
	}
}

func TestDeriveArgon2idMinParams(t *testing.T) {
	tests := []struct {
		name        string
		iterations  int
		memoryKiB   int
		parallelism int
		expectError bool
	}{
		{"valid", 3, 65536, 4, false},
		{"low memory", 3, MinArgon2Memory - 1, 4, true},
		{"low iterations", MinArgon2Iterations - 1, 65536, 4, true},
		{"low parallelism", 3, 65536, MinArgon2Parallelism - 1, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := deriveArgon2id("password", "salt", tt.iterations, tt.memoryKiB, tt.parallelism)
			if tt.expectError && err == nil {
				t.Error("expected error but got none")
			}
			if !tt.expectError && err != nil {
				t.Errorf("unexpected error: %v", err)
			}
		})
	}
}

func TestDerivePasswordSecret(t *testing.T) {
	password := "test-password"
	username := "alice"

	t.Run("PBKDF2", func(t *testing.T) {
		params := models.KDFParams{
			Type:       models.KDFTypePBKDF2SHA256,
			Iterations: 600_000,
		}

		secret, err := DerivePasswordSecret(password, username, params)
		if err != nil {
			t.Fatalf("failed to derive password secret: %v", err)
		}

		if len(secret) != 32 {
			t.Errorf("expected secret length 32, got %d", len(secret))
		}
	})

	t.Run("Argon2id", func(t *testing.T) {
		memoryKiB := 65536
		parallelism := 4
		params := models.KDFParams{
			Type:        models.KDFTypeArgon2id,
			Iterations:  3,
			MemoryKiB:   &memoryKiB,
			Parallelism: &parallelism,
		}

		secret, err := DerivePasswordSecret(password, username, params)
		if err != nil {
			t.Fatalf("failed to derive password secret: %v", err)
		}

		if len(secret) != 32 {
			t.Errorf("expected secret length 32, got %d", len(secret))
		}
	})

	t.Run("invalid type", func(t *testing.T) {
		params := models.KDFParams{
			Type:       models.KDFType("invalid"),
			Iterations: 600_000,
		}

		_, err := DerivePasswordSecret(password, username, params)
		if err == nil {
			t.Error("expected error for invalid KDF type")
		}
	})
}

func TestHKDFDerivation(t *testing.T) {
	masterSecret := []byte("test-master-secret-32-bytes!!")

	loginVerifier, err := DeriveLoginVerifier(masterSecret)
	if err != nil {
		t.Fatalf("failed to derive login verifier: %v", err)
	}

	if len(loginVerifier) != 32 {
		t.Errorf("expected login verifier length 32, got %d", len(loginVerifier))
	}

	masterKey, err := DeriveMasterKey(masterSecret)
	if err != nil {
		t.Fatalf("failed to derive master key: %v", err)
	}

	if len(masterKey) != 32 {
		t.Errorf("expected master key length 32, got %d", len(masterKey))
	}

	// Login verifier and master key should be different
	if bytes.Equal(loginVerifier, masterKey) {
		t.Error("login verifier and master key are the same")
	}

	// Both should be different from master secret
	if bytes.Equal(loginVerifier, masterSecret) {
		t.Error("login verifier equals master secret")
	}
	if bytes.Equal(masterKey, masterSecret) {
		t.Error("master key equals master secret")
	}
}

func TestHashAndVerifyLoginVerifier(t *testing.T) {
	loginVerifier := []byte("test-login-verifier-32-bytes")
	username := "alice"

	hash := HashLoginVerifier(loginVerifier, username)
	if len(hash) != 32 {
		t.Errorf("expected hash length 32, got %d", len(hash))
	}

	// Verify correct verifier
	if !VerifyLoginVerifier(loginVerifier, username, hash) {
		t.Error("failed to verify correct login verifier")
	}

	// Verify wrong verifier
	wrongVerifier := []byte("wrong-login-verifier-32-byte")
	if VerifyLoginVerifier(wrongVerifier, username, hash) {
		t.Error("incorrectly verified wrong login verifier")
	}

	// Verify with different username
	if VerifyLoginVerifier(loginVerifier, "bob", hash) {
		t.Error("incorrectly verified with different username")
	}
}

func TestConstantTimeCompare(t *testing.T) {
	a := []byte{1, 2, 3, 4, 5}
	b := []byte{1, 2, 3, 4, 5}
	c := []byte{1, 2, 3, 4, 6}
	d := []byte{1, 2, 3, 4}

	if !constantTimeCompare(a, b) {
		t.Error("equal slices not detected as equal")
	}

	if constantTimeCompare(a, c) {
		t.Error("different slices detected as equal")
	}

	if constantTimeCompare(a, d) {
		t.Error("slices of different lengths detected as equal")
	}
}

func TestGenerateRandomBytes(t *testing.T) {
	size := 32
	bytes1, err := GenerateRandomBytes(size)
	if err != nil {
		t.Fatalf("failed to generate random bytes: %v", err)
	}

	if len(bytes1) != size {
		t.Errorf("expected %d bytes, got %d", size, len(bytes1))
	}

	// Generate another and ensure they're different
	bytes2, err := GenerateRandomBytes(size)
	if err != nil {
		t.Fatalf("failed to generate random bytes: %v", err)
	}

	if bytes.Equal(bytes1, bytes2) {
		t.Error("two random byte generations produced identical results")
	}
}

func TestBase64EncodeDecode(t *testing.T) {
	original := []byte("test data to encode")

	encoded := EncodeBase64(original)
	if encoded == "" {
		t.Error("encoding produced empty string")
	}

	decoded, err := DecodeBase64(encoded)
	if err != nil {
		t.Fatalf("failed to decode: %v", err)
	}

	if !bytes.Equal(original, decoded) {
		t.Errorf("decoded data doesn't match original:\noriginal: %s\ndecoded: %s", hex.EncodeToString(original), hex.EncodeToString(decoded))
	}
}

func TestValidateKDFParams(t *testing.T) {
	tests := []struct {
		name        string
		params      models.KDFParams
		expectError bool
	}{
		{
			name: "valid PBKDF2",
			params: models.KDFParams{
				Type:       models.KDFTypePBKDF2SHA256,
				Iterations: 600_000,
			},
			expectError: false,
		},
		{
			name: "PBKDF2 low iterations",
			params: models.KDFParams{
				Type:       models.KDFTypePBKDF2SHA256,
				Iterations: MinPBKDF2Iterations - 1,
			},
			expectError: true,
		},
		{
			name: "valid Argon2id",
			params: func() models.KDFParams {
				mem := 65536
				par := 4
				return models.KDFParams{
					Type:        models.KDFTypeArgon2id,
					Iterations:  3,
					MemoryKiB:   &mem,
					Parallelism: &par,
				}
			}(),
			expectError: false,
		},
		{
			name: "Argon2id missing memory",
			params: models.KDFParams{
				Type:       models.KDFTypeArgon2id,
				Iterations: 3,
			},
			expectError: true,
		},
		{
			name: "invalid type",
			params: models.KDFParams{
				Type:       models.KDFType("invalid"),
				Iterations: 600_000,
			},
			expectError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateKDFParams(tt.params)
			if tt.expectError && err == nil {
				t.Error("expected error but got none")
			}
			if !tt.expectError && err != nil {
				t.Errorf("unexpected error: %v", err)
			}
		})
	}
}
