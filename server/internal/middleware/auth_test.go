package middleware

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func TestGenerateToken(t *testing.T) {
	config := NewJWTConfig("test-secret")
	userID := int64(123)

	token, err := config.GenerateToken(userID)
	if err != nil {
		t.Fatalf("failed to generate token: %v", err)
	}

	if token == "" {
		t.Error("generated token is empty")
	}
}

func TestValidateToken(t *testing.T) {
	config := NewJWTConfig("test-secret")
	userID := int64(123)

	token, err := config.GenerateToken(userID)
	if err != nil {
		t.Fatalf("failed to generate token: %v", err)
	}

	claims, err := config.ValidateToken(token)
	if err != nil {
		t.Fatalf("failed to validate token: %v", err)
	}

	if claims.UserID != userID {
		t.Errorf("expected user ID %d, got %d", userID, claims.UserID)
	}
}

func TestValidateTokenInvalid(t *testing.T) {
	config := NewJWTConfig("test-secret")

	tests := []struct {
		name  string
		token string
	}{
		{"invalid format", "invalid-token"},
		{"empty", ""},
		{"wrong signature", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoxMjN9.invalid"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := config.ValidateToken(tt.token)
			if err == nil {
				t.Error("expected error for invalid token")
			}
		})
	}
}

func TestValidateTokenWrongSecret(t *testing.T) {
	config1 := NewJWTConfig("secret1")
	config2 := NewJWTConfig("secret2")

	token, err := config1.GenerateToken(123)
	if err != nil {
		t.Fatalf("failed to generate token: %v", err)
	}

	_, err = config2.ValidateToken(token)
	if err == nil {
		t.Error("expected error when validating token with wrong secret")
	}
}

func TestValidateTokenExpired(t *testing.T) {
	config := NewJWTConfig("test-secret")
	config.Expiration = -1 * time.Hour // Set expiration to past

	token, err := config.GenerateToken(123)
	if err != nil {
		t.Fatalf("failed to generate token: %v", err)
	}

	_, err = config.ValidateToken(token)
	if err == nil {
		t.Error("expected error for expired token")
	}
}

func TestAuthMiddleware(t *testing.T) {
	config := NewJWTConfig("test-secret")
	userID := int64(123)

	token, err := config.GenerateToken(userID)
	if err != nil {
		t.Fatalf("failed to generate token: %v", err)
	}

	handler := config.AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Verify user ID is in context
		ctxUserID, err := GetUserIDFromContext(r.Context())
		if err != nil {
			t.Errorf("failed to get user ID from context: %v", err)
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		if ctxUserID != userID {
			t.Errorf("expected user ID %d, got %d", userID, ctxUserID)
		}

		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}
}

func TestAuthMiddlewareMissingHeader(t *testing.T) {
	config := NewJWTConfig("test-secret")

	handler := config.AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("handler should not be called")
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/test", nil)
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected status 401, got %d", w.Code)
	}
}

func TestAuthMiddlewareInvalidHeader(t *testing.T) {
	config := NewJWTConfig("test-secret")

	tests := []struct {
		name   string
		header string
	}{
		{"no bearer prefix", "token123"},
		{"wrong prefix", "Basic token123"},
		{"empty bearer", "Bearer "},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler := config.AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				t.Error("handler should not be called")
				w.WriteHeader(http.StatusOK)
			}))

			req := httptest.NewRequest("GET", "/test", nil)
			req.Header.Set("Authorization", tt.header)
			w := httptest.NewRecorder()

			handler.ServeHTTP(w, req)

			if w.Code != http.StatusUnauthorized {
				t.Errorf("expected status 401, got %d", w.Code)
			}
		})
	}
}

func TestAuthMiddlewareInvalidToken(t *testing.T) {
	config := NewJWTConfig("test-secret")

	handler := config.AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("handler should not be called")
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("Authorization", "Bearer invalid-token")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected status 401, got %d", w.Code)
	}
}

func TestGetUserIDFromContext(t *testing.T) {
	userID := int64(123)
	ctx := context.WithValue(context.Background(), UserIDContextKey, userID)

	retrievedID, err := GetUserIDFromContext(ctx)
	if err != nil {
		t.Fatalf("failed to get user ID from context: %v", err)
	}

	if retrievedID != userID {
		t.Errorf("expected user ID %d, got %d", userID, retrievedID)
	}
}

func TestGetUserIDFromContextMissing(t *testing.T) {
	ctx := context.Background()

	_, err := GetUserIDFromContext(ctx)
	if err == nil {
		t.Error("expected error when user ID not in context")
	}
}

func TestGetUserIDFromContextWrongType(t *testing.T) {
	ctx := context.WithValue(context.Background(), UserIDContextKey, "not-an-int")

	_, err := GetUserIDFromContext(ctx)
	if err == nil {
		t.Error("expected error when user ID is wrong type")
	}
}

func TestTokenExpiration(t *testing.T) {
	config := NewJWTConfig("test-secret")
	config.Expiration = 1 * time.Second

	token, err := config.GenerateToken(123)
	if err != nil {
		t.Fatalf("failed to generate token: %v", err)
	}

	// Token should be valid immediately
	_, err = config.ValidateToken(token)
	if err != nil {
		t.Errorf("token should be valid immediately: %v", err)
	}

	// Wait for token to expire
	time.Sleep(2 * time.Second)

	// Token should be expired now
	_, err = config.ValidateToken(token)
	if err == nil {
		t.Error("expected error for expired token")
	}
}

func TestClaimsIssuer(t *testing.T) {
	config := NewJWTConfig("test-secret")
	token, err := config.GenerateToken(123)
	if err != nil {
		t.Fatalf("failed to generate token: %v", err)
	}

	// Parse token without validation to check issuer
	parsedToken, _, err := jwt.NewParser().ParseUnverified(token, &Claims{})
	if err != nil {
		t.Fatalf("failed to parse token: %v", err)
	}

	claims, ok := parsedToken.Claims.(*Claims)
	if !ok {
		t.Fatal("failed to cast claims")
	}

	if claims.Issuer != "cryptd" {
		t.Errorf("expected issuer 'cryptd', got '%s'", claims.Issuer)
	}
}
