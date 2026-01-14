# Quick Start Guide

This guide will get you up and running with the cryptd backend in under 5 minutes.

## Prerequisites

- Go 1.21+ (for local development)
- Docker & Docker Compose (for containerized deployment)

## Option 1: Run Locally (Development)

### 1. Run All Tests
```bash
cd backend
go test ./...
```

Expected output: All tests pass with ~68% coverage.

### 2. Start the Server
```bash
JWT_SECRET=my-test-secret go run ./cmd/server
```

You should see:
```
Database initialized: cryptd.db
Starting server on :8080
API endpoints:
  GET    /v1/auth/kdf
  POST   /v1/auth/register
  ...
```

### 3. Test the API

In another terminal:

```bash
# Test KDF endpoint (should return 404 - no users yet)
curl http://localhost:8080/v1/auth/kdf?username=test

# Expected: {"error":"user not found"}
```

## Option 2: Run with Docker

### 1. Build and Start
```bash
# From project root
JWT_SECRET=my-secure-secret docker-compose up -d
```

### 2. Check Logs
```bash
docker-compose logs -f backend
```

### 3. Test the API
```bash
curl http://localhost:8080/v1/auth/kdf?username=test
```

## Example API Usage

### Register a User

For demonstration, here's a simplified registration flow (in production, the client would do proper crypto):

```bash
# 1. Register (with mock crypto values)
curl -X POST http://localhost:8080/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "alice",
    "kdfType": "pbkdf2_sha256",
    "kdfIterations": 600000,
    "loginVerifier": "'$(echo -n "test-verifier-32-bytes-padded" | base64)'",
    "wrappedAccountKey": {
      "nonce": "'$(echo -n "nonce-12bytes" | base64)'",
      "ciphertext": "'$(echo -n "encrypted-account-key-32-bytes" | base64)'",
      "tag": "'$(echo -n "tag-16-bytes-pad" | base64)'"
    }
  }'
```

Expected response:
```json
{"username":"alice","createdAt":"2024-01-14T..."}
```

### Get KDF Parameters

```bash
curl http://localhost:8080/v1/auth/kdf?username=alice
```

Expected response:
```json
{
  "kdfType": "pbkdf2_sha256",
  "kdfIterations": 600000
}
```

### Login/Verify

```bash
curl -X POST http://localhost:8080/v1/auth/verify \
  -H "Content-Type: application/json" \
  -d '{
    "username": "alice",
    "loginVerifier": "'$(echo -n "test-verifier-32-bytes-padded" | base64)'"
  }'
```

Expected response:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "wrappedAccountKey": {...}
}
```

### Create a Blob (Authenticated)

```bash
# Save token from previous step
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

curl -X PUT http://localhost:8080/v1/blobs/vault \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "encryptedBlob": {
      "nonce": "'$(echo -n "blob-nonce-12b" | base64)'",
      "ciphertext": "'$(echo -n "encrypted-blob-data-here" | base64)'",
      "tag": "'$(echo -n "blob-tag-16bytes" | base64)'"
    }
  }'
```

Expected response:
```json
{"blobName":"vault","updatedAt":"2024-01-14T..."}
```

### List Blobs

```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/v1/blobs
```

Expected response:
```json
[
  {
    "blobName": "vault",
    "updatedAt": "2024-01-14T...",
    "encryptedSize": 26
  }
]
```

### Get Blob

```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/v1/blobs/vault
```

Expected response:
```json
{
  "encryptedBlob": {
    "nonce": "...",
    "ciphertext": "...",
    "tag": "..."
  }
}
```

## Using the Makefile

From the project root:

```bash
# Run all tests
make test

# Run tests with coverage report
make test-coverage

# Build the binary
make build

# Run locally (requires JWT_SECRET env var)
JWT_SECRET=test make run

# Docker operations
JWT_SECRET=prod-secret make docker-up
make docker-down

# Clean up
make clean
```

## Verify Installation

Run this command to verify everything is working:

```bash
cd backend && go test ./... -v
```

You should see:
- ✅ 12 tests in db package
- ✅ 14 tests in middleware package  
- ✅ 11 tests in crypto package
- ✅ 13 tests in api package
- ✅ 3 integration tests

All tests should **PASS**.

## Next Steps

1. **Read the docs**: Check out [README.md](README.md) and [backend/README.md](backend/README.md)
2. **Review the design**: See [DESIGN.md](DESIGN.md) for crypto details
3. **Build the frontend**: The backend is ready for client integration
4. **Deploy**: Use docker-compose for production deployment

## Troubleshooting

### "JWT secret is required"
Set the JWT_SECRET environment variable:
```bash
export JWT_SECRET="your-secret-here"
```

### "database is locked"
Stop any running instances:
```bash
pkill cryptd-server
# or
docker-compose down
```

### Build errors
Make sure you have Go 1.21+ and GCC installed:
```bash
go version
gcc --version
```

### Tests fail
Clean and rebuild:
```bash
make clean
cd backend && go mod tidy
go test ./...
```

## Support

For issues or questions:
1. Check [backend/README.md](backend/README.md) for detailed docs
2. Review [DESIGN.md](DESIGN.md) for specification
3. Look at [IMPLEMENTATION.md](IMPLEMENTATION.md) for implementation details

---

**Ready to go!** 🚀

The backend is fully functional and tested. Start building the frontend or explore the API!
