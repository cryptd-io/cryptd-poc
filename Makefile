# cryptd Makefile
# Convenience commands for development

.PHONY: help server-test server-run server-build web-dev web-build web-install dev clean

help: ## Show this help message
	@echo "cryptd - Encrypted Blob Vault"
	@echo ""
	@echo "Available commands:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

# Server commands
server-test: ## Run server tests
	cd server && go test ./... -v -cover

server-run: ## Run server (requires JWT_SECRET env var)
	cd server && go run ./cmd/server -jwt-secret $(JWT_SECRET)

server-build: ## Build server binary
	cd server && go build -o bin/cryptd-server ./cmd/server

# Web commands
web-install: ## Install web dependencies
	cd web && npm install

web-dev: ## Run web dev server
	cd web && npm run dev

web-build: ## Build web for production
	cd web && npm run build

web-preview: ## Preview production build
	cd web && npm run preview

# Combined commands
dev: ## Run both server and web in parallel (requires JWT_SECRET)
	@echo "Starting server and web..."
	@echo "Server: http://localhost:8080"
	@echo "Web: http://localhost:5173"
	@$(MAKE) -j2 server-run web-dev

install: ## Install all dependencies (server + web)
	@echo "Installing server dependencies..."
	cd server && go mod download
	@echo "Installing web dependencies..."
	cd web && npm install
	@echo "✅ All dependencies installed"

test: ## Run all tests
	@echo "Running server tests..."
	cd server && go test ./... -v
	@echo "✅ All tests passed"

build: ## Build server and web
	@echo "Building server..."
	cd server && go build -o bin/cryptd-server ./cmd/server
	@echo "Building web..."
	cd web && npm run build
	@echo "✅ Build complete"

clean: ## Clean build artifacts
	cd server && rm -rf bin/ *.db coverage.out coverage.html
	cd web && rm -rf dist/ node_modules/
	@echo "✅ Cleaned"

# Docker commands
docker-up: ## Start services with docker-compose
	docker-compose up -d

docker-down: ## Stop docker-compose services
	docker-compose down

docker-logs: ## View docker-compose logs
	docker-compose logs -f

docker-logs-server: ## View server logs only
	docker-compose logs -f server

docker-logs-web: ## View web logs only
	docker-compose logs -f web

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
	@echo "  - Server: make server-run"
	@echo "  - Web: make web-dev"
	@echo ""
