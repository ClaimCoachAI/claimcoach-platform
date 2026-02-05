package models

import "time"

type Policy struct {
	ID                   string     `json:"id" db:"id"`
	PropertyID           string     `json:"property_id" db:"property_id"`
	CarrierName          string     `json:"carrier_name" db:"carrier_name"`
	PolicyNumber         *string    `json:"policy_number" db:"policy_number"`
	CoverageALimit       *float64   `json:"coverage_a_limit" db:"coverage_a_limit"`
	CoverageBLimit       *float64   `json:"coverage_b_limit" db:"coverage_b_limit"`
	CoverageDLimit       *float64   `json:"coverage_d_limit" db:"coverage_d_limit"`
	DeductibleType       string     `json:"deductible_type" db:"deductible_type"`
	DeductibleValue      float64    `json:"deductible_value" db:"deductible_value"`
	DeductibleCalculated float64    `json:"deductible_calculated" db:"deductible_calculated"`
	PolicyPdfUrl         *string    `json:"policy_pdf_url" db:"policy_pdf_url"`
	EffectiveDate        *time.Time `json:"effective_date" db:"effective_date"`
	ExpirationDate       *time.Time `json:"expiration_date" db:"expiration_date"`
	CreatedAt            time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt            time.Time  `json:"updated_at" db:"updated_at"`
}
