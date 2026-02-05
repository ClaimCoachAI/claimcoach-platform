package main

import (
	"log"

	"github.com/claimcoach/backend/internal/api"
	"github.com/claimcoach/backend/internal/config"
	"github.com/claimcoach/backend/internal/database"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	// Connect to database
	db, err := database.Connect(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	// Run migrations
	if err := database.RunMigrations(db); err != nil {
		log.Fatalf("Failed to run migrations: %v", err)
	}

	router, err := api.NewRouter(cfg, db)
	if err != nil {
		log.Fatalf("Failed to create router: %v", err)
	}

	port := cfg.Port
	if port == "" {
		port = "8080"
	}

	log.Printf("Server starting on port %s", port)
	if err := router.Run(":" + port); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
