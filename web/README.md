# cryptd Frontend

React + TypeScript + Vite frontend for the cryptd encrypted vault.

## Features

### 🔐 End-to-End Encryption
- All encryption happens client-side in the browser
- Server never sees plaintext data or encryption keys
- Password-based key derivation (PBKDF2-SHA256)
- AES-256-GCM authenticated encryption
- HKDF-based key hierarchy

### 📝 Notes App
- Create, edit, and delete notes
- Each note has a title and content
- List view with note previews
- All data stored in encrypted `notes` blob

### 📖 Diary App
- Feed-style diary entries
- Create, edit, and delete entries
- Chronological display (newest first)
- Relative timestamps (e.g., "2 hours ago")
- All data stored in encrypted `diary` blob

### 🔒 Session Management
- Auth token and keys stored in `sessionStorage`
- Automatically cleared when tab is closed
- No persistent storage of sensitive data
- JWT-based authentication with backend

## Architecture

### Project Structure

```
web/
├── src/
│   ├── lib/
│   │   ├── crypto.ts      # Cryptographic utilities (KDF, HKDF, AES-GCM)
│   │   ├── api.ts         # Backend API client
│   │   └── auth.ts        # Session storage management
│   ├── components/
│   │   ├── Auth.tsx       # Login/Register component
│   │   ├── Auth.css
│   │   ├── Notes.tsx      # Notes app
│   │   ├── Notes.css
│   │   ├── Diary.tsx      # Diary app
│   │   └── Diary.css
│   ├── App.tsx            # Main app with routing
│   ├── App.css
│   ├── main.tsx           # Entry point
│   └── index.css
├── index.html
├── vite.config.ts         # Vite config with proxy
└── package.json
```

### Crypto Flow

1. **Registration**:
   ```
   username + password
      → PBKDF2 (600k iterations)
      → masterSecret
      → HKDF → loginVerifier (sent to server)
             → masterKey (kept client-side)
      → Generate random accountKey
      → Wrap accountKey with masterKey (AES-GCM)
      → Send to server: loginVerifier + wrappedAccountKey
   ```

2. **Login**:
   ```
   1. GET /v1/auth/kdf?username=... → KDF params
   2. Derive masterSecret using same params
   3. Derive loginVerifier from masterSecret
   4. POST /v1/auth/verify → JWT token + wrappedAccountKey
   5. Unwrap accountKey using masterKey
   6. Store in sessionStorage: token, username, accountKey, masterKey
   ```

3. **Encrypt Blob**:
   ```
   blobData (JSON)
      → JSON.stringify
      → AES-256-GCM encrypt with accountKey
      → AAD = "cryptd:blob:v1:blob:notes" (or "diary")
      → Container { nonce, ciphertext, tag }
      → PUT /v1/blobs/notes
   ```

4. **Decrypt Blob**:
   ```
   GET /v1/blobs/notes
      → Container { nonce, ciphertext, tag }
      → AES-256-GCM decrypt with accountKey
      → AAD verification
      → JSON.parse
      → blobData
   ```

### Data Storage

Each app stores its data in a separate blob:

- **Notes blob** (`blobName = "notes"`):
  ```json
  {
    "notes": [
      {
        "id": "uuid",
        "title": "Note Title",
        "content": "Note content...",
        "createdAt": 1234567890,
        "updatedAt": 1234567890
      }
    ]
  }
  ```

- **Diary blob** (`blobName = "diary"`):
  ```json
  {
    "entries": [
      {
        "id": "uuid",
        "content": "Entry content...",
        "createdAt": 1234567890,
        "updatedAt": 1234567890
      }
    ]
  }
  ```

## Development

### Prerequisites
- Node.js 18+ (for native Web Crypto API support)
- Backend server running on http://localhost:8080

### Install Dependencies
```bash
npm install
```

### Run Development Server
```bash
npm run dev
```

The app will be available at http://localhost:5173

### Build for Production
```bash
npm run build
```

Output will be in `dist/` directory.

### Preview Production Build
```bash
npm run preview
```

## Configuration

### Environment Variables

Create a `.env` file (optional):

```env
VITE_API_BASE=http://localhost:8080
```

Default is `http://localhost:8080` if not set.

### Vite Proxy

The `vite.config.ts` includes a proxy to avoid CORS issues during development:

```typescript
proxy: {
  '/v1': {
    target: 'http://localhost:8080',
    changeOrigin: true,
  }
}
```

This means API calls to `/v1/*` are automatically proxied to the backend.

## Security Notes

### What This Provides ✅
- **Zero-knowledge encryption**: Server cannot decrypt user data
- **Client-side key derivation**: All crypto happens in browser
- **Authenticated encryption**: AES-GCM prevents tampering
- **Domain separation**: HKDF ensures cryptographic independence
- **Session-only storage**: Keys cleared when tab closes

### What This Does NOT Provide ❌
- **Multi-device sync**: No key sharing mechanism
- **Account recovery**: Lost password = lost data
- **Offline support**: Requires network connection
- **Hardware security**: No Secure Enclave / TPM integration
- **Advanced features**: No tags, search, attachments, etc.

### Production Considerations

If deploying beyond PoC:

1. **HTTPS Required**: All traffic MUST use TLS
2. **CSP Headers**: Implement Content Security Policy
3. **Subresource Integrity**: Use SRI for external scripts
4. **Rate Limiting**: Protect against brute force
5. **CSRF Protection**: Implement CSRF tokens if needed
6. **Secure Context**: Ensure `window.isSecureContext === true`
7. **Audit Logging**: Track auth attempts and suspicious activity
8. **Key Rotation**: Plan for credential rotation flows

## Browser Compatibility

Requires modern browser with Web Crypto API:

- Chrome/Edge 70+
- Firefox 75+
- Safari 14+

Not supported:
- Internet Explorer
- Legacy mobile browsers

## Dependencies

### Runtime Dependencies
- **react** & **react-dom**: UI framework
- **react-router-dom**: Client-side routing
- **@noble/hashes**: Cryptographic primitives (PBKDF2, HKDF)

### Why @noble/hashes?
- Pure TypeScript (no native dependencies)
- Audited and well-maintained
- Smaller bundle size than alternatives
- Compatible with Web Crypto API

### Dev Dependencies
- **vite**: Build tool and dev server
- **typescript**: Type safety
- **@vitejs/plugin-react**: React Fast Refresh

## Usage Guide

### 1. Register a New Account

1. Open http://localhost:5173
2. Click "Register" tab
3. Enter username and password
4. Click "Register"
5. Automatically logged in after registration

**Note**: Username must be unique. Password is never sent to server.

### 2. Login

1. Open http://localhost:5173
2. Enter username and password
3. Click "Login"
4. Redirected to Notes app

### 3. Create Notes

1. Click "+ New" in sidebar
2. Enter title and content
3. Click "Save"
4. Note appears in list

### 4. Edit Notes

1. Select note from list
2. Click "Edit"
3. Modify title or content
4. Click "Save"

### 5. Write Diary Entries

1. Click "📖 Diary" in navigation
2. Type entry in text area
3. Click "Add Entry"
4. Entry appears in feed

### 6. Logout

1. Click "Logout" button in navigation
2. Confirm logout
3. Session cleared, redirected to login

## API Integration

The frontend communicates with the backend via these endpoints:

### Public Endpoints
- `GET /v1/auth/kdf?username=...` - Get KDF params
- `POST /v1/auth/register` - Register new user
- `POST /v1/auth/verify` - Login and get JWT token

### Authenticated Endpoints (require `Authorization: Bearer <token>`)
- `PUT /v1/blobs/{blobName}` - Upsert encrypted blob
- `GET /v1/blobs/{blobName}` - Get encrypted blob
- `GET /v1/blobs` - List all blobs
- `DELETE /v1/blobs/{blobName}` - Delete blob
- `PATCH /v1/users/me` - Update credentials

See `src/lib/api.ts` for full API client implementation.

## Troubleshooting

### CORS Errors
- Make sure backend is running on http://localhost:8080
- Check that backend has CORS enabled for http://localhost:5173
- Verify Vite proxy configuration in `vite.config.ts`

### Crypto Errors
- Ensure HTTPS or localhost (required for Web Crypto API)
- Check browser console for detailed error messages
- Verify backend is returning valid encrypted containers

### Session Lost
- SessionStorage is cleared when tab closes (by design)
- Do not use "Restore tabs" feature for sensitive sessions
- Re-login if session expired

### Build Errors
- Run `npm install` to ensure dependencies are installed
- Check Node.js version (18+ required)
- Clear `node_modules` and reinstall if issues persist

## License

This is a proof-of-concept implementation for educational purposes.

## Related

- [Backend README](../server/README.md)
- [Design Document](../DESIGN.md)
- [Main README](../README.md)
