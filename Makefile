# cryptd Makefile
# Convenience commands for development

.PHONY: help backend-test backend-run backend-build frontend-dev frontend-build frontend-install dev clean

help: ## Show this help message
	@echo "cryptd - Encrypted Blob Vault"
	@echo ""
	@echo "Available commands:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

# Backend commands
backend-test: ## Run backend tests
	cd backend && go test ./... -v -cover

backend-run: ## Run backend server (requires JWT_SECRET env var)
	cd backend && go run ./cmd/server -jwt-secret $(JWT_SECRET)

backend-build: ## Build backend binary
	cd backend && go build -o bin/cryptd-server ./cmd/server

# Frontend commands
frontend-install: ## Install frontend dependencies
	cd frontend && npm install

frontend-dev: ## Run frontend dev server
	cd frontend && npm run dev

frontend-build: ## Build frontend for production
	cd frontend && npm run build

frontend-preview: ## Preview production build
	cd frontend && npm run preview

# Combined commands
dev: ## Run both backend and frontend in parallel (requires JWT_SECRET)
	@echo "Starting backend and frontend..."
	@echo "Backend: http://localhost:8080"
	@echo "Frontend: http://localhost:5173"
	@$(MAKE) -j2 backend-run frontend-dev

install: ## Install all dependencies (backend + frontend)
	@echo "Installing backend dependencies..."
	cd backend && go mod download
	@echo "Installing frontend dependencies..."
	cd frontend && npm install
	@echo "✅ All dependencies installed"

test: ## Run all tests
	@echo "Running backend tests..."
	cd backend && go test ./... -v
	@echo "✅ All tests passed"

build: ## Build backend and frontend
	@echo "Building backend..."
	cd backend && go build -o bin/cryptd-server ./cmd/server
	@echo "Building frontend..."
	cd frontend && npm run build
	@echo "✅ Build complete"

clean: ## Clean build artifacts
	cd backend && rm -rf bin/ *.db coverage.out coverage.html
	cd frontend && rm -rf dist/ node_modules/
	@echo "✅ Cleaned"

# Docker commands
docker-up: ## Start services with docker-compose
	docker-compose up -d

docker-down: ## Stop docker-compose services
	docker-compose down

docker-logs: ## View docker-compose logs
	docker-compose logs -f

docker-logs-backend: ## View backend logs only
	docker-compose logs -f backend

docker-logs-frontend: ## View frontend logs only
	docker-compose logs -f frontend

docker-build: ## Rebuild docker images
	docker-compose build

docker-restart: ## Restart all services
	docker-compose restart

docker-clean: ## Stop and remove all containers, volumes, and images
	docker-compose down -v
	docker system prune -f

# Quick start
quickstart: install ## Quick start: install deps and show instructions
	@echo ""
	@echo "✅ Setup complete!"
	@echo ""
	@echo "To start developing:"
	@echo "  1. Set JWT secret: export JWT_SECRET=\"test-secret\""
	@echo "  2. Run: make dev"
	@echo ""
	@echo "Or start services separately:"
	@echo "  - Backend: make backend-run"
	@echo "  - Frontend: make frontend-dev"
	@echo ""
