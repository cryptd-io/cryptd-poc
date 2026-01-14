import { useState } from 'react';
import {
  deriveAllKeys,
  generateAccountKey,
  wrapAccountKey,
  bytesToBase64,
  unwrapAccountKey,
  type KDFParams,
} from '../lib/crypto';
import { register, verify, getKDFParams } from '../lib/api';
import { saveAuthState } from '../lib/auth';
import './Auth.css';

interface AuthProps {
  onAuthenticated: () => void;
}

const DEFAULT_KDF_PARAMS: KDFParams = {
  kdfType: 'pbkdf2_sha256',
  kdfIterations: 600_000,
};

export default function Auth({ onAuthenticated }: AuthProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Derive keys from username + password
      const { loginVerifier, masterKey } = await deriveAllKeys(
        username,
        password,
        DEFAULT_KDF_PARAMS
      );

      // Generate new account key
      const accountKey = generateAccountKey();

      // Wrap account key with master key
      const wrappedAccountKey = await wrapAccountKey(
        accountKey,
        masterKey,
        username
      );

      // Register with backend
      await register({
        username,
        kdfType: DEFAULT_KDF_PARAMS.kdfType,
        kdfIterations: DEFAULT_KDF_PARAMS.kdfIterations,
        loginVerifier: bytesToBase64(loginVerifier),
        wrappedAccountKey,
      });

      // Auto-login after registration
      await handleLoginFlow(username, password);
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await handleLoginFlow(username, password);
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleLoginFlow = async (username: string, password: string) => {
    // 1. Get KDF params from server
    const kdfParams = await getKDFParams(username);

    // 2. Derive keys using same params
    const { loginVerifier, masterKey } = await deriveAllKeys(
      username,
      password,
      kdfParams
    );

    // 3. Verify with backend and get token
    const { token, wrappedAccountKey } = await verify({
      username,
      loginVerifier: bytesToBase64(loginVerifier),
    });

    // 4. Unwrap account key
    const accountKey = await unwrapAccountKey(
      wrappedAccountKey,
      masterKey,
      username
    );

    // 5. Save to session storage (cleared on tab close)
    saveAuthState({
      token,
      username,
      accountKey,
      masterKey,
    });

    // 6. Notify parent
    onAuthenticated();
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1>cryptd</h1>
        <p className="subtitle">End-to-End Encrypted Vault</p>

        <div className="auth-tabs">
          <button
            className={isLogin ? 'active' : ''}
            onClick={() => setIsLogin(true)}
          >
            Login
          </button>
          <button
            className={!isLogin ? 'active' : ''}
            onClick={() => setIsLogin(false)}
          >
            Register
          </button>
        </div>

        <form onSubmit={isLogin ? handleLogin : handleRegister}>
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="username"
              placeholder="Enter your username"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={isLogin ? 'current-password' : 'new-password'}
              placeholder="Enter your password"
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <button type="submit" disabled={loading} className="submit-button">
            {loading ? 'Processing...' : isLogin ? 'Login' : 'Register'}
          </button>
        </form>

        <div className="info-box">
          <p>
            <strong>🔒 Your data is end-to-end encrypted</strong>
          </p>
          <p>
            The server cannot decrypt your data. All encryption happens in your
            browser.
          </p>
          <p>⚠️ Session expires when you close this tab.</p>
        </div>
      </div>
    </div>
  );
}
