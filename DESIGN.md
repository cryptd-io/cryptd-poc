# cryptd — Encrypted Blob Vault (PoC) — Design

This document describes a minimal end-to-end encryption design where the **server stores and serves opaque encrypted blobs**, and the **client (SPA) owns all plaintext and keys**.

---

## 0. Overview

### 0.1 Goals

- The server can **store** and **return** user data but cannot decrypt it.
- The client performs all cryptographic operations and handles all key material.
- Simple authentication based on a client-derived `loginVerifier`.
- Minimal CRUD API for encrypted blobs.
- Resistance to ciphertext substitution across blob names and across users.

### 0.2 Non-goals (PoC)

- Multi-device key sharing
- Account recovery
- Hardware-backed keys
- Advanced protocol hardening
- Protection against a compromised client

### 0.3 Threat model (summary)

- **Server compromise**: an attacker may read/modify user records and stored blobs. Goal: attacker cannot decrypt blob plaintext without the user password.
- **Ciphertext substitution**: an attacker may attempt to swap encrypted values across users/blobs. Goal: swapped ciphertexts do not successfully decrypt/validate under the wrong context:
  - **Across blob names (same user)**: prevented by binding `blobName` into AEAD AAD.
  - **Across users**: ciphertext is encrypted under a per-user `accountKey`, so a blob moved to another account will not validate/decrypt under a different user's `accountKey` (even though blob AAD does not include `username`).
- **Network attacker**: TLS is assumed; cryptography here provides end-to-end confidentiality/integrity at rest and in transit.

### 0.4 Conventions and invariants

- **Client identifier**: the client uses **`username` only**. The client does not rely on a server-internal `user_id`.
- **Encoding**: all binary values in JSON are **base64**.
- **AES-GCM nonce**: **96 bits (12 bytes)**, randomly generated per encryption.
- **AAD**: always supplied; UTF-8 strings in a stable namespace: `cryptd:<purpose>:v1:...`.

### 0.5 High-level flow (at a glance)

```
username + password
   |
   v
masterSecret  --HKDF-->  loginVerifier  (auth proof)
   |
   '--HKDF-->  masterKey (wrap/unwrap accountKey)
                   |
                   v
          wrappedAccountKey (stored on server)
                   |
                   v
               accountKey (root key for blobs)
                   |
                   v
             encryptedBlob (stored on server)
```

---

## 1. Cryptography

### 1.1 Terminology

| Concept                       | Canonical name    | Notes                                         |
| ----------------------------- | ----------------- | --------------------------------------------- |
| User password                 | **password**      | Never sent to the server.                     |
| Username                      | **username**      | User-chosen identifier; stored on server.     |
| Password-derived secret       | **masterSecret**  | Derived from password using username as salt. |
| Account-level symmetric key   | **accountKey**    | Random 32 bytes; generated on client.         |
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

- Root encryption key for all blobs.

---

### 1.6 Blobs

Blob content is encrypted directly using `accountKey`.

```
encryptedBlob = AES-256-GCM-Encrypt(
  key       = accountKey,
  aad       = "cryptd:blob:v1:blob:" + blobName,
  plaintext = blobData
)
```

The server stores blobs as opaque encrypted containers and never decrypts them.

---

### 1.7 AEAD container format

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

### 2.2 `blobs` table

Uniqueness: `(user_id, blob_name)`.

Fields (recommended):

- `id` (PK)
- `user_id` (FK -> users.id)
- `blob_name` (string) — user-scoped identifier
- `encrypted_blob` (container)
- `created_at`
- `updated_at`

Unique index: `(user_id, blob_name)`

---

## 3. Server API

Principles:

- The server never receives the raw password.
- The server stores/returns only encrypted containers and verifier hashes.
- All endpoints **except** `GET /v1/auth/kdf`, `POST /v1/auth/register`, and `POST /v1/auth/verify` require authentication via a **JWT bearer token**.
- Authenticated requests include: `Authorization: Bearer <token>`.

---

### 3.0 End-to-end authentication flow (required)

Login is a two-step flow because the client must obtain server-stored KDF parameters before it can derive `masterSecret` / `loginVerifier`:

1. `GET /v1/auth/kdf?username=...` → receive KDF params (public).
2. Client derives `loginVerifier` from `username + password` using the returned KDF params.
3. `POST /v1/auth/verify` with `{ username, loginVerifier }` → on success, receive `{ token }`.
4. Client uses `Authorization: Bearer <token>` for all subsequent API calls (blobs, rotation, etc.).

---

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
- On success, issue a **JWT bearer token** to be used for all subsequent authenticated requests.

Response (example):

```json
{ "token": "..." }
```

---

### 3.4 Credential rotation

For blobs, AAD intentionally **does not** bind to `username` (it binds to `blobName` only). This allows rotating credentials without having to download/decrypt/re-encrypt stored blobs.

- This does **not** weaken cross-user substitution resistance: blobs are encrypted under a per-user `accountKey`, so ciphertext copied from one account into another will fail AEAD validation/decryption under the other user's `accountKey`.
- Within the same account, swapping ciphertext between two different blob names still fails because AAD binds to `blobName`.

- **Password rotation** (supported): re-derive `masterKey` and re-wrap the existing `accountKey`. No blob re-encryption is required.
- **Username change** (supported): the client decrypts the existing `accountKey` using the old `username` AAD, then re-wraps it using the new `username` AAD. Because blob AAD does not include `username`, no blob re-encryption is required.

In this PoC it is acceptable to allow updating **all** fields in the user record except `id`. When changing **either** `username` or `password`, the client should update:

- `username` (if changed)
- `loginVerifier` / `login_verifier_hash` (derived from the new credentials)
- `wrappedAccountKey` (re-wrapped under the new `masterKey` and/or new `username` AAD)

#### 3.4.1 Example: rotation request

Endpoint (suggested): `PATCH /v1/users/me`

Auth: existing authenticated session via **JWT bearer token** (`Authorization: Bearer <token>`).

Request (client-computed values only):

- `username` is optional; include it only when changing username.
- `loginVerifier` and `wrappedAccountKey` MUST be provided whenever the password and/or username changes.

**Password rotation only** (username unchanged):

```json
{
  "loginVerifier": "base64(32 bytes)",
  "wrappedAccountKey": { "nonce": "...", "ciphertext": "...", "tag": "..." }
}
```

**Username + password rotation**:

```json
{
  "username": "new-alice",
  "loginVerifier": "base64(32 bytes)",
  "wrappedAccountKey": { "nonce": "...", "ciphertext": "...", "tag": "..." }
}
```

Server behavior:

- Resolve user from the authenticated session.
- If `username` is present: validate uniqueness and update it.
- Hash and store the new verifier (`login_verifier_hash`).
- Store the new `wrapped_account_key`.

---

## 4. Blob API (CRUD)

Auth for PoC:

- Required: JWT bearer token returned by `/v1/auth/verify` (`Authorization: Bearer <token>`).

### 4.1 Upsert blob

`PUT /v1/blobs/{blobName}`

Request:

```json
{
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

encryptedBlob = AES-GCM-Encrypt(
  key       = accountKey,
  aad       = "cryptd:blob:v1:blob:" + blobName,
  plaintext = blobPlaintext
)

send(encryptedBlob)
```

Server behavior:

- Resolve `user_id` from the authenticated session.
- Upsert row by `(user_id, blob_name)`.
- Store envelopes as-is.

---

### 4.2 Get blob

`GET /v1/blobs/{blobName}` returns:

- `encryptedBlob`

---

### 4.3 List blobs

`GET /v1/blobs` returns:

- `{ blobName, updatedAt, encryptedSize }[]`

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

---

## 6. Design Rationale & Security Analysis

This section documents intentional trade-offs and preemptively addresses common critiques for this PoC.

### 6.1 Salt selection (`username` vs. random salt)

Decision: the system uses `username` as the KDF salt.

Analysis: while industry standards typically mandate random 16-byte salts to prevent pre-computation (rainbow table) attacks, we accept this trade-off for the following reasons:

- **Targeted security**: for an attacker targeting a specific user on a specific instance, the computational cost to brute-force the password is mathematically identical regardless of whether the salt is random or the `username`.
- **Scale**: “global” pre-computation attacks are unlikely for a self-hosted/small-scale deployment.
- **Renaming strategy**: the concern that “changing a username changes the salt (and thus the key)” is mitigated by the key-wrapping architecture. A username change only requires re-wrapping `accountKey` (an \(O(1)\) operation), not re-encrypting the data.

### 6.2 Key hierarchy simplification (no per-blob keys)

Decision: blob data is encrypted directly with `accountKey`, without adding a unique per-blob key layer.

Analysis:

- **Collision resistance**: with AES-GCM and 96-bit random nonces, the probability of a nonce collision using a single key is negligible until very large numbers of encryptions (e.g., \(p \approx 10^{-15}\) for typical vault sizes).
- **Performance vs. granularity**: this flattening reduces storage overhead and encryption latency. The loss of “granular file sharing” capabilities is acceptable because it falls outside the scope of a personal vault.
- **Future proofing**: if granular sharing is required later, the system can transparently migrate by treating `accountKey` as a wrapping key for new entries.
