# Build stage
FROM golang:1.24-alpine AS builder

WORKDIR /app

# Copy go mod files
COPY go.mod go.sum ./

# Download dependencies with progress output
ENV GOPROXY=https://proxy.golang.org,direct
RUN go mod download -x

# Copy source code
COPY . .

# Build the application (CGO disabled for pure Go build)
RUN CGO_ENABLED=0 GOOS=linux go build -v -a -ldflags="-s -w" -o /app/cryptd-server ./cmd/server

# Runtime stage
FROM alpine:latest

WORKDIR /app

# Install runtime dependencies
RUN apk --no-cache add ca-certificates

# Copy binary from builder
COPY --from=builder /app/cryptd-server .

# Create directory for database
RUN mkdir -p /data

# Expose port
EXPOSE 8080

# Run the application
ENTRYPOINT ["/app/cryptd-server"]
CMD ["-db", "/data/cryptd.db", "-port", "8080"]
