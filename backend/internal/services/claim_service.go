package services

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/claimcoach/backend/internal/models"
	"github.com/google/uuid"
)

type ClaimService struct {
	db              *sql.DB
	propertyService *PropertyService
}

func NewClaimService(db *sql.DB, propertyService *PropertyService) *ClaimService {
	return &ClaimService{
		db:              db,
		propertyService: propertyService,
	}
}

type CreateClaimInput struct {
	PropertyID   string    `json:"property_id" binding:"required"`
	LossType     string    `json:"loss_type" binding:"required,oneof=fire water wind hail other"`
	IncidentDate time.Time `json:"incident_date" binding:"required"`
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

	// Create the claim
	claim := &models.Claim{
		ID:              uuid.New().String(),
		PropertyID:      input.PropertyID,
		PolicyID:        policyID,
		LossType:        input.LossType,
		IncidentDate:    input.IncidentDate,
		Status:          "draft",
		CreatedByUserID: userID,
		CreatedAt:       time.Now(),
		UpdatedAt:       time.Now(),
	}

	query := `
		INSERT INTO claims (
			id, property_id, policy_id, claim_number, loss_type, incident_date,
			status, filed_at, assigned_user_id, adjuster_name, adjuster_phone,
			meeting_datetime, created_by_user_id, created_at, updated_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
		RETURNING id, property_id, policy_id, claim_number, loss_type, incident_date,
			status, filed_at, assigned_user_id, adjuster_name, adjuster_phone,
			meeting_datetime, created_by_user_id, created_at, updated_at
	`

	err = s.db.QueryRow(
		query,
		claim.ID,
		claim.PropertyID,
		claim.PolicyID,
		nil, // claim_number
		claim.LossType,
		claim.IncidentDate,
		claim.Status,
		nil, // filed_at
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
			c.status, c.filed_at, c.assigned_user_id, c.adjuster_name, c.adjuster_phone,
			c.meeting_datetime, c.created_by_user_id, c.created_at, c.updated_at
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
			&claim.AssignedUserID,
			&claim.AdjusterName,
			&claim.AdjusterPhone,
			&claim.MeetingDatetime,
			&claim.CreatedByUserID,
			&claim.CreatedAt,
			&claim.UpdatedAt,
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
			c.status, c.filed_at, c.assigned_user_id, c.adjuster_name, c.adjuster_phone,
			c.meeting_datetime, c.created_by_user_id, c.created_at, c.updated_at
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
		&claim.AssignedUserID,
		&claim.AdjusterName,
		&claim.AdjusterPhone,
		&claim.MeetingDatetime,
		&claim.CreatedByUserID,
		&claim.CreatedAt,
		&claim.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("claim not found")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get claim: %w", err)
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
			status, filed_at, assigned_user_id, adjuster_name, adjuster_phone,
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
