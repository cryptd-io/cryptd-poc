/**
 * Client-side cryptography utilities for cryptd
 * Implements the full crypto flow from DESIGN.md
 */

import { pbkdf2 } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { hkdf } from '@noble/hashes/hkdf.js';

// === Types ===

export interface Container {
  nonce: string;      // base64
  ciphertext: string; // base64
  tag: string;        // base64
}

export interface KDFParams {
  kdfType: 'pbkdf2_sha256' | 'argon2id';
  kdfIterations: number;
  kdfMemoryKiB?: number;
  kdfParallelism?: number;
}

export interface DerivedKeys {
  masterSecret: Uint8Array;
  loginVerifier: Uint8Array;
  masterKey: Uint8Array;
}

// === Constants ===

const HKDF_SALT = 'cryptd:hkdf:v1';
const LOGIN_VERIFIER_INFO = 'login-verifier:v1';
const MASTER_KEY_INFO = 'master-key:v1';

// === Utility Functions ===

function encodeUTF8(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

function base64Encode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function base64Decode(str: string): Uint8Array {
  return Uint8Array.from(atob(str), c => c.charCodeAt(0));
}

function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

// === KDF: Master Secret Derivation ===

/**
 * Derive masterSecret from username + password
 * Currently supports PBKDF2-SHA256 only (Argon2id requires WebAssembly)
 */
export async function deriveMasterSecret(
  username: string,
  password: string,
  params: KDFParams
): Promise<Uint8Array> {
  const passwordBytes = encodeUTF8(password);
  const saltBytes = encodeUTF8(username);

  if (params.kdfType === 'pbkdf2_sha256') {
    // Use @noble/hashes PBKDF2
    return pbkdf2(sha256, passwordBytes, saltBytes, {
      c: params.kdfIterations,
      dkLen: 32
    });
  } else if (params.kdfType === 'argon2id') {
    // For PoC, we'll use PBKDF2 as fallback (Argon2 requires WASM)
    // In production, use @noble/hashes/argon2 or similar
    console.warn('Argon2id not implemented in browser, falling back to PBKDF2');
    return pbkdf2(sha256, passwordBytes, saltBytes, {
      c: params.kdfIterations,
      dkLen: 32
    });
  }

  throw new Error(`Unsupported KDF type: ${params.kdfType}`);
}

// === HKDF: Key Derivation ===

/**
 * Derive loginVerifier and masterKey from masterSecret using HKDF
 */
export function deriveKeys(masterSecret: Uint8Array): DerivedKeys {
  const hkdfSalt = encodeUTF8(HKDF_SALT);
  
  // HKDF-Expand to derive independent keys
  const loginVerifier = hkdf(sha256, masterSecret, hkdfSalt, encodeUTF8(LOGIN_VERIFIER_INFO), 32);
  const masterKey = hkdf(sha256, masterSecret, hkdfSalt, encodeUTF8(MASTER_KEY_INFO), 32);

  return {
    masterSecret,
    loginVerifier,
    masterKey
  };
}

/**
 * Complete key derivation from username + password
 */
export async function deriveAllKeys(
  username: string,
  password: string,
  params: KDFParams
): Promise<DerivedKeys> {
  const masterSecret = await deriveMasterSecret(username, password, params);
  return deriveKeys(masterSecret);
}

// === AES-256-GCM Encryption/Decryption ===

/**
 * Encrypt plaintext using AES-256-GCM with AAD
 */
export async function encryptAES256GCM(
  key: Uint8Array,
  plaintext: Uint8Array,
  aad: string
): Promise<Container> {
  const nonce = randomBytes(12); // 96 bits
  const aadBytes = encodeUTF8(aad);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: nonce as BufferSource,
      additionalData: aadBytes as BufferSource,
      tagLength: 128 // 16 bytes
    },
    cryptoKey,
    plaintext as BufferSource
  );

  // AES-GCM output is ciphertext + tag (last 16 bytes)
  const encryptedBytes = new Uint8Array(encrypted);
  const ciphertext = encryptedBytes.slice(0, -16);
  const tag = encryptedBytes.slice(-16);

  return {
    nonce: base64Encode(nonce),
    ciphertext: base64Encode(ciphertext),
    tag: base64Encode(tag)
  };
}

/**
 * Decrypt container using AES-256-GCM with AAD
 */
export async function decryptAES256GCM(
  key: Uint8Array,
  container: Container,
  aad: string
): Promise<Uint8Array> {
  const nonce = base64Decode(container.nonce);
  const ciphertext = base64Decode(container.ciphertext);
  const tag = base64Decode(container.tag);
  const aadBytes = encodeUTF8(aad);

  // Combine ciphertext + tag for Web Crypto API
  const combined = new Uint8Array(ciphertext.length + tag.length);
  combined.set(ciphertext, 0);
  combined.set(tag, ciphertext.length);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  try {
    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: nonce as BufferSource,
        additionalData: aadBytes as BufferSource,
        tagLength: 128
      },
      cryptoKey,
      combined as BufferSource
    );

    return new Uint8Array(decrypted);
  } catch {
    throw new Error('Decryption failed - invalid key or tampered data');
  }
}

// === High-Level Crypto Operations ===

/**
 * Generate a new random account key (32 bytes)
 */
export function generateAccountKey(): Uint8Array {
  return randomBytes(32);
}

/**
 * Wrap account key with master key
 */
export async function wrapAccountKey(
  accountKey: Uint8Array,
  masterKey: Uint8Array,
  username: string
): Promise<Container> {
  const aad = `cryptd:account-key:v1:user:${username}`;
  return encryptAES256GCM(masterKey, accountKey, aad);
}

/**
 * Unwrap account key with master key
 */
export async function unwrapAccountKey(
  wrappedAccountKey: Container,
  masterKey: Uint8Array,
  username: string
): Promise<Uint8Array> {
  const aad = `cryptd:account-key:v1:user:${username}`;
  return decryptAES256GCM(masterKey, wrappedAccountKey, aad);
}

/**
 * Encrypt blob data with account key
 */
export async function encryptBlob(
  blobData: string | object,
  accountKey: Uint8Array,
  blobName: string
): Promise<Container> {
  const plaintext = typeof blobData === 'string' 
    ? encodeUTF8(blobData)
    : encodeUTF8(JSON.stringify(blobData));
  
  const aad = `cryptd:blob:v1:blob:${blobName}`;
  return encryptAES256GCM(accountKey, plaintext, aad);
}

/**
 * Decrypt blob data with account key
 */
export async function decryptBlob(
  encryptedBlob: Container,
  accountKey: Uint8Array,
  blobName: string
): Promise<string> {
  const aad = `cryptd:blob:v1:blob:${blobName}`;
  const decrypted = await decryptAES256GCM(accountKey, encryptedBlob, aad);
  return new TextDecoder().decode(decrypted);
}

// === Encoding Helpers ===

/**
 * Encode bytes to base64 for API transmission
 */
export function bytesToBase64(bytes: Uint8Array): string {
  return base64Encode(bytes);
}

/**
 * Decode base64 to bytes
 */
export function base64ToBytes(str: string): Uint8Array {
  return base64Decode(str);
}
