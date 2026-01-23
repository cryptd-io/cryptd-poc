/**
 * Session manager for monitoring auth session validity
 */

import { verifyAuthSession } from './api';
import { getToken, clearAuthState } from './auth';

// Check session every 5 minutes
const SESSION_CHECK_INTERVAL = 5 * 60 * 1000;

let intervalId: number | null = null;
let onExpiredCallback: (() => void) | null = null;

/**
 * Start periodic session checking
 */
export function startSessionMonitoring(onExpired: () => void): void {
  // Clear any existing interval
  stopSessionMonitoring();
  
  onExpiredCallback = onExpired;
  
  // Start periodic checks
  intervalId = window.setInterval(async () => {
    const token = getToken();
    
    if (!token) {
      // No token, session already expired
      handleSessionExpired();
      return;
    }
    
    // Ping server to verify session
    const isValid = await verifyAuthSession(token);
    
    if (!isValid) {
      handleSessionExpired();
    }
  }, SESSION_CHECK_INTERVAL);
  
  // Also do an initial check
  checkSessionNow();
}

/**
 * Stop session monitoring
 */
export function stopSessionMonitoring(): void {
  if (intervalId !== null) {
    window.clearInterval(intervalId);
    intervalId = null;
  }
  onExpiredCallback = null;
}

/**
 * Check session validity immediately
 */
export async function checkSessionNow(): Promise<boolean> {
  const token = getToken();
  
  if (!token) {
    return false;
  }
  
  const isValid = await verifyAuthSession(token);
  
  if (!isValid) {
    handleSessionExpired();
  }
  
  return isValid;
}

/**
 * Handle session expiration
 */
function handleSessionExpired(): void {
  stopSessionMonitoring();
  clearAuthState();
  
  if (onExpiredCallback) {
    onExpiredCallback();
  }
}
