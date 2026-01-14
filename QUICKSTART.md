# Quick Start Guide

Get cryptd running in under 5 minutes!

## Prerequisites

- **Go 1.21+** (for backend)
- **Node.js 18+** (for frontend)
- **Git** (to clone the repo)

## Step-by-Step Setup

### 1. Clone and Navigate
```bash
cd cryptd-poc
```

### 2. Set JWT Secret
```bash
export JWT_SECRET="your-secret-here-$(openssl rand -base64 32)"
```

### 3. Install All Dependencies
```bash
make install
```

This installs:
- Go modules for backend
- npm packages for frontend

### 4. Start Both Services
```bash
# Terminal 1 - Backend
make backend-run

# Terminal 2 - Frontend (in new terminal)
make frontend-dev
```

OR use the combined command (runs both in parallel):
```bash
make dev
```

### 5. Open Your Browser
Navigate to: **http://localhost:5173**

## First Time Usage

1. **Register**: Click "Register" tab, enter username and password
2. **Login**: Automatically logged in after registration
3. **Create a Note**: Click "+ New" in Notes app
4. **Write a Diary Entry**: Click "📖 Diary" in navigation

## Ports

- **Backend**: http://localhost:8080 (API server)
- **Frontend**: http://localhost:5173 (Web UI)

## Quick Commands

```bash
# Run tests
make test

# Build everything
make build

# Clean up
make clean

# Docker deployment
make docker-up
make docker-down
```

## Security Note

⚠️ **Your session is ephemeral!**
- Token and keys stored in `sessionStorage`
- All data cleared when you close the tab
- This is by design for maximum security

## Need Help?

- Backend docs: [backend/README.md](backend/README.md)
- Frontend docs: [frontend/README.md](frontend/README.md)
- Design spec: [DESIGN.md](DESIGN.md)
- Main README: [README.md](README.md)

## Troubleshooting

### "Cannot connect to backend"
- Make sure backend is running on port 8080
- Check `JWT_SECRET` is set
- Verify no other service is using port 8080

### "Module not found" errors
- Run `make install` to reinstall dependencies
- Delete `node_modules` and `package-lock.json`, reinstall

### "Decryption failed"
- You may have changed your password
- Data encrypted with old password cannot be decrypted
- Create a new account or start fresh

---

**That's it!** You're now running a complete end-to-end encrypted vault! 🎉
