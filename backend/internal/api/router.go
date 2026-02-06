package api

import (
	"database/sql"
	"net/http"
	"strings"

	"github.com/claimcoach/backend/internal/auth"
	"github.com/claimcoach/backend/internal/config"
	"github.com/claimcoach/backend/internal/handlers"
	"github.com/claimcoach/backend/internal/services"
	"github.com/claimcoach/backend/internal/storage"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func NewRouter(cfg *config.Config, db *sql.DB) (*gin.Engine, error) {
	r := gin.Default()

	// Parse allowed origins
	allowedOrigins := []string{"*"}
	if cfg.AllowedOrigins != "" {
		allowedOrigins = strings.Split(cfg.AllowedOrigins, ",")
		for i, origin := range allowedOrigins {
			allowedOrigins[i] = strings.TrimSpace(origin)
		}
	}

	// CORS
	r.Use(cors.New(cors.Config{
		AllowOrigins:     allowedOrigins,
		AllowMethods:     []string{"GET", "POST", "PATCH", "DELETE"},
		AllowHeaders:     []string{"Authorization", "Content-Type"},
		AllowCredentials: true,
	}))

	// Supabase client
	supabase, err := auth.NewSupabaseClient(
		cfg.SupabaseURL,
		cfg.SupabaseServiceKey,
		cfg.SupabaseJWTSecret,
	)
	if err != nil {
		return nil, err
	}

	// Supabase Storage client
	storageClient, err := storage.NewSupabaseStorage(
		cfg.SupabaseURL,
		cfg.SupabaseServiceKey,
	)
	if err != nil {
		return nil, err
	}

	// Initialize services needed for both public and protected routes
	propertyService := services.NewPropertyService(db)
	claimService := services.NewClaimService(db, propertyService)
	emailService := services.NewMockEmailService()
	magicLinkService := services.NewMagicLinkService(db, cfg, storageClient, claimService, emailService)
	magicLinkHandler := handlers.NewMagicLinkHandler(magicLinkService)

	// Public routes
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	// Public magic link endpoints (no auth required)
	r.GET("/api/magic-links/:token/validate", magicLinkHandler.ValidateToken)
	r.POST("/api/magic-links/:token/documents/upload-url", magicLinkHandler.RequestUploadURL)
	r.POST("/api/magic-links/:token/documents/:documentId/confirm", magicLinkHandler.ConfirmUpload)

	// Protected routes
	api := r.Group("/api")
	api.Use(auth.AuthMiddleware(supabase, db))
	{
		api.GET("/me", func(c *gin.Context) {
			user := c.MustGet("user")
			c.JSON(http.StatusOK, gin.H{
				"success": true,
				"data":    user,
			})
		})

		// Property routes
		propertyHandler := handlers.NewPropertyHandler(propertyService)

		api.POST("/properties", propertyHandler.Create)
		api.GET("/properties", propertyHandler.List)
		api.GET("/properties/:id", propertyHandler.Get)
		api.PATCH("/properties/:id", propertyHandler.Update)

		// Policy routes (use same param name :id to avoid gin routing conflicts)
		policyService := services.NewPolicyService(db, propertyService)
		policyHandler := handlers.NewPolicyHandler(policyService)

		api.POST("/properties/:id/policy", policyHandler.Create)
		api.GET("/properties/:id/policy", policyHandler.Get)

		// Claim routes
		claimHandler := handlers.NewClaimHandler(claimService)

		api.POST("/claims", claimHandler.Create)
		api.GET("/claims", claimHandler.List)
		api.GET("/claims/:id", claimHandler.Get)
		api.PATCH("/claims/:id/status", claimHandler.UpdateStatus)
		api.GET("/claims/:id/activities", claimHandler.GetActivities)

		// Document routes
		documentService := services.NewDocumentService(db, storageClient, claimService)
		documentHandler := handlers.NewDocumentHandler(documentService)

		api.POST("/claims/:id/documents/upload-url", documentHandler.RequestUploadURL)
		api.POST("/claims/:id/documents/:documentId/confirm", documentHandler.ConfirmUpload)
		api.GET("/claims/:id/documents", documentHandler.ListDocuments)
		api.GET("/documents/:id", documentHandler.GetDocument)

		// Magic Link routes (protected - requires auth)
		api.POST("/claims/:id/magic-link", magicLinkHandler.GenerateMagicLink)
	}

	return r, nil
}
