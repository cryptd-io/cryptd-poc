package api

import (
	"net/http"

	"github.com/shalteor/cryptd-poc/internal/db"
)

type Server struct {
	db *db.DB
}

func NewServer(database *db.DB) *Server {
	return &Server{db: database}
}

// Router sets up the HTTP routes
func (s *Server) Router() http.Handler {
	mux := http.NewServeMux()

	// Public endpoints
	mux.HandleFunc("POST /v1/register", s.HandleRegister)
	mux.HandleFunc("POST /v1/login", s.HandleLogin)

	// Protected endpoints
	mux.HandleFunc("PUT /v1/blobs/{blob_id}", s.AuthMiddleware(s.HandlePutBlob))
	mux.HandleFunc("GET /v1/blobs/{blob_id}", s.AuthMiddleware(s.HandleGetBlob))
	mux.HandleFunc("GET /v1/blobs", s.AuthMiddleware(s.HandleListBlobs))
	mux.HandleFunc("DELETE /v1/blobs/{blob_id}", s.AuthMiddleware(s.HandleDeleteBlob))

	return mux
}
