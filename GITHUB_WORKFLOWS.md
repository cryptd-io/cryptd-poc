# GitHub Workflows and Docker Configuration

This document describes the GitHub Actions workflows for building and publishing Docker images, and the configuration options for CORS and API URLs.

## GitHub Workflows

Two workflows are configured to automatically build and publish Docker images to GitHub Container Registry (ghcr.io):

### Server Workflow (`.github/workflows/server-docker.yml`)

**Triggers:**
- Push to `main` or `develop` branches (when server files change)
- Pull requests to `main` (when server files change)
- Tag pushes matching `v*` pattern
- Manual workflow dispatch

**What it does:**
- Builds the server Docker image from `server/Dockerfile`
- Publishes to `ghcr.io/<owner>/<repo>/server`
- Creates tags for branches, PRs, semantic versions, and commit SHAs
- Supports multi-platform builds (linux/amd64, linux/arm64)
- Uses build cache for faster builds

### Web Workflow (`.github/workflows/web-docker.yml`)

**Triggers:**
- Push to `main` or `develop` branches (when web files change)
- Pull requests to `main` (when web files change)
- Tag pushes matching `v*` pattern
- Manual workflow dispatch

**What it does:**
- Builds the web Docker image from `web/Dockerfile`
- Publishes to `ghcr.io/<owner>/<repo>/web`
- Creates tags for branches, PRs, semantic versions, and commit SHAs
- Supports multi-platform builds (linux/amd64, linux/arm64)
- Uses build cache for faster builds
- Accepts `VITE_API_BASE` build argument for API URL configuration

## Configuration

### Server CORS Configuration

The server accepts a `CORS_ALLOWED_ORIGINS` environment variable to configure allowed origins for CORS.

**Environment Variable:**
```bash
CORS_ALLOWED_ORIGINS="https://app.example.com,https://www.example.com"
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

**Example Docker run:**
```bash
docker run -d \
  -p 8080:8080 \
  -e JWT_SECRET=your-secret-key \
  -e CORS_ALLOWED_ORIGINS="https://app.example.com,https://www.example.com" \
  -v /path/to/data:/data \
  ghcr.io/<owner>/<repo>/server:latest
```

### Web API URL Configuration

The web app accepts a `VITE_API_BASE` environment variable at **build time** to configure the server API URL.

**Build Argument:**
```bash
VITE_API_BASE=https://api.example.com
```

**Default (if not set):**
- `http://localhost:8080`

**Example Docker build:**
```bash
docker build \
  --build-arg VITE_API_BASE=https://api.example.com \
  -t myapp-web \
  ./web
```

**Example Docker run:**
```bash
docker run -d \
  -p 80:80 \
  ghcr.io/<owner>/<repo>/web:latest
```

## Setting Up GitHub Workflows

### Prerequisites

1. **GitHub Container Registry**: Enabled by default for all GitHub repositories
2. **Repository Permissions**: The workflows use `GITHUB_TOKEN` which is automatically provided

### Configuration Steps

1. **Set Repository Variables** (for production API URL):
   - Go to your repository on GitHub
   - Navigate to Settings → Secrets and variables → Actions → Variables
   - Add a new repository variable:
     - Name: `VITE_API_BASE`
     - Value: `https://api.your-domain.com` (your production API URL)

2. **First Run**:
   - Push changes to the `main` or `develop` branch
   - The workflows will automatically trigger
   - Images will be published to `ghcr.io/<owner>/<repo>/server` and `ghcr.io/<owner>/<repo>/web`

3. **Package Visibility**:
   - By default, packages are private
   - To make them public: Go to the package page and change visibility in settings

### Using the Published Images

**Pull the images:**
```bash
# Server
docker pull ghcr.io/<owner>/<repo>/server:latest

# Web
docker pull ghcr.io/<owner>/<repo>/web:latest
```

**Run with docker-compose:**
```yaml
version: '3.8'

services:
  server:
    image: ghcr.io/<owner>/<repo>/server:latest
    ports:
      - "8080:8080"
    environment:
      - JWT_SECRET=${JWT_SECRET}
      - CORS_ALLOWED_ORIGINS=https://app.example.com
    volumes:
      - ./data:/data

  web:
    image: ghcr.io/<owner>/<repo>/web:latest
    ports:
      - "80:80"
    depends_on:
      - server
```

## Image Tags

The workflows automatically create the following tags:

- `latest` - Latest build from the default branch (main)
- `main` - Latest build from main branch
- `develop` - Latest build from develop branch
- `v1.2.3` - Semantic version tags (from git tags)
- `v1.2` - Major.minor version
- `v1` - Major version only
- `main-<sha>` - Branch name with commit SHA
- `pr-123` - Pull request number

## Security

- The workflows use GitHub's built-in `GITHUB_TOKEN` for authentication
- No manual secrets need to be configured for basic operation
- JWT secret should be set as a secret for production deployments
- Build attestations are generated for supply chain security

## Manual Workflow Trigger

You can manually trigger the workflows:

1. Go to Actions tab in your repository
2. Select the workflow (Server Docker or Web Docker)
3. Click "Run workflow"
4. Select the branch and click "Run workflow"

## Troubleshooting

**Build fails with authentication error:**
- Ensure the `GITHUB_TOKEN` has `packages: write` permission (set automatically in workflow)

**CORS errors in production:**
- Set `CORS_ALLOWED_ORIGINS` environment variable in server deployment
- Ensure origins include the protocol (http/https)

**Web shows wrong API URL:**
- Set `VITE_API_BASE` repository variable in GitHub
- Rebuild the web image after changing the variable

**Multi-platform build is slow:**
- This is normal for the first build
- Subsequent builds use cache and are much faster
- Consider disabling multi-platform if you only need one architecture
