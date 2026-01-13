# Integration Test Flow Diagram

## TestIntegrationRealUsage - End-to-End Cryptographic Flow

This test demonstrates the complete lifecycle of encrypted data storage with real cryptographic operations.

```
┌─────────────────────────────────────────────────────────────────────┐
│                    STEP 1: Key Generation                            │
│                                                                       │
│  Password: "my-super-secret-password-12345"                         │
│      │                                                               │
│      ├─> Argon2id(password, kdf_salt) ──> ROOT (32 bytes)          │
│      │                                                               │
│      └─> HKDF(ROOT, "auth-key") ──> AUTH_KEY (32 bytes)            │
│      └─> HKDF(ROOT, "wrap-key") ──> K_WRAP (32 bytes)              │
│                                                                       │
│  Generate: UEK = random(32 bytes)                                    │
│  Wrap: AES-GCM(K_WRAP, UEK) ──> wrapped_uek                         │
└─────────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    STEP 2: Registration                              │
│                                                                       │
│  POST /v1/register                                                   │
│  {                                                                    │
│    username: "alice_integration_xyz",                                │
│    kdf: { type, salt, memory, iterations, parallelism },            │
│    auth_verifier_b64: base64(AUTH_KEY),                             │
│    wrapped_uek: { alg, nonce, ciphertext }                          │
│  }                                                                    │
│                                                                       │
│  Server:                                                             │
│    • Generates auth_salt                                            │
│    • Computes: auth_hash = Argon2id(AUTH_KEY, auth_salt)           │
│    • Stores: user record with wrapped_uek                           │
│                                                                       │
│  Response: user_id = "uuid"                                          │
└─────────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    STEP 3: Login & UEK Unwrap                        │
│                                                                       │
│  Re-derive keys from password:                                       │
│    ROOT ──> AUTH_KEY, K_WRAP (same as before)                       │
│                                                                       │
│  POST /v1/login                                                      │
│  {                                                                    │
│    username: "alice_integration_xyz",                                │
│    auth_verifier_b64: base64(AUTH_KEY)                              │
│  }                                                                    │
│                                                                       │
│  Server:                                                             │
│    • Verifies: Argon2id(AUTH_KEY, auth_salt) == auth_hash           │
│    • Returns: token + wrapped_uek                                   │
│                                                                       │
│  Client:                                                             │
│    • Unwrap: AES-GCM-decrypt(K_WRAP, wrapped_uek) ──> UEK           │
│    • Verify: UEK matches original ✓                                 │
└─────────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    STEP 4: Encrypt & Upload Blob                     │
│                                                                       │
│  Plaintext: "This is my secret data that should be..."              │
│      │                                                               │
│      ├─> Generate: DEK = random(32 bytes)                           │
│      │                                                               │
│      ├─> Wrap DEK: AES-GCM(UEK, DEK) ──> wrapped_dek               │
│      │                                                               │
│      └─> Encrypt: AES-GCM(DEK, plaintext) ──> ciphertext           │
│                                                                       │
│  PUT /v1/blobs/{blob_id}                                             │
│  Authorization: Bearer {token}                                       │
│  {                                                                    │
│    wrapped_dek: { alg, nonce, ciphertext },                         │
│    blob: { alg, nonce, ciphertext },                                │
│    version: 1                                                        │
│  }                                                                    │
│                                                                       │
│  Server:                                                             │
│    • Stores encrypted data (never sees plaintext)                   │
│    • Response: 201 Created                                          │
└─────────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    STEP 5: Download & Decrypt Blob                   │
│                                                                       │
│  GET /v1/blobs/{blob_id}                                             │
│  Authorization: Bearer {token}                                       │
│                                                                       │
│  Server:                                                             │
│    • Returns: wrapped_dek + blob ciphertext                         │
│                                                                       │
│  Client:                                                             │
│    • Unwrap DEK: AES-GCM-decrypt(UEK, wrapped_dek) ──> DEK          │
│    • Decrypt: AES-GCM-decrypt(DEK, ciphertext) ──> plaintext        │
└─────────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    STEP 6: Verify Plaintext                          │
│                                                                       │
│  Original:  "This is my secret data that should be..."              │
│  Decrypted: "This is my secret data that should be..."              │
│                                                                       │
│  bytes.Equal(original, decrypted) ──> ✓ TRUE                        │
│                                                                       │
│  🎉 End-to-end encryption verified!                                  │
└─────────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    STEP 7: List Blobs                                │
│                                                                       │
│  GET /v1/blobs?limit=10                                              │
│  Authorization: Bearer {token}                                       │
│                                                                       │
│  Response: [ { blob_id, version, updated_at } ]                     │
│  Verify: 1 blob found ✓                                             │
└─────────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    STEP 8: Update Blob                               │
│                                                                       │
│  New Plaintext: "This is UPDATED secret data!"                      │
│      │                                                               │
│      ├─> Generate: new_DEK = random(32 bytes)                       │
│      ├─> Wrap: AES-GCM(UEK, new_DEK) ──> new_wrapped_dek           │
│      └─> Encrypt: AES-GCM(new_DEK, new_plaintext) ──> new_ctext    │
│                                                                       │
│  PUT /v1/blobs/{blob_id}                                             │
│  { wrapped_dek, blob, version: 2 }                                  │
│                                                                       │
│  Download, decrypt, verify: "This is UPDATED secret data!" ✓        │
└─────────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    STEP 9: Delete Blob                               │
│                                                                       │
│  DELETE /v1/blobs/{blob_id}                                          │
│  Authorization: Bearer {token}                                       │
│                                                                       │
│  Response: 204 No Content                                           │
│                                                                       │
│  Verify deletion:                                                    │
│    GET /v1/blobs/{blob_id} ──> 404 Not Found ✓                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Key Cryptographic Operations Tested

### 1. Argon2id Key Derivation
```
Input:  password + salt
Params: time=3, memory=64MiB, threads=1
Output: 32-byte ROOT key
```

### 2. HKDF Key Expansion
```
Input:  ROOT key + context string
Hash:   SHA3-256
Output: 32-byte derived keys (AUTH_KEY, K_WRAP)
```

### 3. AES-256-GCM Encryption
```
Input:  32-byte key + plaintext
Output: ciphertext + 12-byte nonce + 16-byte auth tag
```

### 4. Key Wrapping Hierarchy
```
K_WRAP (derived) wraps UEK (random)
UEK (unwrapped)  wraps DEK (random per blob)
DEK (unwrapped)  encrypts plaintext
```

## Server's View (Zero Knowledge)

The server never sees:
- ❌ User password
- ❌ ROOT key
- ❌ K_WRAP key
- ❌ AUTH_KEY (only sees hash)
- ❌ UEK (only sees encrypted version)
- ❌ DEK (only sees encrypted version)
- ❌ Plaintext data (only sees ciphertext)

The server only stores:
- ✅ auth_hash (Argon2id of AUTH_KEY)
- ✅ wrapped_uek (encrypted with K_WRAP by client)
- ✅ wrapped_dek (encrypted with UEK by client)
- ✅ ciphertext (encrypted with DEK by client)

## Test Verification Points

1. ✅ ROOT derived correctly from password
2. ✅ AUTH_KEY and K_WRAP derived from ROOT
3. ✅ UEK wrapped and unwrapped correctly
4. ✅ Server accepts registration
5. ✅ Login succeeds with correct AUTH_KEY
6. ✅ UEK unwrapped from server response
7. ✅ DEK generation and wrapping
8. ✅ Blob encryption with DEK
9. ✅ Server stores encrypted data
10. ✅ DEK unwrapping after download
11. ✅ Blob decryption matches original
12. ✅ List operation works
13. ✅ Update with new encryption keys
14. ✅ Delete operation works
15. ✅ 404 after deletion

## Running the Integration Test

```bash
# Run just the integration test
go test -v ./internal/api -run TestIntegrationRealUsage

# Run with verbose output showing all steps
go test -v ./internal/api -run TestIntegration

# Run all tests including integration
make test
```

## Test Output Example

```
=== Starting Integration Test with Real Cryptography ===
Username: alice_integration_f59f7fbf
Password: my-super-secret-password-12345
Plaintext length: 59 bytes

--- STEP 1: Generate Keys for Registration ---
ROOT key derived (32 bytes)
AUTH_KEY derived (32 bytes)
K_WRAP derived (32 bytes)
UEK generated (32 bytes)
UEK wrapped (ciphertext: 48 bytes, nonce: 12 bytes)

--- STEP 2: Register User ---
✓ User registered successfully (user_id: eee0be08-0533-4f7e-9c6c-6bb61ca23add)

--- STEP 3: Login and Unwrap UEK ---
Keys re-derived for login
✓ Login successful (token: jTCt_L3VrLju1UnO...)
✓ UEK unwrapped successfully and matches original

--- STEP 4: Encrypt and Upload Blob ---
Blob ID: 6e96626b-e00b-4018-9828-77f4b794c823
Plaintext: This is my secret data that should be encrypted end-to-end!
DEK generated (32 bytes)
DEK wrapped (ciphertext: 48 bytes, nonce: 12 bytes)
Blob encrypted (ciphertext: 75 bytes, nonce: 12 bytes)
✓ Blob uploaded successfully

--- STEP 5: Download and Decrypt Blob ---
✓ Blob downloaded successfully
✓ DEK unwrapped (32 bytes)
✓ Blob decrypted (59 bytes)

--- STEP 6: Verify Decrypted Data ---
✓ Decrypted plaintext matches original!
   Original:  This is my secret data that should be encrypted end-to-end!
   Decrypted: This is my secret data that should be encrypted end-to-end!

=== ✅ Integration Test Complete - All Steps Passed ===
```
