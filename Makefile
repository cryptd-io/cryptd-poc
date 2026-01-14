.PHONY: help build test test-unit test-integration run clean docker-build docker-up docker-down

# Default target
help:
	@echo "Available targets:"
	@echo "  build              - Build the server binary"
	@echo "  test               - Run all tests"
	@echo "  test-unit          - Run unit tests only"
	@echo "  test-integration   - Run integration tests only"
	@echo "  test-coverage      - Run tests with coverage report"
	@echo "  run                - Run the server locally"
	@echo "  clean              - Clean build artifacts"
	@echo "  docker-build       - Build Docker image"
	@echo "  docker-up          - Start services with docker-compose"
	@echo "  docker-down        - Stop services"
	@echo "  lint               - Run golangci-lint"

# Build the backend server
build:
	cd backend && go build -o bin/cryptd-server ./cmd/server

# Run all tests
test:
	cd backend && go test -v ./...

# Run unit tests only
test-unit:
	cd backend && go test -v ./internal/...

# Run integration tests only
test-integration:
	cd backend && go test -v ./tests/...

# Run tests with coverage
test-coverage:
	cd backend && go test -coverprofile=coverage.out ./...
	cd backend && go tool cover -html=coverage.out -o coverage.html
	@echo "Coverage report generated: backend/coverage.html"

# Run the server locally (requires JWT_SECRET env var)
run:
	@if [ -z "$(JWT_SECRET)" ]; then \
		echo "Error: JWT_SECRET environment variable is required"; \
		echo "Example: JWT_SECRET=my-secret make run"; \
		exit 1; \
	fi
	cd backend && go run ./cmd/server -jwt-secret $(JWT_SECRET)

# Clean build artifacts
clean:
	cd backend && rm -rf bin/ coverage.out coverage.html cryptd.db
	rm -rf frontend/node_modules frontend/dist

# Build Docker image
docker-build:
	docker-compose build

# Start services with docker-compose
docker-up:
	@if [ -z "$(JWT_SECRET)" ]; then \
		echo "Warning: JWT_SECRET not set, using default (insecure)"; \
	fi
	docker-compose up -d

# Stop services
docker-down:
	docker-compose down

# Lint backend code (requires golangci-lint)
lint:
	cd backend && golangci-lint run

# Install development tools
dev-tools:
	go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest
