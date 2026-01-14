# cryptd — Encrypted Blob Vault (PoC)

A minimal end-to-end encryption system where the **server stores and serves opaque encrypted blobs**, and the **client owns all plaintext and keys**. This is a proof-of-concept implementation of the design documented in [DESIGN.md](DESIGN.md).

## Repository Structure

```
cryptd-poc/
├── backend/           # Go backend server
│   ├── cmd/server/   # Main server entry point
│   ├── internal/     # Internal packages
│   │   ├── api/      # HTTP handlers and routing
│   │   ├── crypto/   # Cryptographic utilities
│   │   ├── db/       # Database layer (SQLite)
│   │   ├── middleware/ # JWT authentication
│   │   └── models/   # Data models
│   └── tests/        # Integration tests
├── frontend/         # React/Vite frontend (TODO)
├── DESIGN.md         # Detailed design specification
├── Makefile          # Common development tasks
└── docker-compose.yml # Docker deployment
```

## Features

### Security Features
- ✅ **End-to-end encryption**: Server cannot decrypt user data
- ✅ **Client-side key derivation**: PBKDF2-SHA256 or Argon2id
- ✅ **HKDF-based key hierarchy**: Independent keys for auth and encryption
- ✅ **AES-256-GCM encryption**: Authenticated encryption for all blobs
- ✅ **JWT-based authentication**: Stateless session management
- ✅ **Rate-limited login**: Slow hash of login verifier
- ✅ **Ciphertext substitution protection**: AAD binds blob names and user keys

### API Features
- ✅ User registration with configurable KDF params
- ✅ Two-step authentication flow (KDF params → verify)
- ✅ Blob CRUD operations (create, read, update, delete, list)
- ✅ Credential rotation (password and username changes)
- ✅ Multi-user isolation

## Quick Start

### Prerequisites
- Go 1.21+ (for backend)
- Docker & Docker Compose (optional, for containerized deployment)
- Make (optional, for convenience commands)

### Option 1: Local Development

1. **Set JWT Secret** (required):
   ```bash
   export JWT_SECRET="your-secure-random-secret-here"
   ```

2. **Build and run tests**:
   ```bash
   make test
   ```

3. **Run the server**:
   ```bash
   make run
   # or manually:
   cd backend && go run ./cmd/server -jwt-secret $JWT_SECRET
   ```

The server will start on http://localhost:8080

### Option 2: Docker Deployment

1. **Set JWT Secret** (optional, or use default):
   ```bash
   export JWT_SECRET="your-secure-random-secret-here"
   ```

2. **Start with docker-compose**:
   ```bash
   make docker-up
   # or manually:
   docker-compose up -d
   ```

3. **Check logs**:
   ```bash
   docker-compose logs -f backend
   ```

4. **Stop services**:
   ```bash
   make docker-down
   ```

## API Endpoints

### Public Endpoints

#### Get KDF Parameters
```http
GET /v1/auth/kdf?username=alice
```

Returns the KDF configuration for a user (needed before login).

#### Register
```http
POST /v1/auth/register
Content-Type: application/json

{
  "username": "alice",
  "kdfType": "argon2id",
  "kdfIterations": 3,
  "kdfMemoryKiB": 65536,
  "kdfParallelism": 4,
  "loginVerifier": "base64(...)",
  "wrappedAccountKey": {
    "nonce": "base64(...)",
    "ciphertext": "base64(...)",
    "tag": "base64(...)"
  }
}
```

#### Verify (Login)
```http
POST /v1/auth/verify
Content-Type: application/json

{
  "username": "alice",
  "loginVerifier": "base64(...)"
}
```

Returns a JWT token and wrapped account key.

### Authenticated Endpoints

All authenticated endpoints require:
```
Authorization: Bearer <jwt-token>
```

#### Update User (Credential Rotation)
```http
PATCH /v1/users/me
Content-Type: application/json

{
  "username": "alice-new",  // optional
  "loginVerifier": "base64(...)",
  "wrappedAccountKey": {
    "nonce": "base64(...)",
    "ciphertext": "base64(...)",
    "tag": "base64(...)"
  }
}
```

#### Upsert Blob
```http
PUT /v1/blobs/{blobName}
Content-Type: application/json

{
  "encryptedBlob": {
    "nonce": "base64(...)",
    "ciphertext": "base64(...)",
    "tag": "base64(...)"
  }
}
```

#### Get Blob
```http
GET /v1/blobs/{blobName}
```

#### List Blobs
```http
GET /v1/blobs
```

Returns array of `{blobName, updatedAt, encryptedSize}`.

#### Delete Blob
```http
DELETE /v1/blobs/{blobName}
```

## Development

### Run All Tests
```bash
make test
```

### Run Unit Tests Only
```bash
make test-unit
```

### Run Integration Tests
```bash
make test-integration
```

### Generate Coverage Report
```bash
make test-coverage
# Opens backend/coverage.html
```

### Build Binary
```bash
make build
# Output: backend/bin/cryptd-server
```

### Clean Build Artifacts
```bash
make clean
```

## Backend Architecture

### Package Structure

- **`cmd/server`**: Main entry point, server initialization
- **`internal/api`**: HTTP handlers, routing (chi router)
- **`internal/crypto`**: Cryptographic primitives (KDF, HKDF, password hashing)
- **`internal/db`**: Database layer (SQLite with `go-sqlite3`)
- **`internal/middleware`**: JWT authentication middleware
- **`internal/models`**: Shared data structures
- **`tests`**: Integration tests for full flows

### Database Schema

**Users Table:**
- `id`, `username` (unique)
- KDF parameters: `kdf_type`, `kdf_iterations`, `kdf_memory_kib`, `kdf_parallelism`
- `login_verifier_hash` (slow-hashed authentication proof)
- Wrapped account key: `wrapped_account_key_nonce/ciphertext/tag`
- Timestamps: `created_at`, `updated_at`

**Blobs Table:**
- `id`, `user_id` (FK), `blob_name`
- Encrypted blob: `encrypted_blob_nonce/ciphertext/tag`
- Unique constraint: `(user_id, blob_name)`
- Timestamps: `created_at`, `updated_at`

### Testing Strategy

1. **Unit tests**: Every package has `_test.go` files
   - `crypto`: KDF, HKDF, password hashing
   - `db`: CRUD operations, constraints
   - `middleware`: JWT generation, validation
   - `api`: Individual handler tests

2. **Integration tests**: Full end-to-end flows
   - Complete auth flow (register → get KDF → verify → access blobs)
   - Credential rotation (password and username changes)
   - Multi-user isolation (users can't access each other's data)

## Configuration

### Environment Variables

- `JWT_SECRET` (required): Secret key for JWT token signing
  ```bash
  export JWT_SECRET="$(openssl rand -base64 32)"
  ```

### Command-line Flags

```bash
./cryptd-server \
  -port 8080 \
  -db /path/to/cryptd.db \
  -jwt-secret "your-secret"
```

## Security Considerations

### What This PoC Provides
- ✅ Server-side encryption at rest (cannot decrypt without user password)
- ✅ Protection against ciphertext substitution attacks
- ✅ Secure key derivation (PBKDF2/Argon2)
- ✅ Proper cryptographic domain separation (HKDF)
- ✅ Authenticated encryption (AES-GCM with AAD)

### What This PoC Does NOT Provide (by design)
- ❌ Multi-device key sharing
- ❌ Account recovery mechanisms
- ❌ Hardware-backed key storage
- ❌ Advanced protocol hardening (PAKE, etc.)
- ❌ Protection against compromised client

### Production Considerations
If deploying beyond PoC:
1. Use HTTPS/TLS for all connections
2. Generate strong JWT secrets: `openssl rand -base64 32`
3. Configure Argon2id with memory ≥ 64 MiB
4. Set up proper backup strategies for SQLite database
5. Implement rate limiting at reverse proxy level
6. Monitor for suspicious authentication patterns
7. Consider key rotation policies
8. Implement audit logging

## Design Rationale

See [DESIGN.md](DESIGN.md) for detailed explanation of cryptographic choices, threat model, and security analysis.

Key design decisions:
- Username as KDF salt (acceptable for targeted attacks, simplifies UX)
- Single `accountKey` for all blobs (no per-blob keys, negligible collision risk)
- AAD binds blob name only (enables credential rotation without re-encryption)
- Slow hash of login verifier (defends against online brute force)

## License

This is a proof-of-concept implementation for educational and evaluation purposes.

## Contributing

This is a PoC implementation. For production use cases, consider:
- Bitwarden (https://bitwarden.com/) - Open source password manager
- Standard Notes (https://standardnotes.com/) - E2EE notes app
- Ente (https://ente.io/) - E2EE photo storage
