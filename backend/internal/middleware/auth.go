package middleware

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

var (
	ErrMissingAuthHeader = errors.New("missing authorization header")
	ErrInvalidAuthHeader = errors.New("invalid authorization header format")
	ErrInvalidToken      = errors.New("invalid token")
)

type contextKey string

const UserIDContextKey contextKey = "user_id"

// JWTConfig holds the JWT configuration
type JWTConfig struct {
	Secret        []byte
	SigningMethod jwt.SigningMethod
	Expiration    time.Duration
}

// Claims represents JWT claims
type Claims struct {
	UserID int64 `json:"user_id"`
	jwt.RegisteredClaims
}

// NewJWTConfig creates a new JWT configuration
func NewJWTConfig(secret string) *JWTConfig {
	return &JWTConfig{
		Secret:        []byte(secret),
		SigningMethod: jwt.SigningMethodHS256,
		Expiration:    24 * time.Hour, // 24 hours
	}
}

// GenerateToken generates a JWT token for a user
func (c *JWTConfig) GenerateToken(userID int64) (string, error) {
	now := time.Now()
	claims := Claims{
		UserID: userID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(c.Expiration)),
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			Issuer:    "cryptd",
		},
	}

	token := jwt.NewWithClaims(c.SigningMethod, claims)
	return token.SignedString(c.Secret)
}

// ValidateToken validates a JWT token and returns the claims
func (c *JWTConfig) ValidateToken(tokenString string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		// Verify signing method
		if token.Method != c.SigningMethod {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Method)
		}
		return c.Secret, nil
	})

	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalidToken, err)
	}

	if claims, ok := token.Claims.(*Claims); ok && token.Valid {
		return claims, nil
	}

	return nil, ErrInvalidToken
}

// AuthMiddleware creates a middleware that validates JWT tokens
func (c *JWTConfig) AuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Extract token from Authorization header
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			http.Error(w, ErrMissingAuthHeader.Error(), http.StatusUnauthorized)
			return
		}

		// Check for Bearer prefix
		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			http.Error(w, ErrInvalidAuthHeader.Error(), http.StatusUnauthorized)
			return
		}

		tokenString := parts[1]

		// Validate token
		claims, err := c.ValidateToken(tokenString)
		if err != nil {
			http.Error(w, err.Error(), http.StatusUnauthorized)
			return
		}

		// Add user ID to context
		ctx := context.WithValue(r.Context(), UserIDContextKey, claims.UserID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// GetUserIDFromContext extracts the user ID from the request context
func GetUserIDFromContext(ctx context.Context) (int64, error) {
	userID, ok := ctx.Value(UserIDContextKey).(int64)
	if !ok {
		return 0, errors.New("user ID not found in context")
	}
	return userID, nil
}
