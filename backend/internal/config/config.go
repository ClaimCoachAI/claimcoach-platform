package config

import (
	"fmt"
	"os"
	"strconv"
)

type Config struct {
	DatabaseURL        string
	SupabaseURL        string
	SupabaseServiceKey string
	SupabaseJWTSecret  string
	PerplexityAPIKey   string
	AllowedOrigins     string
	Port               string
	FrontendURL        string

	// Perplexity API
	PerplexityModel      string
	PerplexityTimeout    int // seconds
	PerplexityMaxRetries int

	// SendGrid Email Service (optional - falls back to mock if not provided)
	SendGridAPIKey    string
	SendGridFromEmail string
	SendGridFromName  string
}

func Load() (*Config, error) {
	cfg := &Config{
		DatabaseURL:          os.Getenv("DATABASE_URL"),
		SupabaseURL:          os.Getenv("SUPABASE_URL"),
		SupabaseServiceKey:   os.Getenv("SUPABASE_SERVICE_KEY"),
		SupabaseJWTSecret:    os.Getenv("SUPABASE_JWT_SECRET"),
		PerplexityAPIKey:     os.Getenv("PERPLEXITY_API_KEY"),
		AllowedOrigins:       os.Getenv("ALLOWED_ORIGINS"),
		Port:                 os.Getenv("PORT"),
		FrontendURL:          os.Getenv("FRONTEND_URL"),
		PerplexityModel:      getEnvOrDefault("PERPLEXITY_MODEL", "sonar-pro"),
		PerplexityTimeout:    getEnvIntOrDefault("PERPLEXITY_TIMEOUT", 60),
		PerplexityMaxRetries: getEnvIntOrDefault("PERPLEXITY_MAX_RETRIES", 3),
		SendGridAPIKey:       os.Getenv("SENDGRID_API_KEY"),
		SendGridFromEmail:    getEnvOrDefault("SENDGRID_FROM_EMAIL", "noreply@claimcoach.ai"),
		SendGridFromName:     getEnvOrDefault("SENDGRID_FROM_NAME", "ClaimCoach AI"),
	}

	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}
	if cfg.SupabaseURL == "" {
		return nil, fmt.Errorf("SUPABASE_URL is required")
	}
	if cfg.SupabaseServiceKey == "" {
		return nil, fmt.Errorf("SUPABASE_SERVICE_KEY is required")
	}
	if cfg.SupabaseJWTSecret == "" {
		return nil, fmt.Errorf("SUPABASE_JWT_SECRET is required")
	}
	if cfg.PerplexityAPIKey == "" {
		return nil, fmt.Errorf("PERPLEXITY_API_KEY is required")
	}
	if cfg.PerplexityTimeout <= 0 {
		return nil, fmt.Errorf("PERPLEXITY_TIMEOUT must be positive, got %d", cfg.PerplexityTimeout)
	}
	if cfg.PerplexityMaxRetries <= 0 {
		return nil, fmt.Errorf("PERPLEXITY_MAX_RETRIES must be positive, got %d", cfg.PerplexityMaxRetries)
	}

	return cfg, nil
}

func getEnvOrDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvIntOrDefault(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if intValue, err := strconv.Atoi(value); err == nil {
			return intValue
		}
	}
	return defaultValue
}
