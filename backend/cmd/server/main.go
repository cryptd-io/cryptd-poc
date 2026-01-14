package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/shalteor/cryptd-poc/backend/internal/api"
	"github.com/shalteor/cryptd-poc/backend/internal/db"
)

func main() {
	// Parse command-line flags
	var (
		port      = flag.String("port", "8080", "Server port")
		dbPath    = flag.String("db", "cryptd.db", "SQLite database path")
		jwtSecret = flag.String("jwt-secret", "", "JWT secret (required)")
	)
	flag.Parse()

	// Validate JWT secret
	if *jwtSecret == "" {
		jwtSecretEnv := os.Getenv("JWT_SECRET")
		if jwtSecretEnv == "" {
			log.Fatal("JWT secret is required. Provide via -jwt-secret flag or JWT_SECRET env var")
		}
		*jwtSecret = jwtSecretEnv
	}

	// Initialize database
	database, err := db.New(*dbPath)
	if err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer database.Close()

	log.Printf("Database initialized: %s", *dbPath)

	// Create API server
	server := api.NewServer(database, *jwtSecret)
	router := server.NewRouter()

	// Start HTTP server
	addr := fmt.Sprintf(":%s", *port)
	log.Printf("Starting server on %s", addr)
	log.Printf("API endpoints:")
	log.Printf("  GET    /v1/auth/kdf")
	log.Printf("  POST   /v1/auth/register")
	log.Printf("  POST   /v1/auth/verify")
	log.Printf("  PATCH  /v1/users/me (authenticated)")
	log.Printf("  GET    /v1/blobs (authenticated)")
	log.Printf("  GET    /v1/blobs/{blobName} (authenticated)")
	log.Printf("  PUT    /v1/blobs/{blobName} (authenticated)")
	log.Printf("  DELETE /v1/blobs/{blobName} (authenticated)")

	if err := http.ListenAndServe(addr, router); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
