package api

import (
	"encoding/base64"
	"net/http"

	"golang.org/x/crypto/argon2"
)

// LoginRequest represents the login request body
type LoginRequest struct {
	Username        string `json:"username"`
	AuthVerifierB64 string `json:"auth_verifier_b64"`
}

// UserInfo represents user information returned in login response
type UserInfo struct {
	UserID     string     `json:"user_id"`
	KDF        KDFParams  `json:"kdf"`
	WrappedUEK WrappedKey `json:"wrapped_uek"`
}

// LoginResponse represents the login response
type LoginResponse struct {
	Token string   `json:"token"`
	User  UserInfo `json:"user"`
}

// HandleLogin implements POST /v1/login
func (s *Server) HandleLogin(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	if err := DecodeJSON(r, &req); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Validate request
	if req.Username == "" || req.AuthVerifierB64 == "" {
		WriteError(w, http.StatusBadRequest, "username and auth_verifier_b64 are required")
		return
	}

	// Get user from database
	user, err := s.db.GetUserByUsername(r.Context(), req.Username)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "database error")
		return
	}
	if user == nil {
		WriteError(w, http.StatusUnauthorized, "invalid username or password")
		return
	}

	// Decode verifier and auth salt
	verifier, err := base64.StdEncoding.DecodeString(req.AuthVerifierB64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid base64 in auth_verifier_b64")
		return
	}

	authSalt, err := base64.StdEncoding.DecodeString(user.AuthSaltB64)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "invalid auth salt in database")
		return
	}

	// Hash the provided verifier
	computedHash := argon2.IDKey(
		verifier,
		authSalt,
		serverArgon2Time,
		serverArgon2Memory,
		serverArgon2Threads,
		serverArgon2KeyLen,
	)

	// Compare with stored hash
	storedHash, err := base64.StdEncoding.DecodeString(user.AuthHashB64)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "invalid auth hash in database")
		return
	}

	// Constant time comparison
	if !secureCompare(computedHash, storedHash) {
		WriteError(w, http.StatusUnauthorized, "invalid username or password")
		return
	}

	// Create session
	token := sessionStore.Create(user.ID)

	// Return response with user data needed for decryption
	resp := LoginResponse{
		Token: token,
		User: UserInfo{
			UserID: user.ID,
			KDF: KDFParams{
				Type:        user.KDFType,
				SaltB64:     user.KDFSaltB64,
				MemoryKiB:   user.KDFMemoryKiB,
				Iterations:  user.KDFIterations,
				Parallelism: user.KDFParallelism,
			},
			WrappedUEK: WrappedKey{
				Alg:          user.WrappedUEKAlg,
				NonceB64:     user.WrappedUEKNonceB64,
				CiphertextB64: user.WrappedUEKB64,
			},
		},
	}

	WriteJSON(w, http.StatusOK, resp)
}

// secureCompare performs constant-time comparison of two byte slices
func secureCompare(a, b []byte) bool {
	if len(a) != len(b) {
		return false
	}

	var result byte
	for i := 0; i < len(a); i++ {
		result |= a[i] ^ b[i]
	}

	return result == 0
}
