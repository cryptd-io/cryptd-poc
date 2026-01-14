/**
 * API client for cryptd backend
 */

import type { Container, KDFParams } from './crypto';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8080';

// === Types ===

export interface RegisterRequest {
  username: string;
  kdfType: string;
  kdfIterations: number;
  kdfMemoryKiB?: number;
  kdfParallelism?: number;
  loginVerifier: string;
  wrappedAccountKey: Container;
}

export interface VerifyRequest {
  username: string;
  loginVerifier: string;
}

export interface VerifyResponse {
  token: string;
  wrappedAccountKey: Container;
}

export interface UpdateUserRequest {
  username?: string;
  loginVerifier: string;
  wrappedAccountKey: Container;
}

export interface UpsertBlobRequest {
  encryptedBlob: Container;
}

export interface BlobResponse {
  encryptedBlob: Container;
}

export interface BlobListItem {
  blobName: string;
  updatedAt: string;
  encryptedSize: number;
}

// === API Error ===

export class APIError extends Error {
  status: number;
  data?: any;
  
  constructor(message: string, status: number, data?: any) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.data = data;
  }
}

// === Helper Functions ===

async function fetchJSON(
  url: string,
  options: RequestInit = {}
): Promise<any> {
  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new APIError(
      errorData.error || `HTTP ${response.status}`,
      response.status,
      errorData
    );
  }

  return response.json();
}

function withAuth(token: string, headers: Record<string, string> = {}): Record<string, string> {
  return {
    ...headers,
    Authorization: `Bearer ${token}`,
  };
}

// === Public Endpoints ===

/**
 * Get KDF parameters for a username
 */
export async function getKDFParams(username: string): Promise<KDFParams> {
  return fetchJSON(`/v1/auth/kdf?username=${encodeURIComponent(username)}`);
}

/**
 * Register a new user
 */
export async function register(request: RegisterRequest): Promise<void> {
  await fetchJSON('/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

/**
 * Verify credentials and get JWT token
 */
export async function verify(request: VerifyRequest): Promise<VerifyResponse> {
  return fetchJSON('/v1/auth/verify', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

// === Authenticated Endpoints ===

/**
 * Update user credentials (password/username rotation)
 */
export async function updateUser(
  token: string,
  request: UpdateUserRequest
): Promise<void> {
  await fetchJSON('/v1/users/me', {
    method: 'PATCH',
    headers: withAuth(token),
    body: JSON.stringify(request),
  });
}

/**
 * Upsert (create or update) a blob
 */
export async function upsertBlob(
  token: string,
  blobName: string,
  request: UpsertBlobRequest
): Promise<void> {
  await fetchJSON(`/v1/blobs/${encodeURIComponent(blobName)}`, {
    method: 'PUT',
    headers: withAuth(token),
    body: JSON.stringify(request),
  });
}

/**
 * Get a blob by name
 */
export async function getBlob(
  token: string,
  blobName: string
): Promise<BlobResponse> {
  return fetchJSON(`/v1/blobs/${encodeURIComponent(blobName)}`, {
    headers: withAuth(token),
  });
}

/**
 * List all blobs
 */
export async function listBlobs(token: string): Promise<BlobListItem[]> {
  return fetchJSON('/v1/blobs', {
    headers: withAuth(token),
  });
}

/**
 * Delete a blob
 */
export async function deleteBlob(
  token: string,
  blobName: string
): Promise<void> {
  await fetchJSON(`/v1/blobs/${encodeURIComponent(blobName)}`, {
    method: 'DELETE',
    headers: withAuth(token),
  });
}
