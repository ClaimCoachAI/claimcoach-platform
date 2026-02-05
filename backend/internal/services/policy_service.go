package services

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/claimcoach/backend/internal/models"
	"github.com/google/uuid"
)

type PolicyService struct {
	db              *sql.DB
	propertyService *PropertyService
}

func NewPolicyService(db *sql.DB, propertyService *PropertyService) *PolicyService {
	return &PolicyService{
		db:              db,
		propertyService: propertyService,
	}
}

type UpsertPolicyInput struct {
	CarrierName     string     `json:"carrier_name" binding:"required"`
	PolicyNumber    *string    `json:"policy_number"`
	CoverageALimit  *float64   `json:"coverage_a_limit"`
	CoverageBLimit  *float64   `json:"coverage_b_limit"`
	CoverageDLimit  *float64   `json:"coverage_d_limit"`
	DeductibleType  string     `json:"deductible_type" binding:"required,oneof=percentage fixed"`
	DeductibleValue float64    `json:"deductible_value" binding:"required,min=0"`
	EffectiveDate   *time.Time `json:"effective_date"`
	ExpirationDate  *time.Time `json:"expiration_date"`
}

func (s *PolicyService) calculateDeductible(deductibleType string, deductibleValue float64, coverageALimit *float64) float64 {
	if deductibleType == "percentage" {
		if coverageALimit == nil {
			return 0
		}
		return (*coverageALimit) * (deductibleValue / 100)
	}
	// Fixed deductible
	return deductibleValue
}

func (s *PolicyService) UpsertPolicy(input UpsertPolicyInput, propertyID string, organizationID string) (*models.Policy, error) {
	// First, verify the property belongs to the organization
	_, err := s.propertyService.GetProperty(propertyID, organizationID)
	if err != nil {
		return nil, err
	}

	// Calculate deductible
	deductibleCalculated := s.calculateDeductible(input.DeductibleType, input.DeductibleValue, input.CoverageALimit)

	// Check if a policy already exists for this property
	var existingID *string
	checkQuery := `SELECT id FROM insurance_policies WHERE property_id = $1`
	err = s.db.QueryRow(checkQuery, propertyID).Scan(&existingID)
	if err != nil && err != sql.ErrNoRows {
		return nil, fmt.Errorf("failed to check existing policy: %w", err)
	}

	// Prepare policy ID
	var policyID string
	if existingID != nil {
		policyID = *existingID
	} else {
		policyID = uuid.New().String()
	}

	now := time.Now()

	// Upsert policy using ON CONFLICT
	query := `
		INSERT INTO insurance_policies (
			id, property_id, carrier_name, policy_number,
			coverage_a_limit, coverage_b_limit, coverage_d_limit,
			deductible_type, deductible_value, deductible_calculated,
			policy_pdf_url, effective_date, expiration_date,
			created_at, updated_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
		ON CONFLICT (property_id)
		DO UPDATE SET
			carrier_name = EXCLUDED.carrier_name,
			policy_number = EXCLUDED.policy_number,
			coverage_a_limit = EXCLUDED.coverage_a_limit,
			coverage_b_limit = EXCLUDED.coverage_b_limit,
			coverage_d_limit = EXCLUDED.coverage_d_limit,
			deductible_type = EXCLUDED.deductible_type,
			deductible_value = EXCLUDED.deductible_value,
			deductible_calculated = EXCLUDED.deductible_calculated,
			effective_date = EXCLUDED.effective_date,
			expiration_date = EXCLUDED.expiration_date,
			updated_at = EXCLUDED.updated_at
		RETURNING id, property_id, carrier_name, policy_number,
			coverage_a_limit, coverage_b_limit, coverage_d_limit,
			deductible_type, deductible_value, deductible_calculated,
			policy_pdf_url, effective_date, expiration_date,
			created_at, updated_at
	`

	var policy models.Policy
	err = s.db.QueryRow(
		query,
		policyID,
		propertyID,
		input.CarrierName,
		input.PolicyNumber,
		input.CoverageALimit,
		input.CoverageBLimit,
		input.CoverageDLimit,
		input.DeductibleType,
		input.DeductibleValue,
		deductibleCalculated,
		nil, // policy_pdf_url
		input.EffectiveDate,
		input.ExpirationDate,
		now,
		now,
	).Scan(
		&policy.ID,
		&policy.PropertyID,
		&policy.CarrierName,
		&policy.PolicyNumber,
		&policy.CoverageALimit,
		&policy.CoverageBLimit,
		&policy.CoverageDLimit,
		&policy.DeductibleType,
		&policy.DeductibleValue,
		&policy.DeductibleCalculated,
		&policy.PolicyPdfUrl,
		&policy.EffectiveDate,
		&policy.ExpirationDate,
		&policy.CreatedAt,
		&policy.UpdatedAt,
	)

	if err != nil {
		return nil, fmt.Errorf("failed to upsert policy: %w", err)
	}

	// Update property status to 'active_monitored' if it's currently 'draft'
	updatePropertyQuery := `
		UPDATE properties
		SET status = 'active_monitored', updated_at = $1
		WHERE id = $2 AND status = 'draft'
	`
	_, err = s.db.Exec(updatePropertyQuery, time.Now(), propertyID)
	if err != nil {
		// Don't fail the entire operation if status update fails
		// but log the error (in production, you'd use a proper logger)
		fmt.Printf("Warning: failed to update property status: %v\n", err)
	}

	return &policy, nil
}

func (s *PolicyService) GetPolicy(propertyID string, organizationID string) (*models.Policy, error) {
	// First, verify the property belongs to the organization
	_, err := s.propertyService.GetProperty(propertyID, organizationID)
	if err != nil {
		return nil, err
	}

	query := `
		SELECT id, property_id, carrier_name, policy_number,
			coverage_a_limit, coverage_b_limit, coverage_d_limit,
			deductible_type, deductible_value, deductible_calculated,
			policy_pdf_url, effective_date, expiration_date,
			created_at, updated_at
		FROM insurance_policies
		WHERE property_id = $1
	`

	var policy models.Policy
	err = s.db.QueryRow(query, propertyID).Scan(
		&policy.ID,
		&policy.PropertyID,
		&policy.CarrierName,
		&policy.PolicyNumber,
		&policy.CoverageALimit,
		&policy.CoverageBLimit,
		&policy.CoverageDLimit,
		&policy.DeductibleType,
		&policy.DeductibleValue,
		&policy.DeductibleCalculated,
		&policy.PolicyPdfUrl,
		&policy.EffectiveDate,
		&policy.ExpirationDate,
		&policy.CreatedAt,
		&policy.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("policy not found")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get policy: %w", err)
	}

	return &policy, nil
}
