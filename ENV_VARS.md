# Environment Variables Quick Reference

## Backend Configuration

### JWT_SECRET (Required)
**Purpose**: Secret key for signing JWT authentication tokens

**Set as environment variable:**
```bash
export JWT_SECRET="your-secure-random-secret"
```

**Or via Docker:**
```bash
docker run -e JWT_SECRET="your-secret" ...
```

**Generate a secure secret:**
```bash
openssl rand -base64 32
```

---

### CORS_ALLOWED_ORIGINS (Optional)
**Purpose**: Configure which frontend origins can access the API

**Format**: Comma-separated list of origins (no spaces after commas)

**Example:**
```bash
export CORS_ALLOWED_ORIGINS="https://app.example.com,https://www.example.com"
```

**Default (if not set):**
- `http://localhost`
- `http://localhost:80`
- `http://localhost:3000`
- `http://localhost:5173`
- `http://127.0.0.1`
- `http://127.0.0.1:80`
- `http://127.0.0.1:3000`
- `http://127.0.0.1:5173`

**Docker example:**
```bash
docker run -e CORS_ALLOWED_ORIGINS="https://app.example.com" ...
```

---

## Frontend Configuration

### VITE_API_BASE (Build-time)
**Purpose**: Configure the backend API URL

**Important**: This is a build-time variable. It must be set when building the Docker image or running `npm run build`.

**Format**: Full URL including protocol

**Example:**
```bash
export VITE_API_BASE="https://api.example.com"
npm run build
```

**Default (if not set):**
- `http://localhost:8080`

**Docker build example:**
```bash
docker build --build-arg VITE_API_BASE="https://api.example.com" ./frontend
```

**docker-compose example:**
```yaml
frontend:
  build:
    context: ./frontend
    args:
      - VITE_API_BASE=https://api.example.com
```

---

## Common Scenarios

### Local Development
```bash
# Backend
export JWT_SECRET="dev-secret-not-for-production"
# CORS_ALLOWED_ORIGINS not needed (uses defaults)

# Frontend
# VITE_API_BASE not needed (uses default http://localhost:8080)
```

### Production with Docker Compose
```bash
# Create .env file:
JWT_SECRET=your-secure-production-secret
CORS_ALLOWED_ORIGINS=https://app.example.com
VITE_API_BASE=https://api.example.com

# Run:
docker-compose up -d
```

### Production with Pre-built Images
```bash
# Backend
docker run -d \
  -p 8080:8080 \
  -e JWT_SECRET="your-secret" \
  -e CORS_ALLOWED_ORIGINS="https://app.example.com" \
  -v /data:/data \
  ghcr.io/<owner>/<repo>/backend:latest

# Frontend (must be built with correct VITE_API_BASE via GitHub Actions)
docker run -d \
  -p 80:80 \
  ghcr.io/<owner>/<repo>/frontend:latest
```

---

## GitHub Actions Configuration

### Setting Repository Variables

For GitHub Actions to build the frontend with the correct API URL:

1. Go to your repository on GitHub
2. Navigate to **Settings** → **Secrets and variables** → **Actions** → **Variables**
3. Add a new variable:
   - **Name**: `VITE_API_BASE`
   - **Value**: `https://api.your-domain.com`

This will be used automatically by the frontend workflow when building images.

### Setting Repository Secrets

For sensitive values (not needed for public endpoints):

1. Go to your repository on GitHub
2. Navigate to **Settings** → **Secrets and variables** → **Actions** → **Secrets**
3. Add secrets as needed (e.g., for deployment credentials)

---

## Troubleshooting

### CORS errors in browser
**Problem**: Frontend can't access backend API

**Solution**: Set `CORS_ALLOWED_ORIGINS` on backend to include your frontend URL
```bash
export CORS_ALLOWED_ORIGINS="https://your-frontend-domain.com"
```

### Frontend connecting to wrong API
**Problem**: API calls go to localhost instead of production backend

**Solution**: Rebuild frontend with correct `VITE_API_BASE`
```bash
docker build --build-arg VITE_API_BASE="https://api.example.com" ./frontend
```

### JWT authentication fails
**Problem**: Backend returns 401 errors

**Solution**: Ensure `JWT_SECRET` is set and is the same secret used when the tokens were created
```bash
export JWT_SECRET="your-secret"
```
