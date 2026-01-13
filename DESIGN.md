# cryptd — Encrypted Blob Vault (PoC) — Design

This document specifies a minimal design where the **server stores and serves opaque encrypted blobs**, and the **client (SPA) owns all plaintext and keys**.

## Scope

- **In scope**: client-side encryption, blob wrapping/envelopes, minimal auth verifier, basic CRUD API for encrypted blobs.
- **Out of scope**: multi-device key sharing, account recovery, hardware-backed keys, advanced protocol hardening, client compromise protection.

## Threat model (summary)

- **Server compromise**: attacker can read/modify user records and stored blobs. Goal: attacker cannot decrypt blob plaintext without the user password.
- **Ciphertext substitution**: attacker can attempt to swap encrypted values across users/blobs. Goal: AEAD + AAD prevents swaps from decrypting/validating.
- **Network attacker**: TLS is assumed; cryptography here provides end-to-end confidentiality/integrity at rest and in transit.

## Conventions

- **Client identifiers**: the client uses **`username` only**. The client does not rely on a server-internal `user_id`.
- **Encoding**: all binary values in JSON are **base64**.
- **Nonce**: AES-GCM nonce is **96 bits (12 bytes)**, randomly generated per encryption.
- **AAD**: AAD is always supplied and is a UTF-8 string in a stable namespace: `cryptd:<purpose>:v1:...`.

---

## 1. Cryptography

### 1.1 Terminology

| Concept                       | Canonical name    | Notes                                         |
| ----------------------------- | ----------------- | --------------------------------------------- |
| User password                 | **password**      | Never sent to the server.                     |
| Username                      | **username**      | User-chosen identifier; stored on server.     |
| Password-derived secret       | **masterSecret**  | Derived from password using username as salt. |
| Account-level symmetric key   | **accountKey**    | Random 32 bytes; generated on client.         |
| Per-blob symmetric key        | **blobKey**       | Random 32 bytes; generated per blob.          |
| Key used to wrap accountKey   | **masterKey**     | Derived from masterSecret via HKDF.           |
| Authentication proof material | **loginVerifier** | Derived from masterSecret via HKDF.           |
| AEAD envelope                 | **container**     | `{ nonce, ciphertext, tag }` (AES-GCM).       |

Naming principle:

> Names describe **purpose**, not cryptographic construction.

---

### 1.2 Master secret derivation

All cryptographic material is derived from **username + password**.

The client derives a single high-entropy secret using a password-based KDF:

```
masterSecret = PasswordKDF(
  password,
  salt = username,
  params = userKdfParams
)
```

The server stores KDF parameters per user and returns them to the client during login.

#### Supported KDFs

- `pbkdf2_sha256`
- `argon2id`

#### Recommended parameters (Bitwarden-aligned)

- **PBKDF2-HMAC-SHA256**: `iterations ≥ 600_000`
- **Argon2id**: `memory ≥ 64 MiB`, `iterations ≥ 3`, `parallelism ≥ 4`

The server MAY allow weaker parameters for PoC/testing, but MUST enforce a minimum floor and expose strength classification.

---

### 1.3 Key derivation and domain separation

The system uses **HKDF (HMAC-SHA256)** to derive independent keys from `masterSecret`.

HKDF-Extract:

```
hkdfPrk = HKDF-Extract(
  salt = "cryptd:hkdf:v1",
  ikm  = masterSecret
)
```

HKDF-Expand:

```
loginVerifier = HKDF-Expand(
  prk    = hkdfPrk,
  info   = "login-verifier:v1",
  length = 32
)

masterKey = HKDF-Expand(
  prk    = hkdfPrk,
  info   = "master-key:v1",
  length = 32
)
```

All derived keys are 256-bit and cryptographically independent.

---

### 1.4 Login verifier (authentication)

`loginVerifier` proves **account possession** to the server.

- It is **never stored in raw form**.
- The client derives `loginVerifier` and sends it to the server.
- The server stores a **slow hash** of it and rate-limits online attempts.

Server-side storage:

```
loginVerifierHash = PBKDF2-HMAC-SHA256(
  password   = loginVerifier,
  salt       = username,
  iterations = 600_000
)
```

The server stores `loginVerifierHash` and compares it in constant time during login.

---

### 1.5 Account key

- `accountKey` is generated **randomly on the client**.
- Size: **256 bits (32 bytes)**.
- Stored on the server **only in encrypted form** (wrapped by `masterKey`).

Wrapping:

```
wrappedAccountKey = AES-256-GCM-Encrypt(
  key       = masterKey,
  aad       = "cryptd:account-key:v1:user:" + username,
  plaintext = accountKey
)
```

Purpose:

- Root encryption key for all blob keys.

---

### 1.6 Blob keys

- A new `blobKey` is generated per blob.
- It is wrapped client-side using `accountKey` and stored on the server alongside the blob.

```
wrappedBlobKey = AES-256-GCM-Encrypt(
  key       = accountKey,
  aad       = "cryptd:blob-key:v1:user:" + username + ":blob:" + blobName,
  plaintext = blobKey
)
```

---

### 1.7 Blobs

Blob content is encrypted using the corresponding `blobKey`.

```
encryptedBlob = AES-256-GCM-Encrypt(
  key       = blobKey,
  aad       = "cryptd:blob:v1:user:" + username + ":blob:" + blobName,
  plaintext = blobData
)
```

The server stores blobs as opaque encrypted containers and never decrypts them.

---

### 1.8 AEAD container format

All encrypted values use **AES-256-GCM** with this logical structure:

```
Container {
  nonce:      base64(12 bytes)
  ciphertext: base64(bytes)
  tag:        base64(16 bytes)
}
```

**AAD** MUST always be supplied and MUST uniquely bind ciphertext to its purpose and identifiers to prevent substitution/swap attacks.

---

## 2. Data Model (DB)

Note: the database may use internal surrogate keys (e.g. `users.id`). These are server-internal; the client does not require them.

### 2.1 `users` table

Purpose: store KDF params, login verifier hash, and wrapped `accountKey`.

Fields (recommended):

- `id` (PK)
- `username` (unique)
- `kdf_type` (`pbkdf2_sha256` | `argon2id`)
- `kdf_iterations` (int)
- `kdf_memory_kib` (int, nullable for PBKDF2)
- `kdf_parallelism` (int, nullable for PBKDF2)
- `login_verifier_hash` (bytes / base64)
- `wrapped_account_key` (container)
- `created_at`
- `updated_at`

---

### 2.2 `blobs` table

Uniqueness: `(user_id, blob_name)`.

Fields (recommended):

- `id` (PK)
- `user_id` (FK -> users.id)
- `blob_name` (string) — user-scoped identifier
- `wrapped_blob_key` (container)
- `encrypted_blob` (container)
- `created_at`
- `updated_at`

Unique index: `(user_id, blob_name)`

---

## 3. Server API

Principles:

- The server never receives the raw password.
- The server stores/returns only encrypted containers and verifier hashes.
- All requests that modify/read blobs require an authenticated session (cookie or bearer token).

### 3.1 Auth: fetch KDF params

`GET /v1/auth/kdf?username=...`

Response:

```json
{
  "kdfType": "argon2id",
  "kdfIterations": 3,
  "kdfMemoryKiB": 65536,
  "kdfParallelism": 4
}
```

---

### 3.2 Registration

`POST /v1/auth/register`

Request (client-computed values):

```json
{
  "username": "alice",
  "kdfType": "argon2id",
  "kdfIterations": 3,
  "kdfMemoryKiB": 65536,
  "kdfParallelism": 4,
  "loginVerifier": "base64(...)",
  "wrappedAccountKey": { "nonce": "...", "ciphertext": "...", "tag": "..." }
}
```

Client pseudocode:

```
masterSecret = KDF(password, salt=username, kdfParams)

hkdfPrk = HKDF-Extract(salt="cryptd:hkdf:v1", ikm=masterSecret)
loginVerifier = HKDF-Expand(prk=hkdfPrk, info="login-verifier:v1", length=32)
masterKey = HKDF-Expand(prk=hkdfPrk, info="master-key:v1", length=32)

accountKey = random(32)
wrappedAccountKey = AES-GCM-Encrypt(
  key       = masterKey,
  aad       = "cryptd:account-key:v1:user:" + username,
  plaintext = accountKey
)

send(username, kdfParams, loginVerifier, wrappedAccountKey)
```

Server pseudocode:

```
loginVerifierHash = PBKDF2-HMAC-SHA256(
  password   = loginVerifier,
  salt       = username,
  iterations = 600_000
)

validate username uniqueness
validate kdf params >= floor
store user row with kdf params, loginVerifierHash, wrappedAccountKey
```

---

### 3.3 Login verification

`POST /v1/auth/verify`

Request:

```json
{ "username": "alice", "loginVerifier": "base64(...)" }
```

Server behavior:

- Find user by username.
- Derive `loginVerifierHash`.
- Constant-time compare derived hash vs stored `login_verifier_hash`.
- On success, issue a session/JWT (PoC choice) or return `200`.

---

### 3.4 Credential rotation

Because AAD binds encrypted values to `username`, **changing `username` changes the AAD** used to decrypt historical values.

- **Password rotation** (supported): re-derive `masterKey` and re-wrap the existing `accountKey`. No blob re-encryption is required.
- **Username change** (not supported in this PoC): would require the client to download/decrypt/re-encrypt all wrapped keys and blobs under the new AAD scheme, or the system must introduce a stable server-provided identifier for AAD binding.

---

## 4. Blob API (CRUD)

Auth for PoC:

- Simplest: a session/JWT returned by `/v1/auth/verify`.

### 4.1 Upsert blob

`PUT /v1/blobs/{blobName}`

Request:

```json
{
  "wrappedBlobKey": { "nonce": "...", "ciphertext": "...", "tag": "..." },
  "encryptedBlob": { "nonce": "...", "ciphertext": "...", "tag": "..." }
}
```

Client pseudocode:

```
accountKey = AES-GCM-Decrypt(
  key = masterKey,
  container = wrappedAccountKey,
  aad = "cryptd:account-key:v1:user:" + username
)

blobKey = random(32)  // or reuse existing if doing in-place update
wrappedBlobKey = AES-GCM-Encrypt(
  key       = accountKey,
  aad       = "cryptd:blob-key:v1:user:" + username + ":blob:" + blobName,
  plaintext = blobKey
)

encryptedBlob = AES-GCM-Encrypt(
  key       = blobKey,
  aad       = "cryptd:blob:v1:user:" + username + ":blob:" + blobName,
  plaintext = blobPlaintext
)

send(wrappedBlobKey, encryptedBlob)
```

Server behavior:

- Resolve `user_id` from the authenticated session.
- Upsert row by `(user_id, blob_name)`.
- Store envelopes as-is.

---

### 4.2 Get blob

`GET /v1/blobs/{blobName}` returns:

- `wrappedBlobKey`
- `encryptedBlob`
- `schemaVersion` (optional, for client-side migrations)

---

### 4.3 List blobs

`GET /v1/blobs` returns:

- `{ blobName, schemaVersion, updatedAt, encryptedSize }[]`

---

### 4.4 Delete blob

`DELETE /v1/blobs/{blobName}`.

---

## 5. Frontend (SPA mini-apps)

### 5.1 Minimal approach

- One root blob (`blobName = "vault"`) containing JSON:
  - `notes`, `journal`, `finance`, plus indexes/metadata.
- Each mini-app is a route that edits a portion of the JSON.
- Save → re-encrypt and `PUT /v1/blobs/vault`.

### 5.2 Optional upgrade

- Separate blobs per domain to reduce rewrite size and merge conflicts:
  - `notes`, `journal`, `finance`, `settings`.
