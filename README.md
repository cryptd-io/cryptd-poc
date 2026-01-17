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
├── frontend/         # React/Vite frontend (TypeScript)
│   ├── src/
│   │   ├── lib/      # Crypto, API, and auth utilities
│   │   └── components/ # React components (Auth, Notes, Diary)
│   └── README.md     # Frontend-specific documentation
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
- Node.js 18+ (for frontend)
- Docker & Docker Compose (optional, for containerized deployment)
- Make (optional, for convenience commands)

### Option 1: Local Development (Backend + Frontend)

1. **Set JWT Secret** (required for backend):
   ```bash
   export JWT_SECRET="your-secure-random-secret-here"
   ```

2. **Start the backend**:
   ```bash
   make backend-run
   # or manually:
   cd backend && go run ./cmd/server -jwt-secret $JWT_SECRET
   ```

   The backend will start on http://localhost:8080

3. **In a new terminal, start the frontend**:
   ```bash
   make frontend-dev
   # or manually:
   cd frontend && npm install && npm run dev
   ```

   The frontend will start on http://localhost:5173

4. **Open your browser**:
   Navigate to http://localhost:5173 and register a new account!

### Option 2: Docker Deployment (Recommended for Production)

1. **Set JWT Secret** (optional, or use default):
   ```bash
   export JWT_SECRET="your-secure-random-secret-here"
   ```

2. **Start all services with docker-compose**:
   ```bash
   make docker-up
   # or manually:
   docker-compose up -d
   ```

   This will start:
   - **Backend** on http://localhost:8080
   - **Frontend** on http://localhost (port 80)

3. **Check logs**:
   ```bash
   # All services
   make docker-logs
   
   # Backend only
   make docker-logs-backend
   
   # Frontend only
   make docker-logs-frontend
   ```

4. **Open your browser**:
   Navigate to **http://localhost**

5. **Stop services**:
   ```bash
   make docker-down
   ```

> **Note**: The frontend Nginx server proxies API requests (`/v1/*`) to the backend automatically. No CORS configuration needed!

## Frontend Applications

The frontend includes two mini-apps that demonstrate end-to-end encryption:

### 📝 Notes App
- Create, edit, and delete notes
- Each note has a title and content
- List view with previews and search
- All data encrypted in `notes` blob

### 📖 Diary App  
- Personal journal with feed-style display
- Create, edit, and delete diary entries
- Chronological timeline (newest first)
- Relative timestamps ("2 hours ago")
- All data encrypted in `diary` blob

**Key Feature**: Each app stores data in its own blob, so they're completely independent!

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

#### Backend
- `JWT_SECRET` (required): Secret key for JWT token signing
  ```bash
  export JWT_SECRET="$(openssl rand -base64 32)"
  ```
- `CORS_ALLOWED_ORIGINS` (optional): Comma-separated list of allowed CORS origins
  ```bash
  export CORS_ALLOWED_ORIGINS="https://app.example.com,https://www.example.com"
  ```
  Default: localhost origins for development

#### Frontend
- `VITE_API_BASE` (optional): Backend API URL (set at build time)
  ```bash
  export VITE_API_BASE="https://api.example.com"
  ```
  Default: `http://localhost:8080`

### Command-line Flags

```bash
./cryptd-server \
  -port 8080 \
  -db /path/to/cryptd.db \
  -jwt-secret "your-secret"
```

## CI/CD and Docker

This project includes GitHub Actions workflows for automatically building and publishing Docker images.

See [GITHUB_WORKFLOWS.md](GITHUB_WORKFLOWS.md) for detailed information on:
- Setting up GitHub Container Registry
- Configuring CORS and API URLs for production
- Using pre-built Docker images
- Deployment examples

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
