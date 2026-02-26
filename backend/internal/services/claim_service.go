package services

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/claimcoach/backend/internal/models"
	"github.com/google/uuid"
)

type ComparisonResult struct {
	Deductible     float64 `json:"deductible"`
	Estimate       float64 `json:"estimate"`
	Delta          float64 `json:"delta"`
	Recommendation string  `json:"recommendation"`
}

type ClaimService struct {
	db              *sql.DB
	propertyService *PropertyService
	policyService   *PolicyService
}

func NewClaimService(db *sql.DB, propertyService *PropertyService, policyService *PolicyService) *ClaimService {
	return &ClaimService{
		db:              db,
		propertyService: propertyService,
		policyService:   policyService,
	}
}

type CreateClaimInput struct {
	PropertyID   string      `json:"property_id" binding:"required"`
	LossType     string      `json:"loss_type" binding:"required,oneof=fire water wind hail other"`
	IncidentDate models.Date `json:"incident_date" binding:"required"`
	Description  *string     `json:"description"`

	// Step tracking
	CurrentStep    *int            `json:"current_step"`
	StepsCompleted *models.IntArray `json:"steps_completed"`

	// Step-specific fields (optional on creation)
	ContractorEmail            *string    `json:"contractor_email"`
	ContractorName             *string    `json:"contractor_name"`
	ContractorPhotosUploadedAt *time.Time `json:"contractor_photos_uploaded_at"`
	DeductibleComparisonResult *string    `json:"deductible_comparison_result"`
	InsuranceClaimNumber       *string    `json:"insurance_claim_number"`
	InspectionDatetime         *time.Time `json:"inspection_datetime"`
}

type UpdateClaimStatusInput struct {
	Status          string     `json:"status" binding:"required,oneof=draft assessing filed field_scheduled audit_pending negotiating settled closed"`
	AdjusterName    *string    `json:"adjuster_name"`
	AdjusterPhone   *string    `json:"adjuster_phone"`
	MeetingDatetime *time.Time `json:"meeting_datetime"`
}

func (s *ClaimService) CreateClaim(input CreateClaimInput, userID string, organizationID string) (*models.Claim, error) {
	// Verify the property belongs to the organization
	_, err := s.propertyService.GetProperty(input.PropertyID, organizationID)
	if err != nil {
		return nil, err
	}

	// Fetch the policy_id for this property
	var policyID string
	policyQuery := `SELECT id FROM insurance_policies WHERE property_id = $1`
	err = s.db.QueryRow(policyQuery, input.PropertyID).Scan(&policyID)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("no policy found for this property")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to fetch policy: %w", err)
	}

	// Set default values for step tracking
	currentStep := 1
	if input.CurrentStep != nil {
		currentStep = *input.CurrentStep
	}

	stepsCompleted := models.IntArray{1}
	if input.StepsCompleted != nil {
		stepsCompleted = *input.StepsCompleted
	}

	// Generate ClaimCoach reference number (CC-XXXX, per-org sequential)
	var claimCount int
	countQuery := `SELECT COUNT(*) FROM claims WHERE organization_id = (
    SELECT organization_id FROM properties WHERE id = $1
)`
	err = s.db.QueryRow(countQuery, input.PropertyID).Scan(&claimCount)
	if err != nil {
		return nil, fmt.Errorf("failed to generate claim number: %w", err)
	}
	claimNumber := fmt.Sprintf("CC-%04d", claimCount+1)

	// Create the claim
	claim := &models.Claim{
		ID:              uuid.New().String(),
		PropertyID:      input.PropertyID,
		PolicyID:        policyID,
		LossType:        input.LossType,
		IncidentDate:    input.IncidentDate.ToTime(),
		Status:          "draft",
		Description:     input.Description,
		CurrentStep:     currentStep,
		StepsCompleted:  stepsCompleted,
		CreatedByUserID: userID,
		ClaimNumber:     &claimNumber,
		CreatedAt:       time.Now(),
		UpdatedAt:       time.Now(),

		// Step-specific fields
		ContractorEmail:            input.ContractorEmail,
		ContractorName:             input.ContractorName,
		ContractorPhotosUploadedAt: input.ContractorPhotosUploadedAt,
		DeductibleComparisonResult: input.DeductibleComparisonResult,
		InsuranceClaimNumber:       input.InsuranceClaimNumber,
		InspectionDatetime:         input.InspectionDatetime,
	}

	query := `
		INSERT INTO claims (
			id, property_id, policy_id, claim_number, loss_type, incident_date,
			status, filed_at, description, current_step, steps_completed,
			contractor_email, contractor_name, contractor_photos_uploaded_at,
			deductible_comparison_result, insurance_claim_number, inspection_datetime,
			assigned_user_id, adjuster_name, adjuster_phone, meeting_datetime,
			created_by_user_id, created_at, updated_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
		RETURNING id, property_id, policy_id, claim_number, loss_type, incident_date,
			status, filed_at, description, current_step, steps_completed,
			contractor_email, contractor_name, contractor_photos_uploaded_at,
			deductible_comparison_result, insurance_claim_number, inspection_datetime,
			assigned_user_id, adjuster_name, adjuster_phone, meeting_datetime,
			created_by_user_id, created_at, updated_at
	`

	err = s.db.QueryRow(
		query,
		claim.ID,
		claim.PropertyID,
		claim.PolicyID,
		claimNumber,
		claim.LossType,
		claim.IncidentDate,
		claim.Status,
		nil, // filed_at
		claim.Description,
		claim.CurrentStep,
		claim.StepsCompleted,
		claim.ContractorEmail,
		claim.ContractorName,
		claim.ContractorPhotosUploadedAt,
		claim.DeductibleComparisonResult,
		claim.InsuranceClaimNumber,
		claim.InspectionDatetime,
		nil, // assigned_user_id
		nil, // adjuster_name
		nil, // adjuster_phone
		nil, // meeting_datetime
		claim.CreatedByUserID,
		claim.CreatedAt,
		claim.UpdatedAt,
	).Scan(
		&claim.ID,
		&claim.PropertyID,
		&claim.PolicyID,
		&claim.ClaimNumber,
		&claim.LossType,
		&claim.IncidentDate,
		&claim.Status,
		&claim.FiledAt,
		&claim.Description,
		&claim.CurrentStep,
		&claim.StepsCompleted,
		&claim.ContractorEmail,
		&claim.ContractorName,
		&claim.ContractorPhotosUploadedAt,
		&claim.DeductibleComparisonResult,
		&claim.InsuranceClaimNumber,
		&claim.InspectionDatetime,
		&claim.AssignedUserID,
		&claim.AdjusterName,
		&claim.AdjusterPhone,
		&claim.MeetingDatetime,
		&claim.CreatedByUserID,
		&claim.CreatedAt,
		&claim.UpdatedAt,
	)

	if err != nil {
		return nil, fmt.Errorf("failed to create claim: %w", err)
	}

	// Create activity log
	err = s.createActivity(claim.ID, &userID, "status_change", "Claim created", nil)
	if err != nil {
		// Don't fail the entire operation if activity logging fails
		fmt.Printf("Warning: failed to log activity: %v\n", err)
	}

	return claim, nil
}

func (s *ClaimService) GetClaims(organizationID string, statusFilter *string, propertyIDFilter *string) ([]models.Claim, error) {
	query := `
		SELECT c.id, c.property_id, c.policy_id, c.claim_number, c.loss_type, c.incident_date,
			c.status, c.filed_at, c.description, c.current_step, c.steps_completed,
			c.contractor_email, c.contractor_name, c.contractor_photos_uploaded_at,
			c.deductible_comparison_result, c.insurance_claim_number, c.inspection_datetime,
			c.assigned_user_id, c.adjuster_name, c.adjuster_phone,
			c.meeting_datetime, c.created_by_user_id, c.created_at, c.updated_at,
			c.contractor_estimate_total
		FROM claims c
		INNER JOIN properties p ON c.property_id = p.id
		WHERE p.organization_id = $1
	`

	args := []interface{}{organizationID}
	argPos := 2

	if statusFilter != nil && *statusFilter != "" {
		query += fmt.Sprintf(" AND c.status = $%d", argPos)
		args = append(args, *statusFilter)
		argPos++
	}

	if propertyIDFilter != nil && *propertyIDFilter != "" {
		query += fmt.Sprintf(" AND c.property_id = $%d", argPos)
		args = append(args, *propertyIDFilter)
		argPos++
	}

	query += " ORDER BY c.created_at DESC"

	rows, err := s.db.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to get claims: %w", err)
	}
	defer rows.Close()

	claims := []models.Claim{}
	for rows.Next() {
		var claim models.Claim
		err := rows.Scan(
			&claim.ID,
			&claim.PropertyID,
			&claim.PolicyID,
			&claim.ClaimNumber,
			&claim.LossType,
			&claim.IncidentDate,
			&claim.Status,
			&claim.FiledAt,
			&claim.Description,
			&claim.CurrentStep,
			&claim.StepsCompleted,
			&claim.ContractorEmail,
			&claim.ContractorName,
			&claim.ContractorPhotosUploadedAt,
			&claim.DeductibleComparisonResult,
			&claim.InsuranceClaimNumber,
			&claim.InspectionDatetime,
			&claim.AssignedUserID,
			&claim.AdjusterName,
			&claim.AdjusterPhone,
			&claim.MeetingDatetime,
			&claim.CreatedByUserID,
			&claim.CreatedAt,
			&claim.UpdatedAt,
			&claim.ContractorEstimateTotal,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan claim: %w", err)
		}
		claims = append(claims, claim)
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("failed to iterate claims: %w", err)
	}

	return claims, nil
}

func (s *ClaimService) GetClaim(claimID string, organizationID string) (*models.Claim, error) {
	query := `
		SELECT c.id, c.property_id, c.policy_id, c.claim_number, c.loss_type, c.incident_date,
			c.status, c.filed_at, c.description, c.current_step, c.steps_completed,
			c.contractor_email, c.contractor_name, c.contractor_photos_uploaded_at,
			c.deductible_comparison_result, c.insurance_claim_number, c.inspection_datetime,
			c.assigned_user_id, c.adjuster_name, c.adjuster_phone,
			c.meeting_datetime, c.created_by_user_id, c.created_at, c.updated_at,
			c.contractor_estimate_total
		FROM claims c
		INNER JOIN properties p ON c.property_id = p.id
		WHERE c.id = $1 AND p.organization_id = $2
	`

	var claim models.Claim
	err := s.db.QueryRow(query, claimID, organizationID).Scan(
		&claim.ID,
		&claim.PropertyID,
		&claim.PolicyID,
		&claim.ClaimNumber,
		&claim.LossType,
		&claim.IncidentDate,
		&claim.Status,
		&claim.FiledAt,
		&claim.Description,
		&claim.CurrentStep,
		&claim.StepsCompleted,
		&claim.ContractorEmail,
		&claim.ContractorName,
		&claim.ContractorPhotosUploadedAt,
		&claim.DeductibleComparisonResult,
		&claim.InsuranceClaimNumber,
		&claim.InspectionDatetime,
		&claim.AssignedUserID,
		&claim.AdjusterName,
		&claim.AdjusterPhone,
		&claim.MeetingDatetime,
		&claim.CreatedByUserID,
		&claim.CreatedAt,
		&claim.UpdatedAt,
		&claim.ContractorEstimateTotal,
	)

	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("claim not found")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get claim: %w", err)
	}

	// Load property relationship
	property, err := s.propertyService.GetProperty(claim.PropertyID, organizationID)
	if err == nil {
		claim.Property = property
	}

	// Load policy relationship
	policy, err := s.policyService.GetPolicy(claim.PropertyID, organizationID)
	if err == nil {
		claim.Policy = policy
	}

	return &claim, nil
}

func (s *ClaimService) UpdateClaimStatus(claimID string, organizationID string, userID string, input UpdateClaimStatusInput) (*models.Claim, error) {
	// First, get the existing claim to verify ownership and get current status
	existingClaim, err := s.GetClaim(claimID, organizationID)
	if err != nil {
		return nil, err
	}

	// Validate status transition (basic validation - you can enhance this)
	validStatuses := map[string]bool{
		"draft":           true,
		"assessing":       true,
		"filed":           true,
		"field_scheduled": true,
		"audit_pending":   true,
		"negotiating":     true,
		"settled":         true,
		"closed":          true,
	}

	if !validStatuses[input.Status] {
		return nil, fmt.Errorf("invalid status: %s", input.Status)
	}

	// Determine if we need to set filed_at
	var filedAt *time.Time
	if input.Status == "filed" && existingClaim.FiledAt == nil {
		now := time.Now()
		filedAt = &now
	} else {
		filedAt = existingClaim.FiledAt
	}

	// Update the claim
	query := `
		UPDATE claims
		SET status = $1,
			adjuster_name = $2,
			adjuster_phone = $3,
			meeting_datetime = $4,
			filed_at = $5,
			updated_at = $6
		WHERE id = $7
		RETURNING id, property_id, policy_id, claim_number, loss_type, incident_date,
			status, filed_at, description, current_step, steps_completed,
			contractor_email, contractor_name, contractor_photos_uploaded_at,
			deductible_comparison_result, insurance_claim_number, inspection_datetime,
			assigned_user_id, adjuster_name, adjuster_phone,
			meeting_datetime, created_by_user_id, created_at, updated_at
	`

	var claim models.Claim
	err = s.db.QueryRow(
		query,
		input.Status,
		input.AdjusterName,
		input.AdjusterPhone,
		input.MeetingDatetime,
		filedAt,
		time.Now(),
		claimID,
	).Scan(
		&claim.ID,
		&claim.PropertyID,
		&claim.PolicyID,
		&claim.ClaimNumber,
		&claim.LossType,
		&claim.IncidentDate,
		&claim.Status,
		&claim.FiledAt,
		&claim.Description,
		&claim.CurrentStep,
		&claim.StepsCompleted,
		&claim.ContractorEmail,
		&claim.ContractorName,
		&claim.ContractorPhotosUploadedAt,
		&claim.DeductibleComparisonResult,
		&claim.InsuranceClaimNumber,
		&claim.InspectionDatetime,
		&claim.AssignedUserID,
		&claim.AdjusterName,
		&claim.AdjusterPhone,
		&claim.MeetingDatetime,
		&claim.CreatedByUserID,
		&claim.CreatedAt,
		&claim.UpdatedAt,
	)

	if err != nil {
		return nil, fmt.Errorf("failed to update claim status: %w", err)
	}

	// Create activity log for status change
	description := fmt.Sprintf("Status changed from %s to %s", existingClaim.Status, input.Status)
	err = s.createActivity(claimID, &userID, "status_change", description, nil)
	if err != nil {
		// Don't fail the entire operation if activity logging fails
		fmt.Printf("Warning: failed to log activity: %v\n", err)
	}

	return &claim, nil
}

func (s *ClaimService) GetClaimActivities(claimID string, organizationID string) ([]models.ClaimActivity, error) {
	// First, verify the claim belongs to the organization
	_, err := s.GetClaim(claimID, organizationID)
	if err != nil {
		return nil, err
	}

	query := `
		SELECT id, claim_id, user_id, activity_type, description, metadata, created_at
		FROM claim_activities
		WHERE claim_id = $1
		ORDER BY created_at DESC
	`

	rows, err := s.db.Query(query, claimID)
	if err != nil {
		return nil, fmt.Errorf("failed to get claim activities: %w", err)
	}
	defer rows.Close()

	activities := []models.ClaimActivity{}
	for rows.Next() {
		var activity models.ClaimActivity
		err := rows.Scan(
			&activity.ID,
			&activity.ClaimID,
			&activity.UserID,
			&activity.ActivityType,
			&activity.Description,
			&activity.Metadata,
			&activity.CreatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan activity: %w", err)
		}
		activities = append(activities, activity)
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("failed to iterate activities: %w", err)
	}

	return activities, nil
}

// createActivity is a helper function to log activities
func (s *ClaimService) createActivity(claimID string, userID *string, activityType string, description string, metadata *string) error {
	query := `
		INSERT INTO claim_activities (
			id, claim_id, user_id, activity_type, description, metadata, created_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`

	_, err := s.db.Exec(
		query,
		uuid.New().String(),
		claimID,
		userID,
		activityType,
		description,
		metadata,
		time.Now(),
	)

	if err != nil {
		return fmt.Errorf("failed to create activity: %w", err)
	}

	return nil
}

func (s *ClaimService) UpdateEstimate(
	claimID string,
	estimateTotal float64,
	userID string,
	orgID string,
) (*models.Claim, *ComparisonResult, error) {
	// Validate estimate
	if estimateTotal <= 0 {
		return nil, nil, fmt.Errorf("estimate must be greater than 0")
	}

	// Fetch claim with policy
	query := `
		SELECT c.id, c.property_id, c.policy_id, c.claim_number, c.loss_type, c.incident_date,
			c.status, c.filed_at, c.description, c.current_step, c.steps_completed,
			c.contractor_email, c.contractor_name, c.contractor_photos_uploaded_at,
			c.deductible_comparison_result, c.insurance_claim_number, c.inspection_datetime,
			c.assigned_user_id, c.adjuster_name, c.adjuster_phone,
			c.meeting_datetime, c.created_by_user_id, c.created_at, c.updated_at,
			c.contractor_estimate_total, p.deductible_value
		FROM claims c
		JOIN insurance_policies p ON p.id = c.policy_id
		WHERE c.id = $1
	`

	var claim models.Claim
	var deductible float64
	err := s.db.QueryRow(query, claimID).Scan(
		&claim.ID,
		&claim.PropertyID,
		&claim.PolicyID,
		&claim.ClaimNumber,
		&claim.LossType,
		&claim.IncidentDate,
		&claim.Status,
		&claim.FiledAt,
		&claim.Description,
		&claim.CurrentStep,
		&claim.StepsCompleted,
		&claim.ContractorEmail,
		&claim.ContractorName,
		&claim.ContractorPhotosUploadedAt,
		&claim.DeductibleComparisonResult,
		&claim.InsuranceClaimNumber,
		&claim.InspectionDatetime,
		&claim.AssignedUserID,
		&claim.AdjusterName,
		&claim.AdjusterPhone,
		&claim.MeetingDatetime,
		&claim.CreatedByUserID,
		&claim.CreatedAt,
		&claim.UpdatedAt,
		&claim.ContractorEstimateTotal,
		&deductible,
	)
	if err == sql.ErrNoRows {
		return nil, nil, fmt.Errorf("claim not found")
	}
	if err != nil {
		return nil, nil, err
	}

	// Check ownership
	propertyOrgID, err := s.getPropertyOrganizationID(claim.PropertyID)
	if err != nil {
		return nil, nil, err
	}
	if propertyOrgID != orgID {
		return nil, nil, fmt.Errorf("unauthorized")
	}

	// Update estimate
	updateQuery := `
		UPDATE claims
		SET contractor_estimate_total = $1, updated_at = NOW()
		WHERE id = $2
		RETURNING contractor_estimate_total, updated_at
	`
	err = s.db.QueryRow(updateQuery, estimateTotal, claimID).Scan(
		&claim.ContractorEstimateTotal,
		&claim.UpdatedAt,
	)
	if err != nil {
		return nil, nil, err
	}

	// Calculate comparison
	delta := estimateTotal - deductible
	recommendation := "not_worth_filing"
	if delta > 0 {
		recommendation = "worth_filing"
	}

	comparison := &ComparisonResult{
		Deductible:     deductible,
		Estimate:       estimateTotal,
		Delta:          delta,
		Recommendation: recommendation,
	}

	// Log activity
	err = s.logActivity(claimID, &userID, "estimate_entered",
		fmt.Sprintf("Contractor estimate entered: $%.2f", estimateTotal),
		map[string]interface{}{
			"estimate_total": estimateTotal,
			"deductible":     deductible,
			"delta":          delta,
			"recommendation": recommendation,
		},
	)
	if err != nil {
		log.Printf("Warning: Failed to log activity: %v", err)
	}

	return &claim, comparison, nil
}

// Helper method to get property organization ID
func (s *ClaimService) getPropertyOrganizationID(propertyID string) (string, error) {
	var orgID string
	err := s.db.QueryRow(
		"SELECT organization_id FROM properties WHERE id = $1",
		propertyID,
	).Scan(&orgID)
	return orgID, err
}

// logActivity is a helper function to log activities with metadata as a map
func (s *ClaimService) logActivity(claimID string, userID *string, activityType string, description string, metadata map[string]interface{}) error {
	var metadataStr *string
	if metadata != nil {
		jsonBytes, err := json.Marshal(metadata)
		if err != nil {
			return fmt.Errorf("failed to marshal metadata: %w", err)
		}
		str := string(jsonBytes)
		metadataStr = &str
	}

	return s.createActivity(claimID, userID, activityType, description, metadataStr)
}

// GetDB returns the database connection (for testing purposes)
func (s *ClaimService) GetDB() *sql.DB {
	return s.db
}

type UpdateClaimStepInput struct {
	CurrentStep                *int      `json:"current_step"`
	StepsCompleted             *[]int    `json:"steps_completed"`
	Description                *string   `json:"description"`
	ContractorEmail            *string   `json:"contractor_email"`
	ContractorName             *string   `json:"contractor_name"`
	ContractorEstimateTotal    *float64  `json:"contractor_estimate_total"`
	DeductibleComparisonResult *string   `json:"deductible_comparison_result" binding:"omitempty,oneof=worth_filing not_worth_filing"`
	InsuranceClaimNumber       *string   `json:"insurance_claim_number"`
	AdjusterName               *string   `json:"adjuster_name"`
	AdjusterPhone              *string   `json:"adjuster_phone"`
	InspectionDatetime         *string   `json:"inspection_datetime"`
	Status                     *string   `json:"status"`
}

func (s *ClaimService) UpdateClaimStep(claimID string, organizationID string, input UpdateClaimStepInput) (*models.Claim, error) {
	// Verify claim belongs to organization
	_, err := s.GetClaim(claimID, organizationID)
	if err != nil {
		return nil, err
	}

	// Build dynamic update query
	query := `UPDATE claims SET updated_at = $1`
	args := []interface{}{time.Now()}
	paramIndex := 2

	if input.CurrentStep != nil {
		query += fmt.Sprintf(", current_step = $%d", paramIndex)
		args = append(args, *input.CurrentStep)
		paramIndex++
	}
	if input.StepsCompleted != nil {
		stepsJSON, _ := json.Marshal(*input.StepsCompleted)
		query += fmt.Sprintf(", steps_completed = $%d", paramIndex)
		args = append(args, stepsJSON)
		paramIndex++
	}
	if input.Description != nil {
		query += fmt.Sprintf(", description = $%d", paramIndex)
		args = append(args, *input.Description)
		paramIndex++
	}
	if input.ContractorEmail != nil {
		query += fmt.Sprintf(", contractor_email = $%d", paramIndex)
		args = append(args, *input.ContractorEmail)
		paramIndex++
	}
	if input.ContractorName != nil {
		query += fmt.Sprintf(", contractor_name = $%d", paramIndex)
		args = append(args, *input.ContractorName)
		paramIndex++
	}
	if input.ContractorEstimateTotal != nil {
		query += fmt.Sprintf(", contractor_estimate_total = $%d", paramIndex)
		args = append(args, *input.ContractorEstimateTotal)
		paramIndex++
	}
	if input.DeductibleComparisonResult != nil {
		query += fmt.Sprintf(", deductible_comparison_result = $%d", paramIndex)
		args = append(args, *input.DeductibleComparisonResult)
		paramIndex++
	}
	if input.InsuranceClaimNumber != nil {
		query += fmt.Sprintf(", insurance_claim_number = $%d", paramIndex)
		args = append(args, *input.InsuranceClaimNumber)
		paramIndex++
	}
	if input.AdjusterName != nil {
		query += fmt.Sprintf(", adjuster_name = $%d", paramIndex)
		args = append(args, *input.AdjusterName)
		paramIndex++
	}
	if input.AdjusterPhone != nil {
		query += fmt.Sprintf(", adjuster_phone = $%d", paramIndex)
		args = append(args, *input.AdjusterPhone)
		paramIndex++
	}
	if input.InspectionDatetime != nil {
		query += fmt.Sprintf(", inspection_datetime = $%d", paramIndex)
		args = append(args, *input.InspectionDatetime)
		paramIndex++
	}
	if input.Status != nil {
		query += fmt.Sprintf(", status = $%d", paramIndex)
		args = append(args, *input.Status)
		paramIndex++
	}

	query += fmt.Sprintf(" WHERE id = $%d", paramIndex)
	args = append(args, claimID)
	paramIndex++

	query += ` RETURNING id, property_id, policy_id, claim_number, loss_type, incident_date,
		status, filed_at, description, contractor_estimate_total, current_step, steps_completed,
		contractor_email, contractor_name, contractor_photos_uploaded_at,
		deductible_comparison_result, insurance_claim_number, inspection_datetime,
		assigned_user_id, adjuster_name, adjuster_phone,
		meeting_datetime, created_by_user_id, created_at, updated_at`

	var claim models.Claim
	err = s.db.QueryRow(query, args...).Scan(
		&claim.ID,
		&claim.PropertyID,
		&claim.PolicyID,
		&claim.ClaimNumber,
		&claim.LossType,
		&claim.IncidentDate,
		&claim.Status,
		&claim.FiledAt,
		&claim.Description,
		&claim.ContractorEstimateTotal,
		&claim.CurrentStep,
		&claim.StepsCompleted,
		&claim.ContractorEmail,
		&claim.ContractorName,
		&claim.ContractorPhotosUploadedAt,
		&claim.DeductibleComparisonResult,
		&claim.InsuranceClaimNumber,
		&claim.InspectionDatetime,
		&claim.AssignedUserID,
		&claim.AdjusterName,
		&claim.AdjusterPhone,
		&claim.MeetingDatetime,
		&claim.CreatedByUserID,
		&claim.CreatedAt,
		&claim.UpdatedAt,
	)

	if err != nil {
		return nil, fmt.Errorf("failed to update claim step: %w", err)
	}

	return &claim, nil
}

func (s *ClaimService) DeleteClaim(claimID string, organizationID string) error {
	// Verify claim belongs to organization
	_, err := s.GetClaim(claimID, organizationID)
	if err != nil {
		return err
	}

	// Delete the claim (this will cascade delete related records if foreign keys are set up)
	query := `DELETE FROM claims WHERE id = $1`
	result, err := s.db.Exec(query, claimID)
	if err != nil {
		return fmt.Errorf("failed to delete claim: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rowsAffected == 0 {
		return fmt.Errorf("claim not found")
	}

	return nil
}
