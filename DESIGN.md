# cryptd — Encrypted Blob Vault PoC

Goal: a minimal proof‑of‑concept where the **backend’s primary responsibility is to store and serve encrypted blobs**, while the **frontend is a SPA** (Notes / Journal / Finance) that renders HTML and maintains application data **inside one or more encrypted blobs**.

---

## 1. Cryptography

### 1.1 Terminology

| Concept                       | Canonical name   | Notes                                         |
| ----------------------------- | ---------------- | --------------------------------------------- |
| User password                 | **password**     | Never sent to the server.                     |
| Username                      | **username**     | Unique identifier; stored on server.          |
| Password‑derived secret       | **masterSecret** | Derived from password using username as salt. |
| Account‑level symmetric key   | **accountKey**   | Random 32 bytes; generated on client.         |
| Per‑blob symmetric key        | **blobKey**      | Random 32 bytes; generated per blob.          |
| Key used to wrap accountKey   | **masterKey**    | Derived from masterSecret via HKDF.           |
| Authentication proof material | **loginVerifier** | Derived from masterSecret via HKDF.           |
| AEAD envelope                 | **container**    | `{ nonce, ciphertext, tag }` (AES‑GCM).       |

Naming principle:

> Names describe **purpose**, not cryptographic construction.

---

### 1.2 Master secret derivation

All cryptographic material must be derivable from **username + password**.

The client derives a single high‑entropy secret using a password‑based KDF:

```
masterSecret = PasswordKDF(
  password,
  salt = username,
  params = userKdfParams
)
```

The server stores KDF parameters per user and returns them to the client during login.

#### Supported KDFs

* `pbkdf2_sha256`
* `argon2id`

#### Recommended parameters (Bitwarden‑aligned)

* **PBKDF2‑HMAC‑SHA256**: `iterations ≥ 600_000`
* **Argon2id**: `memory ≥ 64 MiB`, `iterations ≥ 3`, `parallelism ≥ 4`

The server MAY allow weaker parameters for PoC/testing, but MUST enforce a minimum floor and expose strength classification.

---

### 1.3 Key derivation and domain separation

The system uses **HKDF (HMAC‑SHA256)** to derive independent keys from `masterSecret`.

#### HKDF extract

```
hkdfPrk = HKDF‑Extract(
  salt = "cryptd:hkdf:v1",
  ikm  = masterSecret
)
```

#### HKDF expand

```
loginVerifier = HKDF‑Expand(
  prk    = hkdfPrk,
  info   = "login-verifier:v1",
  length = 32
)

masterKey = HKDF‑Expand(
  prk    = hkdfPrk,
  info   = "master-key:v1",
  length = 32
)
```

All derived keys are 256‑bit and cryptographically independent.

---

### 1.4 Login Verifier (authentication)

`loginVerifier` is used to prove **account possession** to the server.

* It is **never stored in raw form**.
* The client derives `loginVerifier` and sends it to the server.
* The server stores a **slow hash** of it.

Server‑side storage:

```
loginVerifierHash = PBKDF2‑HMAC‑SHA256(
  password = loginVerifier,
  salt     = username,
  iterations = 600_000
)
```

Rationale:

* CPU‑bound hashing simplifies server capacity planning.
* Online attempts are rate‑limited.
* Matches Bitwarden’s verifier model conceptually.

The server stores `loginVerifierHash` and compares it in constant time during login.

---

### 1.5 Account key

* `accountKey` is generated **randomly on the client**.
* Size: **256 bits (32 bytes)**.
* Encrypted on client and stored on the server **only in encrypted form**.

Encryption:

```
container = AES‑256‑GCM‑Encrypt(
  key = masterKey,
  aad = "cryptd:account-key:v1:user:" + username,
  plaintext = accountKey
)
```

The encrypted accountKey is stored in the user record.

Purpose:

* Serves as the root encryption key for all blob keys.

---

### 1.6 Blob keys

* A new `blobKey` is generated per blob.
* It is encrypted on client using `accountKey` and stored on server alongside the blob.

```
container = AES‑256‑GCM‑Encrypt(
  key = accountKey,
  aad = "cryptd:blob-key:v1:user:" + username + ":blob:" + blobName,
  plaintext = blobKey
)
```

---

### 1.7 Blobs

Blob content is encrypted using the corresponding `blobKey`.

```
container = AES‑256‑GCM‑Encrypt(
  key = blobKey,
  aad = "cryptd:blob:v1:user:" + userId + ":blob:" + blobName,
  plaintext = blobData
)
```

The server stores blobs as opaque encrypted containers and never decrypts them.

---

### 1.8 AEAD container format

All encrypted values use **AES‑256‑GCM** with the following logical structure:

```
Container {
  nonce:      base64(12 bytes)
  ciphertext: base64(bytes)
  tag:        base64(16 bytes)
}
```

**Additional Authenticated Data (AAD)** MUST always be supplied and MUST uniquely bind ciphertext to its purpose and identifiers to prevent substitution or swap attacks.


## 2. Data Model (DB)

### 2.1 `users` table

Purpose: store login verifier + KDF params + wrapped `accountKey`.

Fields:

- `id` (PK)
- `username` (unique)

- `kdf_type` (`pbkdf2_sha256` | `argon2id`)
- `kdf_iterations` (int)
- `kdf_memory_kib` (int, nullable for PBKDF2)
- `kdf_parallelism` (int, nullable for PBKDF2)

- `login_verifier_hash` (bytes / base64)
- `wrapped_account_key` (container) - account_key encrypted with master_key

- `created_at`
- `updated_at`

---

### 2.2 `blobs` table

Uniqueness: `(user_id, blob_name)`.

Fields:


- `id` (PK)
- `user_id` (FK -> users.id)

- `blob_name` (string) — user-scoped identifier

- `wrapped_blob_key` (container)
- `encrypted_blob` (container)

- `created_at`
- `updated_at`

unique index (user_id, blob_name)

---

## 3. Server API

Principle:

* Server never receives the raw password.
* Client derives `masterSecret` locally, then sends `loginVerifier` and encrypted envelopes.

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

Request (client‑computed values):

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
  key = masterKey,
  aad = "cryptd:account-key:v1:user:" + username,
  plaintext = accountKey
)

send(username, kdfParams, loginVerifier, wrappedAccountKey)
```

Server pseudocode:

```


loginVerifierHash = PBKDF2-HMAC-SHA256(
  password = loginVerifier,
  salt = username,
  iterations = 600000  // baseline; can be versioned later
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

Server:

* Find user by username.
* Derive `loginVerifierHash`.
* Constant‑time compare the derived hash with the stored `loginVerifierHash`.
* On success, issue session/JWT (optional PoC) or return 200.

---

### 3.4 Rotate password and/or username (no blob re‑encryption)

Key idea:

* `encryptedBlob` is encrypted with `blobKey`.
* `blobKey` is wrapped by `accountKey`.
* `accountKey` is wrapped by `masterKey` derived from password+username.

Therefore, changing password and/or username only requires:

* recomputing `loginVerifier`
* re‑wrapping the same `accountKey` with the new `masterKey`
* **no changes** to `blobs` and blob keys.

Suggested endpoint:

`POST /v1/auth/rotate-credentials`

Request:

```json
{
  "username": "alice", // new value
  "kdf": { ...optional... }, // new values
  "loginVerifier": "base64(...)" , // new
  "wrappedAccountKey": { "nonce": "...", "ciphertext": "...", "tag": "..." } // new
}
```

Client flow:

1. Decrypt `wrappedAccountKey` locally using old credentials to get `accountKey`.
2. Derive new `masterKey` using the new credentials.
3. Encrypt the same `accountKey` into `newWrappedAccountKey`.
4. Send update.

Server updates the `users` row atomically. Only passed fields are updated. This is a dangerous operation: ask the user to make a backup before doing this. An incorrect client implementation can brick the account.

---

## 4. Blob API (CRUD)

Auth for PoC:

* simplest: a session/JWT returned by `/verify`.

### 4.1 Upsert blob

`PUT /v1/blobs/{blobName}`

Request:

```json
{
  // blobName is the path parameter
  "wrappedBlobKey": { "nonce": "...", "ciphertext": "...", "tag": "..." },
  "encryptedBlob": { "nonce": "...", "ciphertext": "...", "tag": "..." }
}
```

Client pseudocode:

```
accountKey = AES-GCM-Decrypt(masterKey, wrappedAccountKey, aad="cryptd:account-key:v1:user:" + username)

blobKey = random(32)  // or reuse existing if doing in-place update
wrappedBlobKey = AES-GCM-Encrypt(
  key = accountKey,
  aad = "cryptd:blob-key:v1:user:" + username + ":blob:" + blobName,
  plaintext = blobKey
)

encryptedBlob = AES-GCM-Encrypt(
  key = blobKey,
  aad = "cryptd:blob:v1:user:" + userId + ":blob:" + blobName,
  plaintext = blobPlaintext
)

send(wrappedBlobKey, encryptedBlob)
```

Server:

* upsert row by `(userId, blobName)`
* store envelopes as‑is.

---

### 4.2 Get blob

`GET /v1/blobs/{blobName}` → returns `wrappedBlobKey`, `encryptedBlob`, `schemaVersion`.

---

### 4.3 List blobs

`GET /v1/blobs` → returns `{ blobName, schemaVersion, updatedAt, encryptedSize }[]`.

---

### 4.4 Delete blob

`DELETE /v1/blobs/{blobName}`.

---

## 5. Frontend (SPA mini‑apps)

Minimum approach:

* One root blob `blobName = "vault"` containing JSON:

  * `notes`, `journal`, `finance` plus indexes/metadata.
* Each mini‑app is a route that edits a portion of the JSON.
* Save → re‑encrypt and `PUT /v1/blobs/vault`.

Optional upgrade:

* Separate blobs per domain to reduce rewrite size and merge conflicts:

  * `notes`, `journal`, `finance`, `settings`.

