# Docker Deployment Guide

Complete guide for deploying cryptd with Docker and Docker Compose.

## Architecture

```
┌─────────────────────────────────────┐
│   Browser (http://localhost)       │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│   Frontend (Nginx on port 80)      │
│   - Serves React SPA                │
│   - Proxies /v1/* to backend        │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│   Backend (Go on port 8080)         │
│   - API endpoints                   │
│   - SQLite database                 │
└─────────────────────────────────────┘
```

## Services

### Backend
- **Image**: Multi-stage Go build (Alpine)
- **Port**: 8080
- **Volume**: `cryptd-data:/data` (persistent SQLite database)
- **Health Check**: HTTP GET to `/v1/auth/kdf`

### Frontend
- **Image**: Multi-stage Node build + Nginx (Alpine)
- **Port**: 80
- **Nginx Features**:
  - SPA routing (serves index.html for all routes)
  - API proxy (/v1/* → backend:8080)
  - Static asset caching
  - Gzip compression
  - Security headers

## Quick Start

### 1. Set Environment Variables

```bash
# Required: Set JWT secret
export JWT_SECRET="$(openssl rand -base64 32)"

# Optional: Change default ports (in docker-compose.yml)
# frontend: "80:80" → "3000:80"
# backend: "8080:8080" → "8081:8080"
```

### 2. Start Services

```bash
# Using Makefile
make docker-up

# Or directly
docker-compose up -d
```

### 3. Verify Services

```bash
# Check status
docker-compose ps

# View logs
docker-compose logs -f

# Backend logs only
docker-compose logs -f backend

# Frontend logs only
docker-compose logs -f frontend
```

### 4. Access the Application

Open your browser:
- **Frontend**: http://localhost
- **Backend API**: http://localhost:8080/v1/auth/kdf?username=test

## Configuration

### Environment Variables

Edit `.env` or export before running:

```bash
# Required
JWT_SECRET=your-secret-here

# Optional (defaults shown)
# None currently - ports are in docker-compose.yml
```

### Custom Ports

Edit `docker-compose.yml`:

```yaml
services:
  frontend:
    ports:
      - "3000:80"  # Change host port (3000) as needed
  
  backend:
    ports:
      - "8081:8080"  # Change host port (8081) as needed
```

### Persistent Data

SQLite database is stored in the `cryptd-data` Docker volume:

```bash
# List volumes
docker volume ls | grep cryptd

# Inspect volume
docker volume inspect cryptd_cryptd-data

# Backup database
docker cp cryptd-backend-1:/data/cryptd.db ./backup-$(date +%Y%m%d).db

# Restore database
docker cp ./backup.db cryptd-backend-1:/data/cryptd.db
docker-compose restart backend
```

## Management Commands

### Start/Stop

```bash
# Start services (detached)
make docker-up

# Stop services (keeps volumes)
make docker-down

# Restart services
make docker-restart
```

### Logs

```bash
# All services (follow)
make docker-logs

# Backend only
make docker-logs-backend

# Frontend only
make docker-logs-frontend

# Last 100 lines
docker-compose logs --tail=100
```

### Rebuild

```bash
# Rebuild images (after code changes)
make docker-build

# Rebuild and restart
make docker-build && make docker-restart

# Force rebuild (no cache)
docker-compose build --no-cache
```

### Clean Up

```bash
# Stop and remove containers (keeps volumes)
make docker-down

# Remove everything (including volumes)
make docker-clean

# Manual cleanup
docker-compose down -v
docker system prune -f
```

## Health Checks

Both services have health checks configured:

### Backend
- **Test**: HTTP GET to `/v1/auth/kdf?username=test`
- **Interval**: 30s
- **Timeout**: 10s
- **Start Period**: 40s

### Frontend
- **Test**: HTTP GET to `/`
- **Interval**: 30s
- **Timeout**: 3s
- **Start Period**: 5s

Check health status:

```bash
docker-compose ps
# HEALTHY services show as "Up (healthy)"
```

## Networking

Services communicate via the `cryptd-network` bridge network:

```bash
# Inspect network
docker network inspect cryptd_cryptd-network

# Frontend can reach backend at: http://backend:8080
# Backend is isolated from external access (except port 8080)
```

## Troubleshooting

### Services Won't Start

```bash
# Check logs
docker-compose logs

# Check specific service
docker-compose logs backend
docker-compose logs frontend

# Verify ports are free
lsof -i :80
lsof -i :8080
```

### Database Issues

```bash
# Check database file
docker exec cryptd-backend-1 ls -lh /data/

# Reset database (WARNING: deletes all data)
docker-compose down -v
docker-compose up -d
```

### Build Failures

```bash
# Clear build cache
docker-compose build --no-cache

# Remove old images
docker image prune -f

# Check disk space
docker system df
```

### Frontend Can't Reach Backend

```bash
# Verify backend is running
docker-compose ps backend

# Check backend logs
docker-compose logs backend

# Test backend from frontend container
docker exec cryptd-frontend-1 wget -O- http://backend:8080/v1/auth/kdf?username=test
```

### Nginx Configuration Issues

```bash
# Check nginx config
docker exec cryptd-frontend-1 nginx -t

# Reload nginx
docker exec cryptd-frontend-1 nginx -s reload

# View nginx logs
docker exec cryptd-frontend-1 cat /var/log/nginx/error.log
```

## Production Deployment

### Security Checklist

- [ ] Set strong JWT secret: `export JWT_SECRET="$(openssl rand -base64 32)"`
- [ ] Use HTTPS (add reverse proxy like Traefik/Caddy)
- [ ] Restrict port 8080 (only frontend should access it)
- [ ] Enable Docker secrets for JWT_SECRET
- [ ] Configure firewall rules
- [ ] Set up log rotation
- [ ] Enable automatic backups
- [ ] Monitor health check status

### Recommended Setup

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  backend:
    # ... existing config ...
    networks:
      - internal  # Backend only accessible internally
    
  frontend:
    # ... existing config ...
    networks:
      - internal
      - external
    
  reverse-proxy:
    image: traefik:v2.10
    ports:
      - "443:443"
      - "80:80"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./traefik.yml:/etc/traefik/traefik.yml
    networks:
      - external

networks:
  internal:
    internal: true  # No external access
  external:
```

### Backup Strategy

```bash
# Automated backup script
#!/bin/bash
DATE=$(date +%Y%m%d-%H%M%S)
docker cp cryptd-backend-1:/data/cryptd.db ./backups/cryptd-$DATE.db
gzip ./backups/cryptd-$DATE.db

# Keep last 30 days
find ./backups/ -name "*.db.gz" -mtime +30 -delete
```

### Monitoring

```bash
# Container stats
docker stats cryptd-backend-1 cryptd-frontend-1

# Health status
watch 'docker-compose ps'

# Resource usage
docker system df
```

## Files

### Frontend Dockerfile
- Multi-stage build (Node builder + Nginx)
- Optimized for production
- ~250KB bundle size

### Frontend nginx.conf
- SPA routing support
- API proxying
- Static asset caching
- Security headers
- Gzip compression

### docker-compose.yml
- Both services defined
- Health checks configured
- Networks isolated
- Volume for persistent data

## Performance

### Build Times
- Backend: ~2 minutes (first build), ~10 seconds (cached)
- Frontend: ~3 minutes (first build), ~30 seconds (cached)

### Image Sizes
- Backend: ~20 MB (Alpine)
- Frontend: ~25 MB (Nginx Alpine)

### Startup Times
- Backend: ~5 seconds
- Frontend: ~2 seconds

## Updates

### Update Application Code

```bash
# 1. Pull latest code
git pull

# 2. Rebuild images
make docker-build

# 3. Restart services
make docker-restart

# Or in one command
git pull && make docker-build && make docker-restart
```

### Update Base Images

```bash
# Update to latest Alpine/Node/Go
docker-compose pull
docker-compose build --no-cache
docker-compose up -d
```

---

For more information:
- [Main README](../README.md)
- [Backend README](../backend/README.md)
- [Frontend README](../frontend/README.md)
- [Quick Start Guide](../QUICKSTART.md)
