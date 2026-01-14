package api

import (
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

// NewRouter creates a new HTTP router with all routes configured
func (s *Server) NewRouter() *chi.Mux {
	r := chi.NewRouter()

	// Middleware
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)

	// CORS
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"http://localhost", "http://localhost:80", "http://localhost:3000", "http://localhost:5173", "http://127.0.0.1", "http://127.0.0.1:80", "http://127.0.0.1:3000", "http://127.0.0.1:5173"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-Requested-With"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// API routes
	r.Route("/v1", func(r chi.Router) {
		// Auth routes (public)
		r.Route("/auth", func(r chi.Router) {
			r.Get("/kdf", s.GetKDFParams)
			r.Post("/register", s.Register)
			r.Post("/verify", s.Verify)
		})

		// Protected routes
		r.Group(func(r chi.Router) {
			r.Use(s.jwtConfig.AuthMiddleware)

			// User routes
			r.Patch("/users/me", s.UpdateUser)

			// Blob routes
			r.Get("/blobs", s.ListBlobs)
			r.Get("/blobs/{blobName}", s.GetBlob)
			r.Put("/blobs/{blobName}", s.UpsertBlob)
			r.Delete("/blobs/{blobName}", s.DeleteBlob)
		})
	})

	return r
}
