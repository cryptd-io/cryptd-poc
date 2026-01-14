# Build stage
FROM golang:1.21-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache gcc musl-dev sqlite-dev

# Copy go mod files
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build the application
RUN CGO_ENABLED=1 GOOS=linux go build -a -installsuffix cgo -o /app/cryptd-server ./cmd/server

# Runtime stage
FROM alpine:latest

WORKDIR /app

# Install runtime dependencies
RUN apk --no-cache add ca-certificates sqlite-libs

# Copy binary from builder
COPY --from=builder /app/cryptd-server .

# Create directory for database
RUN mkdir -p /data

# Expose port
EXPOSE 8080

# Run the application
ENTRYPOINT ["/app/cryptd-server"]
CMD ["-db", "/data/cryptd.db", "-port", "8080"]
