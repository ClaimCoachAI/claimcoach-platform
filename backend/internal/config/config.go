package config

import (
	"fmt"
	"os"
)

type Config struct {
	DatabaseURL        string
	SupabaseURL        string
	SupabaseServiceKey string
	SupabaseJWTSecret  string
	PerplexityAPIKey   string
	AllowedOrigins     string
	Port               string
}

func Load() (*Config, error) {
	cfg := &Config{
		DatabaseURL:        os.Getenv("DATABASE_URL"),
		SupabaseURL:        os.Getenv("SUPABASE_URL"),
		SupabaseServiceKey: os.Getenv("SUPABASE_SERVICE_KEY"),
		SupabaseJWTSecret:  os.Getenv("SUPABASE_JWT_SECRET"),
		PerplexityAPIKey:   os.Getenv("PERPLEXITY_API_KEY"),
		AllowedOrigins:     os.Getenv("ALLOWED_ORIGINS"),
		Port:               os.Getenv("PORT"),
	}

	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}

	return cfg, nil
}
