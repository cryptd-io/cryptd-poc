package api

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/shalteor/cryptd-poc/internal/db"
	"golang.org/x/crypto/argon2"
)

const (
	// Server-side Argon2id parameters for hashing the verifier
	serverArgon2Time    = uint32(2)
	serverArgon2Memory  = uint32(32768) // 32 MiB
	serverArgon2Threads = uint8(2)
	serverArgon2KeyLen  = uint32(32)

	// Auth salt length
	authSaltLength = 16
)

// Session store (in-memory for PoC)
type SessionStore struct {
	mu       sync.RWMutex
	sessions map[string]*Session
}

type Session struct {
	Token     string
	UserID    string
	CreatedAt time.Time
}

var sessionStore = &SessionStore{
	sessions: make(map[string]*Session),
}

func (s *SessionStore) Create(userID string) string {
	token := generateToken()
	s.mu.Lock()
	defer s.mu.Unlock()

	s.sessions[token] = &Session{
		Token:     token,
		UserID:    userID,
		CreatedAt: time.Now(),
	}

	return token
}

func (s *SessionStore) Get(token string) (*Session, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	session, ok := s.sessions[token]
	return session, ok
}

func (s *SessionStore) Delete(token string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	delete(s.sessions, token)
}

func generateToken() string {
	b := make([]byte, 32)
	rand.Read(b)
	return base64.URLEncoding.EncodeToString(b)
}

// AuthMiddleware validates the session token
func (s *Server) AuthMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			WriteError(w, http.StatusUnauthorized, "missing authorization header")
			return
		}

		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			WriteError(w, http.StatusUnauthorized, "invalid authorization header format")
			return
		}

		token := parts[1]
		session, ok := sessionStore.Get(token)
		if !ok {
			WriteError(w, http.StatusUnauthorized, "invalid or expired token")
			return
		}

		// Add user ID to request context
		ctx := r.Context()
		ctx = WithUserID(ctx, session.UserID)
		next.ServeHTTP(w, r.WithContext(ctx))
	}
}

// Register request/response types
type KDFParams struct {
	Type        string `json:"type"`
	SaltB64     string `json:"salt_b64"`
	MemoryKiB   int    `json:"memory_kib"`
	Iterations  int    `json:"iterations"`
	Parallelism int    `json:"parallelism"`
}

type WrappedKey struct {
	Alg          string `json:"alg"`
	NonceB64     string `json:"nonce_b64"`
	CiphertextB64 string `json:"ciphertext_b64"`
}

type RegisterRequest struct {
	Username        string      `json:"username"`
	KDF             KDFParams   `json:"kdf"`
	AuthVerifierB64 string      `json:"auth_verifier_b64"`
	WrappedUEK      WrappedKey  `json:"wrapped_uek"`
}

type RegisterResponse struct {
	UserID string    `json:"user_id"`
	KDF    KDFParams `json:"kdf"`
}

// HandleRegister implements POST /v1/register
func (s *Server) HandleRegister(w http.ResponseWriter, r *http.Request) {
	var req RegisterRequest
	if err := DecodeJSON(r, &req); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Validate request
	if req.Username == "" {
		WriteError(w, http.StatusBadRequest, "username is required")
		return
	}
	if req.AuthVerifierB64 == "" {
		WriteError(w, http.StatusBadRequest, "auth_verifier_b64 is required")
		return
	}

	// Check if user already exists
	existingUser, err := s.db.GetUserByUsername(r.Context(), req.Username)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "database error")
		return
	}
	if existingUser != nil {
		WriteError(w, http.StatusConflict, "username already exists")
		return
	}

	// Decode verifier
	verifier, err := base64.StdEncoding.DecodeString(req.AuthVerifierB64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid base64 in auth_verifier_b64")
		return
	}

	// Generate server auth salt
	authSalt := make([]byte, authSaltLength)
	if _, err := rand.Read(authSalt); err != nil {
		WriteError(w, http.StatusInternalServerError, "failed to generate auth salt")
		return
	}

	// Hash the verifier with server-side Argon2id
	authHash := argon2.IDKey(
		verifier,
		authSalt,
		serverArgon2Time,
		serverArgon2Memory,
		serverArgon2Threads,
		serverArgon2KeyLen,
	)

	// Create user
	userID := uuid.New().String()
	user := &db.User{
		ID:       userID,
		Username: req.Username,

		KDFType:        req.KDF.Type,
		KDFSaltB64:     req.KDF.SaltB64,
		KDFMemoryKiB:   req.KDF.MemoryKiB,
		KDFIterations:  req.KDF.Iterations,
		KDFParallelism: req.KDF.Parallelism,

		AuthSaltB64: base64.StdEncoding.EncodeToString(authSalt),
		AuthHashB64: base64.StdEncoding.EncodeToString(authHash),

		WrappedUEKB64:      req.WrappedUEK.CiphertextB64,
		WrappedUEKNonceB64: req.WrappedUEK.NonceB64,
		WrappedUEKAlg:      req.WrappedUEK.Alg,
	}

	if err := s.db.CreateUser(r.Context(), user); err != nil {
		WriteError(w, http.StatusInternalServerError, fmt.Sprintf("failed to create user: %v", err))
		return
	}

	// Return response
	resp := RegisterResponse{
		UserID: userID,
		KDF:    req.KDF,
	}

	WriteJSON(w, http.StatusCreated, resp)
}
