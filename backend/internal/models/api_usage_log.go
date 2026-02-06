package models

import "time"

type APIUsageLog struct {
	ID              string     `json:"id" db:"id"`
	AuditReportID   *string    `json:"audit_report_id" db:"audit_report_id"`
	APICallType     string     `json:"api_call_type" db:"api_call_type"`
	TokensUsed      *int       `json:"tokens_used" db:"tokens_used"`
	EstimatedCost   *float64   `json:"estimated_cost" db:"estimated_cost"`
	CreatedAt       time.Time  `json:"created_at" db:"created_at"`
}

// API call type constants
const (
	APICallTypeEstimateGeneration   = "estimate_generation"
	APICallTypeComparisonAnalysis   = "comparison_analysis"
	APICallTypeRebuttalGeneration   = "rebuttal_generation"
	APICallTypePricingLookup        = "pricing_lookup"
)
