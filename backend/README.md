# cryptd Backend

Go backend server implementing the cryptd encrypted blob vault API.

## Project Structure

```
backend/
├── cmd/
│   └── server/          # Main application entry point
│       └── main.go
├── internal/            # Private application packages
│   ├── api/            # HTTP handlers and routing
│   │   ├── handlers.go # API endpoint implementations
│   │   └── router.go   # Route configuration
│   ├── crypto/         # Cryptographic utilities
│   │   ├── crypto.go   # KDF, HKDF, hashing functions
│   │   └── crypto_test.go
│   ├── db/             # Database layer
│   │   ├── db.go       # CRUD operations
│   │   ├── schema.go   # SQLite schema
│   │   └── db_test.go
│   ├── middleware/     # HTTP middleware
│   │   ├── auth.go     # JWT authentication
│   │   └── auth_test.go
│   └── models/         # Shared data models
│       └── models.go   # Container, User, Blob types
├── tests/              # Integration tests
│   └── integration_test.go
├── Dockerfile          # Container image definition
├── go.mod             # Go module definition
└── go.sum             # Dependency checksums
```

## Dependencies

### Core Libraries
- **chi** - Lightweight HTTP router
- **go-sqlite3** - SQLite3 driver
- **golang.org/x/crypto** - Cryptographic primitives (Argon2, PBKDF2, HKDF)
- **jwt-go** - JWT token handling
- **cors** - CORS middleware

### Testing
- Standard library `testing` package
- In-memory SQLite for isolated tests

## Building

### Prerequisites
- Go 1.21 or higher
- GCC (for SQLite CGO bindings)

### Build Commands

```bash
# Build server binary
go build -o bin/cryptd-server ./cmd/server

# Build with CGO disabled (not recommended for SQLite)
CGO_ENABLED=0 go build -o bin/cryptd-server ./cmd/server

# Build for Linux (cross-compile from macOS)
GOOS=linux GOARCH=amd64 CGO_ENABLED=1 go build -o bin/cryptd-server-linux ./cmd/server
```

## Testing

### Run All Tests
```bash
go test ./...
```

### Run with Verbose Output
```bash
go test -v ./...
```

### Run Specific Package
```bash
go test -v ./internal/crypto
go test -v ./internal/db
go test -v ./internal/api
go test -v ./tests
```

### Coverage Report
```bash
go test -coverprofile=coverage.out ./...
go tool cover -html=coverage.out
```

### Run Tests in Parallel
```bash
go test -v -parallel 4 ./...
```

## Running

### Local Development
```bash
# Set required environment variable
export JWT_SECRET="your-secret-key"

# Run directly
go run ./cmd/server

# Or with custom flags
go run ./cmd/server -port 9000 -db ./my-database.db -jwt-secret $JWT_SECRET
```

### Command-line Flags
- `-port`: Server port (default: 8080)
- `-db`: SQLite database path (default: cryptd.db)
- `-jwt-secret`: JWT signing secret (required, or set JWT_SECRET env var)

### Example
```bash
JWT_SECRET=my-secret go run ./cmd/server -port 8080 -db /data/cryptd.db
```

## API Implementation

### Authentication Flow
1. Client requests KDF params: `GET /v1/auth/kdf?username=alice`
2. Client derives credentials locally
3. Client registers: `POST /v1/auth/register` (with client-computed loginVerifier)
4. Client logs in: `POST /v1/auth/verify` (returns JWT token)
5. Client uses token for authenticated requests

### Cryptographic Operations

#### Password-Based Key Derivation
```go
// Supported KDFs
crypto.DerivePasswordSecret(password, username, params)
// Uses PBKDF2-HMAC-SHA256 or Argon2id based on params.Type
```

#### HKDF Key Derivation
```go
// Derive login verifier
loginVerifier := crypto.DeriveLoginVerifier(masterSecret)

// Derive master key (for wrapping accountKey)
masterKey := crypto.DeriveMasterKey(masterSecret)
```

#### Login Verifier Hashing
```go
// Server-side slow hash
loginVerifierHash := crypto.HashLoginVerifier(loginVerifier, username)

// Constant-time verification
isValid := crypto.VerifyLoginVerifier(loginVerifier, username, storedHash)
```

### Database Operations

#### User Management
```go
// Create user
err := db.CreateUser(&user)

// Get user by username (for login)
user, err := db.GetUserByUsername("alice")

// Get user by ID (for authenticated requests)
user, err := db.GetUserByID(userID)

// Update user (credential rotation)
err := db.UpdateUser(&user)
```

#### Blob Management
```go
// Upsert blob (insert or update)
err := db.UpsertBlob(&blob)

// Get specific blob
blob, err := db.GetBlob(userID, "vault")

// List all user blobs
blobs, err := db.ListBlobs(userID)

// Delete blob
err := db.DeleteBlob(userID, "vault")
```

### JWT Middleware
```go
// Generate token
token, err := jwtConfig.GenerateToken(userID)

// Validate token (automatic in middleware)
claims, err := jwtConfig.ValidateToken(tokenString)

// Extract userID from context (in handlers)
userID, err := middleware.GetUserIDFromContext(r.Context())
```

## Database Schema

### Users Table
```sql
CREATE TABLE users (
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
```

### Blobs Table
```sql
CREATE TABLE blobs (
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
```

## Error Handling

### Database Errors
- `db.ErrUserNotFound` - User not found (404)
- `db.ErrUserExists` - Username already taken (409)
- `db.ErrBlobNotFound` - Blob not found (404)
- `db.ErrInvalidKDFType` - Invalid KDF type (400)

### Crypto Errors
- `crypto.ErrInvalidKDFParams` - KDF params below minimum threshold
- `crypto.ErrInvalidKDFType` - Unsupported KDF type

### Middleware Errors
- `middleware.ErrMissingAuthHeader` - Authorization header missing
- `middleware.ErrInvalidAuthHeader` - Invalid format
- `middleware.ErrInvalidToken` - Token validation failed

## Performance Considerations

### KDF Parameters
- **PBKDF2-SHA256**: 600,000 iterations (Bitwarden-aligned)
- **Argon2id**: 64 MiB memory, 3 iterations, 4 parallelism

These provide strong protection but require ~100-200ms per operation.

### Database
- SQLite with WAL mode for better concurrency
- Indexes on `username` and `(user_id, blob_name)`
- Foreign key constraints enforced

### JWT Tokens
- 24-hour expiration (configurable in `middleware/auth.go`)
- HS256 signing (fast, symmetric)

## Security Notes

### What the Server NEVER Receives
- User passwords (plaintext)
- Master secrets
- Master keys
- Account keys (plaintext)
- Blob plaintext

### What the Server Stores
- Username (plaintext)
- KDF parameters (metadata)
- Slow-hashed login verifier
- Encrypted account key (opaque container)
- Encrypted blobs (opaque containers)

### Constant-Time Operations
- Login verifier comparison uses `constantTimeCompare`
- Prevents timing attacks on authentication

### Rate Limiting
- Login verifier is slow-hashed (600k PBKDF2 iterations)
- Effectively rate-limits online brute force attacks
- Additional rate limiting should be implemented at reverse proxy level

## Development Tips

### Hot Reload with Air
```bash
go install github.com/cosmtrek/air@latest
air
```

### Debugging
```bash
# Enable detailed logging
go run ./cmd/server -jwt-secret test | grep -v "chi"

# Run with race detector
go run -race ./cmd/server -jwt-secret test
```

### Database Inspection
```bash
# Open SQLite database
sqlite3 cryptd.db

# Useful queries
SELECT * FROM users;
SELECT user_id, blob_name, length(encrypted_blob_ciphertext) as size FROM blobs;
```

## Common Issues

### CGO Build Errors
**Problem**: `undefined reference to sqlite3_*`
**Solution**: Ensure GCC is installed and CGO is enabled:
```bash
CGO_ENABLED=1 go build ./cmd/server
```

### JWT Secret Missing
**Problem**: `JWT secret is required`
**Solution**: Set environment variable or pass flag:
```bash
export JWT_SECRET="your-secret"
# or
go run ./cmd/server -jwt-secret "your-secret"
```

### Database Locked
**Problem**: `database is locked`
**Solution**: SQLite doesn't handle high concurrency well. Consider:
- Using WAL mode (enabled by default in this project)
- Moving to PostgreSQL for production
- Ensuring proper connection pooling

## Future Improvements

### Performance
- [ ] Connection pooling for database
- [ ] Redis caching for KDF params
- [ ] Background jobs for cleanup

### Features
- [ ] Blob versioning
- [ ] Blob sharing (with additional key wrapping)
- [ ] Audit log

### Security
- [ ] Rate limiting per IP
- [ ] CAPTCHA for registration
- [ ] Two-factor authentication
- [ ] Key rotation policies

### Operations
- [ ] Metrics/monitoring (Prometheus)
- [ ] Health check endpoint
- [ ] Database migrations
- [ ] Backup automation
