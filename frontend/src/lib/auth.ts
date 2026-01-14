/**
 * Authentication state management using sessionStorage
 * Token and keys are cleared when tab is closed
 */


// === Types ===

export interface AuthState {
  token: string;
  username: string;
  accountKey: Uint8Array;
  masterKey: Uint8Array;
}

// === Constants ===

const SESSION_KEY = 'cryptd_auth';

// === Storage Helpers ===

function arrayToBase64(arr: Uint8Array): string {
  return btoa(String.fromCharCode(...arr));
}

function base64ToArray(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}

// === Auth State Management ===

/**
 * Save auth state to sessionStorage (cleared on tab close)
 */
export function saveAuthState(state: AuthState): void {
  const serialized = {
    token: state.token,
    username: state.username,
    accountKey: arrayToBase64(state.accountKey),
    masterKey: arrayToBase64(state.masterKey),
  };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(serialized));
}

/**
 * Load auth state from sessionStorage
 */
export function loadAuthState(): AuthState | null {
  const stored = sessionStorage.getItem(SESSION_KEY);
  if (!stored) return null;

  try {
    const parsed = JSON.parse(stored);
    return {
      token: parsed.token,
      username: parsed.username,
      accountKey: base64ToArray(parsed.accountKey),
      masterKey: base64ToArray(parsed.masterKey),
    };
  } catch (error) {
    console.error('Failed to parse auth state:', error);
    clearAuthState();
    return null;
  }
}

/**
 * Clear auth state (logout)
 */
export function clearAuthState(): void {
  sessionStorage.removeItem(SESSION_KEY);
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
  return loadAuthState() !== null;
}

/**
 * Get current auth token
 */
export function getToken(): string | null {
  const state = loadAuthState();
  return state?.token || null;
}

/**
 * Get current username
 */
export function getUsername(): string | null {
  const state = loadAuthState();
  return state?.username || null;
}

/**
 * Get current account key
 */
export function getAccountKey(): Uint8Array | null {
  const state = loadAuthState();
  return state?.accountKey || null;
}
