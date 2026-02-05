package api

import (
	"database/sql"
	"net/http"
	"strings"

	"github.com/claimcoach/backend/internal/auth"
	"github.com/claimcoach/backend/internal/config"
	"github.com/claimcoach/backend/internal/handlers"
	"github.com/claimcoach/backend/internal/services"
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

	// Public routes
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

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
		propertyService := services.NewPropertyService(db)
		propertyHandler := handlers.NewPropertyHandler(propertyService)

		api.POST("/properties", propertyHandler.Create)
		api.GET("/properties", propertyHandler.List)
		api.GET("/properties/:id", propertyHandler.Get)
		api.PATCH("/properties/:id", propertyHandler.Update)

		// Policy routes
		policyService := services.NewPolicyService(db, propertyService)
		policyHandler := handlers.NewPolicyHandler(policyService)

		api.POST("/properties/:propertyId/policy", policyHandler.Create)
		api.GET("/properties/:propertyId/policy", policyHandler.Get)

		// Claim routes
		claimService := services.NewClaimService(db, propertyService)
		claimHandler := handlers.NewClaimHandler(claimService)

		api.POST("/claims", claimHandler.Create)
		api.GET("/claims", claimHandler.List)
		api.GET("/claims/:id", claimHandler.Get)
		api.PATCH("/claims/:id/status", claimHandler.UpdateStatus)
		api.GET("/claims/:id/activities", claimHandler.GetActivities)
	}

	return r, nil
}
