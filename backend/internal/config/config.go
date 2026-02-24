package config

import (
	"fmt"
	"log"
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

	// Anthropic Claude API (for PDF parsing)
	AnthropicAPIKey string
	AnthropicModel  string

	// SendGrid Email Service (optional - falls back to mock if not provided)
	SendGridAPIKey    string
	SendGridFromEmail string
	SendGridFromName  string
	ClaimCoachEmail   string

	// Legal escalation threshold — claims with delta >= this amount trigger legal prompt
	// Configurable via LEGAL_ESCALATION_THRESHOLD_DOLLARS env var (default: 10000)
	LegalEscalationThreshold float64
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
		AnthropicAPIKey:      os.Getenv("ANTHROPIC_API_KEY"),
		AnthropicModel:       getEnvOrDefault("ANTHROPIC_MODEL", "claude-opus-4-6"),
		SendGridAPIKey:       os.Getenv("SENDGRID_API_KEY"),
		SendGridFromEmail:    getEnvOrDefault("SENDGRID_FROM_EMAIL", "noreply@claimcoach.ai"),
		SendGridFromName:     getEnvOrDefault("SENDGRID_FROM_NAME", "ClaimCoach AI"),
		ClaimCoachEmail:          getEnvOrDefault("CLAIMCOACH_EMAIL", "claims@claimcoach.ai"),
		LegalEscalationThreshold: getEnvFloat64OrDefault("LEGAL_ESCALATION_THRESHOLD_DOLLARS", 10000),
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
	// SUPABASE_JWT_SECRET is optional - token verification is done via Supabase API
	// which automatically supports both symmetric (HS256) and asymmetric (ES256) keys
	// PERPLEXITY_API_KEY is optional for development - features requiring it will fail gracefully
	if cfg.PerplexityAPIKey == "" {
		log.Println("⚠️  PERPLEXITY_API_KEY not set - AI analysis features will be unavailable")
	}
	if cfg.AnthropicAPIKey == "" {
		log.Println("⚠️  ANTHROPIC_API_KEY not set - PDF parsing will be unavailable")
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

func getEnvFloat64OrDefault(key string, defaultValue float64) float64 {
	if value := os.Getenv(key); value != "" {
		if f, err := strconv.ParseFloat(value, 64); err == nil {
			return f
		}
	}
	return defaultValue
}
