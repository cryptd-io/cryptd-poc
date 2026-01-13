# Cryptd PoC - Encrypted Blob Store Backend

A Go-based backend service for storing encrypted blobs with client-side encryption. All cryptographic operations are performed on the client; the server never has access to plaintext data.

## Features

- **Client-side encryption**: Server never sees plaintext data
- **User authentication**: Argon2id-based password hashing with verifier pattern
- **Encrypted blob storage**: Store arbitrary encrypted data with wrapped encryption keys
- **RESTful API**: Clean JSON API with proper HTTP status codes
- **SQLite database**: Simple, embedded database for PoC
- **Comprehensive tests**: Full test coverage for all endpoints

## Architecture

### Encryption Model

1. **ROOT Key**: Derived on client from password using Argon2id (client controls KDF parameters)
2. **AUTH_KEY**: Derived from ROOT using HKDF, used as verifier (sent to server)
3. **K_WRAP**: Derived from ROOT using HKDF, used to wrap the UEK
4. **UEK** (User Encryption Key): Random 32-byte key, wrapped with K_WRAP and stored on server
5. **DEK** (Data Encryption Key): Per-blob random key, wrapped with UEK and stored with blob

Server only stores:
- Argon2id hash of AUTH_KEY (verifier) for authentication
- Wrapped UEK (encrypted with client's K_WRAP)
- Wrapped DEK (encrypted with UEK on client)
- Encrypted blob data (encrypted with DEK on client)

### Database Schema

#### Users Table
```sql
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    
    -- KDF parameters (client-side)
    kdf_type TEXT NOT NULL,
    kdf_salt_b64 TEXT NOT NULL,
    kdf_memory_kib INTEGER NOT NULL,
    kdf_iterations INTEGER NOT NULL,
    kdf_parallelism INTEGER NOT NULL,
    
    -- Authentication
    auth_salt_b64 TEXT NOT NULL,
    auth_hash_b64 TEXT NOT NULL,
    
    -- Wrapped UEK
    wrapped_uek_b64 TEXT NOT NULL,
    wrapped_uek_nonce_b64 TEXT NOT NULL,
    wrapped_uek_alg TEXT NOT NULL,
    
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

#### Blobs Table
```sql
CREATE TABLE blobs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    
    -- Wrapped DEK
    wrapped_dek_b64 TEXT NOT NULL,
    wrapped_dek_nonce_b64 TEXT NOT NULL,
    wrapped_dek_alg TEXT NOT NULL,
    
    -- Encrypted data
    ciphertext_b64 TEXT NOT NULL,
    nonce_b64 TEXT NOT NULL,
    alg TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    
    deleted_at TIMESTAMP NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE (user_id, id)
);
```

## API Endpoints

### Public Endpoints

#### 1. Register User

**POST** `/v1/register`

Register a new user with encrypted UEK.

**Request Body:**
```json
{
  "username": "alice",
  "kdf": {
    "type": "argon2id",
    "salt_b64": "BASE64_16_BYTES",
    "memory_kib": 65536,
    "iterations": 3,
    "parallelism": 1
  },
  "auth_verifier_b64": "BASE64_32_BYTES_AUTH_KEY",
  "wrapped_uek": {
    "alg": "A256GCM",
    "nonce_b64": "BASE64_12_BYTES",
    "ciphertext_b64": "BASE64_ENCRYPTED_UEK"
  }
}
```

**Response (201 Created):**
```json
{
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "kdf": {
    "type": "argon2id",
    "salt_b64": "BASE64_16_BYTES",
    "memory_kib": 65536,
    "iterations": 3,
    "parallelism": 1
  }
}
```

**Error Responses:**
- `400 Bad Request`: Invalid request body or missing fields
- `409 Conflict`: Username already exists

---

#### 2. Login

**POST** `/v1/login`

Authenticate and get session token.

**Request Body:**
```json
{
  "username": "alice",
  "auth_verifier_b64": "BASE64_32_BYTES_AUTH_KEY"
}
```

**Response (200 OK):**
```json
{
  "token": "SESSION_TOKEN",
  "user": {
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "kdf": {
      "type": "argon2id",
      "salt_b64": "BASE64_16_BYTES",
      "memory_kib": 65536,
      "iterations": 3,
      "parallelism": 1
    },
    "wrapped_uek": {
      "alg": "A256GCM",
      "nonce_b64": "BASE64_12_BYTES",
      "ciphertext_b64": "BASE64_ENCRYPTED_UEK"
    }
  }
}
```

**Error Responses:**
- `400 Bad Request`: Invalid request body
- `401 Unauthorized`: Invalid username or password

---

### Protected Endpoints

All protected endpoints require `Authorization: Bearer <token>` header.

#### 3. Put Blob

**PUT** `/v1/blobs/{blob_id}`

Create or update an encrypted blob.

**Request Body:**
```json
{
  "wrapped_dek": {
    "alg": "A256GCM",
    "nonce_b64": "BASE64_12_BYTES",
    "ciphertext_b64": "BASE64_WRAPPED_DEK"
  },
  "blob": {
    "alg": "A256GCM",
    "nonce_b64": "BASE64_12_BYTES",
    "ciphertext_b64": "BASE64_ENCRYPTED_DATA"
  },
  "version": 1
}
```

**Response (201 Created / 200 OK):**
```json
{
  "blob_id": "550e8400-e29b-41d4-a716-446655440000",
  "version": 1,
  "updated_at": "2026-01-12T10:30:00.000Z"
}
```

**Error Responses:**
- `400 Bad Request`: Invalid request body or blob_id format
- `401 Unauthorized`: Missing or invalid token

---

#### 4. Get Blob

**GET** `/v1/blobs/{blob_id}`

Retrieve an encrypted blob.

**Response (200 OK):**
```json
{
  "blob_id": "550e8400-e29b-41d4-a716-446655440000",
  "version": 1,
  "wrapped_dek": {
    "alg": "A256GCM",
    "nonce_b64": "BASE64_12_BYTES",
    "ciphertext_b64": "BASE64_WRAPPED_DEK"
  },
  "blob": {
    "alg": "A256GCM",
    "nonce_b64": "BASE64_12_BYTES",
    "ciphertext_b64": "BASE64_ENCRYPTED_DATA"
  },
  "updated_at": "2026-01-12T10:30:00.000Z"
}
```

**Error Responses:**
- `401 Unauthorized`: Missing or invalid token
- `404 Not Found`: Blob not found

---

#### 5. List Blobs

**GET** `/v1/blobs?limit=50&offset=0`

List user's blobs with pagination.

**Query Parameters:**
- `limit` (optional): Number of items to return (1-1000, default: 50)
- `offset` (optional): Offset for pagination (default: 0)

**Response (200 OK):**
```json
{
  "items": [
    {
      "blob_id": "550e8400-e29b-41d4-a716-446655440000",
      "version": 1,
      "updated_at": "2026-01-12T10:30:00.000Z"
    }
  ],
  "next_cursor": "50"
}
```

**Error Responses:**
- `400 Bad Request`: Invalid query parameters
- `401 Unauthorized`: Missing or invalid token

---

#### 6. Delete Blob

**DELETE** `/v1/blobs/{blob_id}`

Permanently delete a blob.

**Response (204 No Content)**

**Error Responses:**
- `401 Unauthorized`: Missing or invalid token
- `404 Not Found`: Blob not found

---

## Installation & Usage

### Prerequisites

- Go 1.22 or later
- SQLite3

### Build

```bash
go mod tidy
go build -o bin/cryptd-server
```

### Run

```bash
# Run with default settings (port 8080, cryptd.db)
./bin/cryptd-server

# Run with custom settings
./bin/cryptd-server -addr :9000 -db /path/to/database.db
```

### Command-line Options

- `-addr`: HTTP server address (default: `:8080`)
- `-db`: SQLite database path (default: `cryptd.db`)

### Run Tests

```bash
# Run all tests
go test -v ./...

# Run only integration tests (with real crypto)
go test -v ./internal/api -run TestIntegration

# Run with coverage
make test-coverage
```

**Test Suite Includes:**
- Unit tests for all API endpoints (18 test cases)
- Integration test with real cryptography (9 steps)
- Cryptographic primitives tests (4 test cases)
- Database operations tests

### Docker Deployment

Build and run with Docker Compose:

```bash
docker-compose up -d
```

Build Docker image manually:

```bash
docker build -t cryptd-server .
docker run -p 8080:8080 -v cryptd-data:/data cryptd-server
```

### Using Makefile

```bash
make help          # Show all available commands
make build         # Build the server
make test          # Run tests
make run           # Build and run server
make clean         # Clean build artifacts
```

## Security Notes

### Server-side Argon2id Parameters

The server uses the following parameters for hashing the auth verifier:
- Time: 2 iterations
- Memory: 32 MiB (32768 KiB)
- Threads: 2
- Key length: 32 bytes

These are separate from client-side KDF parameters and provide defense-in-depth.

### Session Management

- Sessions are stored in-memory (PoC only)
- For production, use Redis or a proper session store
- Implement session expiration and refresh tokens

### Data Validation

- All base64 fields are validated
- UUIDs are validated for blob_id
- Request bodies are size-limited by HTTP server settings

## Project Structure

```
cryptd-poc/
├── main.go                 # Application entry point
├── internal/
│   ├── api/               # HTTP handlers and routing
│   │   ├── server.go      # Server setup and routing
│   │   ├── auth.go        # Registration and auth middleware
│   │   ├── login.go       # Login endpoint
│   │   ├── blobs.go       # Blob CRUD endpoints
│   │   ├── context.go     # Request context helpers
│   │   ├── util.go        # JSON helpers
│   │   └── api_test.go    # Comprehensive tests
│   └── db/                # Database layer
│       ├── db.go          # Database initialization and models
│       ├── users.go       # User operations
│       └── blobs.go       # Blob operations
├── go.mod
├── go.sum
└── README.md
```

## Example Client Flow

### Registration
1. Client derives ROOT from password using Argon2id
2. Client derives AUTH_KEY and K_WRAP from ROOT using HKDF
3. Client generates random UEK (32 bytes)
4. Client encrypts UEK with K_WRAP (AES-256-GCM)
5. Client sends username, KDF params, AUTH_KEY, and wrapped UEK to `/v1/register`
6. Server generates auth_salt and hashes AUTH_KEY with Argon2id
7. Server stores everything and returns user_id

### Login
1. Client derives ROOT, AUTH_KEY from password (using KDF params)
2. Client sends username and AUTH_KEY to `/v1/login`
3. Server verifies AUTH_KEY hash and returns session token + wrapped UEK
4. Client decrypts UEK with K_WRAP

### Storing a Blob
1. Client generates random DEK (32 bytes)
2. Client encrypts DEK with UEK (AES-256-GCM) → wrapped_dek
3. Client encrypts data with DEK (AES-256-GCM) → ciphertext
4. Client sends wrapped_dek and ciphertext to `/v1/blobs/{blob_id}`
5. Server stores everything without decryption

### Reading a Blob
1. Client requests blob from `/v1/blobs/{blob_id}`
2. Server returns wrapped_dek and ciphertext
3. Client decrypts DEK with UEK
4. Client decrypts data with DEK

## License

MIT License

## Contributing

This is a PoC implementation. For production use, consider:
- Persistent session storage (Redis)
- Rate limiting
- Request size limits
- Audit logging
- Metrics and monitoring
- TLS/HTTPS support
- Database connection pooling
- Graceful error recovery
- API versioning strategy
