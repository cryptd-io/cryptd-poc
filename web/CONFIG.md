# Web Frontend Configuration

The cryptd web frontend supports runtime configuration, allowing you to change the API server URL without rebuilding the Docker image.

## Configuration Methods

### 1. Runtime Configuration (Recommended)

Set the `API_BASE_URL` environment variable when starting the container:

```bash
# Using docker run
docker run -e API_BASE_URL=https://api.example.com -p 80:80 cryptd-web

# Using docker-compose
environment:
  - API_BASE_URL=https://api.example.com
```

### 2. Build-time Configuration (Fallback)

Set the `VITE_API_BASE` build argument when building the image:

```bash
docker build --build-arg VITE_API_BASE=https://api.example.com -t cryptd-web ./web
```

### 3. Manual Configuration

Replace `/usr/share/nginx/html/config.js` in the running container:

```javascript
// config.js
window.APP_CONFIG = {
  apiBaseUrl: 'https://api.example.com'
};
```

## Priority Order

The application checks for the API base URL in this order:

1. Runtime `window.APP_CONFIG.apiBaseUrl` (set via `API_BASE_URL` env var)
2. Build-time `VITE_API_BASE` environment variable
3. Default: `http://localhost:8080`

## Examples

### Local Development

```bash
# Default - connects to http://localhost:8080
docker-compose up

# Custom local server
API_BASE_URL=http://localhost:3000 docker-compose up
```

### Production Deployment

```bash
# Single domain (web and API on same domain)
API_BASE_URL=https://api.example.com docker-compose -f docker-compose.prod.yml up -d

# Separate domains
API_BASE_URL=https://backend.example.com docker-compose -f docker-compose.prod.yml up -d
```

### Using .env File

Create a `.env` file:

```env
API_BASE_URL=https://api.example.com
JWT_SECRET=your-secret-key
CORS_ALLOWED_ORIGINS=https://app.example.com
```

Then run:

```bash
docker-compose -f docker-compose.prod.yml up -d
```

## CORS Configuration

Remember to configure CORS on the server to allow requests from your web frontend:

```yaml
# docker-compose.yml
services:
  server:
    environment:
      - CORS_ALLOWED_ORIGINS=https://app.example.com,https://www.example.com
```

## Verification

Check the active configuration by viewing the browser console or inspecting `/config.js`:

```bash
# View generated config
docker exec cryptd-web cat /usr/share/nginx/html/config.js
```

Or in the browser console:

```javascript
console.log(window.APP_CONFIG);
```
