package models

import "time"

type Policy struct {
	ID              string     `json:"id" db:"id"`
	PropertyID      string     `json:"property_id" db:"property_id"`
	CarrierName     string     `json:"carrier_name" db:"carrier_name"`
	CarrierPhone    *string    `json:"carrier_phone" db:"carrier_phone"`
	CarrierEmail    *string    `json:"carrier_email" db:"carrier_email"`
	PolicyNumber    *string    `json:"policy_number" db:"policy_number"`
	DeductibleValue float64    `json:"deductible_value" db:"deductible_value"`
	Exclusions      *string    `json:"exclusions" db:"exclusions"`
	PolicyPdfUrl    *string    `json:"policy_pdf_url" db:"policy_pdf_url"`
	EffectiveDate   *time.Time `json:"effective_date" db:"effective_date"`
	ExpirationDate  *time.Time `json:"expiration_date" db:"expiration_date"`
	CreatedAt       time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at" db:"updated_at"`
}
