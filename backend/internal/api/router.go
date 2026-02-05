package api

import (
	"database/sql"
	"net/http"
	"strings"

	"github.com/claimcoach/backend/internal/auth"
	"github.com/claimcoach/backend/internal/config"
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
	}

	return r, nil
}
