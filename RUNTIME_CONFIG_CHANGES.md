# Runtime Configuration Summary

## What Changed

The web frontend now supports **runtime configuration** of the API base URL. Previously, the API URL had to be set at build time and required rebuilding the Docker image to change it.

## Files Modified

### 1. `/web/public/config.js` (NEW)
Default runtime configuration file that gets overridden by the Docker entrypoint.

### 2. `/web/docker-entrypoint.sh` (NEW)
Shell script that generates `config.js` from the `API_BASE_URL` environment variable at container startup.

### 3. `/web/src/lib/api.ts` (MODIFIED)
Updated to check for runtime configuration before falling back to build-time configuration.

### 4. `/web/index.html` (MODIFIED)
Added `<script src="/config.js"></script>` to load runtime configuration.

### 5. `/web/Dockerfile` (MODIFIED)
- Added `API_BASE_URL` environment variable (default: `http://localhost:8080`)
- Copied `docker-entrypoint.sh` script
- Changed entrypoint to use the custom script

### 6. `/docker-compose.yml` (MODIFIED)
Added `API_BASE_URL` environment variable to web service.

### 7. `/docker-compose.prod.example.yml` (MODIFIED)
- Added `API_BASE_URL` environment variable with documentation
- Updated instructions to explain runtime configuration

### 8. `/web/CONFIG.md` (NEW)
Comprehensive documentation for all configuration methods.

### 9. `/README.md` (MODIFIED)
Updated environment variables section to document runtime configuration.

## Usage Examples

### Development (Docker Compose)
```bash
# Default - connects to http://localhost:8080
docker-compose up

# Custom server URL at runtime
API_BASE_URL=http://localhost:3000 docker-compose up
```

### Production with .env file
```bash
# .env
API_BASE_URL=https://api.example.com
JWT_SECRET=your-secret
CORS_ALLOWED_ORIGINS=https://app.example.com

# Deploy
docker-compose -f docker-compose.prod.yml up -d
```

### Standalone Docker Container
```bash
docker run \
  -e API_BASE_URL=https://api.example.com \
  -p 80:80 \
  cryptd-web
```

## Benefits

1. **No rebuild required**: Change server URL by setting environment variable
2. **Same image, multiple environments**: Use one Docker image across dev/staging/prod
3. **Simpler deployments**: No need for custom builds per environment
4. **Backwards compatible**: Falls back to build-time `VITE_API_BASE` if runtime config not set

## Configuration Priority

The API base URL is determined in this order:

1. **Runtime**: `window.APP_CONFIG.apiBaseUrl` (from `API_BASE_URL` env var)
2. **Build-time**: `import.meta.env.VITE_API_BASE` (from build arg)
3. **Default**: `http://localhost:8080`
