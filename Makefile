.PHONY: all build test run clean help

# Default target
all: test build

# Build the server
build:
	@echo "Building cryptd-server..."
	@go build -o bin/cryptd-server

# Run tests
test:
	@echo "Running tests..."
	@go test -v ./...

# Run the server
run: build
	@echo "Starting server on :8080..."
	@./bin/cryptd-server

# Run with custom settings
run-custom:
	@echo "Starting server with custom settings..."
	@./bin/cryptd-server -addr :9000 -db custom.db

# Clean build artifacts
clean:
	@echo "Cleaning build artifacts..."
	@rm -rf bin/
	@rm -f *.db *.db-journal *.db-shm *.db-wal

# Run tests with coverage
test-coverage:
	@echo "Running tests with coverage..."
	@go test -coverprofile=coverage.out ./...
	@go tool cover -html=coverage.out -o coverage.html
	@echo "Coverage report generated: coverage.html"

# Format code
fmt:
	@echo "Formatting code..."
	@go fmt ./...

# Run linter
lint:
	@echo "Running linter..."
	@golangci-lint run ./...

# Download dependencies
deps:
	@echo "Downloading dependencies..."
	@go mod download
	@go mod tidy

# Help
help:
	@echo "Cryptd PoC - Available targets:"
	@echo "  make build         - Build the server binary"
	@echo "  make test          - Run tests"
	@echo "  make run           - Build and run server on :8080"
	@echo "  make run-custom    - Run server with custom settings"
	@echo "  make clean         - Remove build artifacts and databases"
	@echo "  make test-coverage - Run tests with coverage report"
	@echo "  make fmt           - Format code"
	@echo "  make lint          - Run linter"
	@echo "  make deps          - Download dependencies"
	@echo "  make help          - Show this help message"
