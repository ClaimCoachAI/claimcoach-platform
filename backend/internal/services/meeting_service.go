package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/claimcoach/backend/internal/models"
	"github.com/google/uuid"
)

// MeetingService handles meeting scheduling and management
type MeetingService struct {
	db           *sql.DB
	emailService EmailService
	claimService *ClaimService
}

// NewMeetingService creates a new MeetingService instance
func NewMeetingService(db *sql.DB, emailService EmailService, claimService *ClaimService) *MeetingService {
	return &MeetingService{
		db:           db,
		emailService: emailService,
		claimService: claimService,
	}
}

// CreateMeetingInput contains data for creating a meeting
type CreateMeetingInput struct {
	MeetingType              string  `json:"meeting_type"`
	ScheduledDate            string  `json:"scheduled_date"`
	ScheduledTime            string  `json:"scheduled_time"`
	Location                 string  `json:"location"`
	DurationMinutes          *int    `json:"duration_minutes"`
	AdjusterName             *string `json:"adjuster_name"`
	AdjusterEmail            *string `json:"adjuster_email"`
	AdjusterPhone            *string `json:"adjuster_phone"`
	AssignedRepresentativeID *string `json:"assigned_representative_id"`
	Notes                    *string `json:"notes"`
}

// CreateMeeting creates a new meeting for a claim
func (s *MeetingService) CreateMeeting(ctx context.Context, claimID, userID, orgID string, input CreateMeetingInput) (string, error) {
	// Verify claim ownership
	claim, err := s.claimService.GetClaim(claimID, orgID)
	if err != nil {
		return "", fmt.Errorf("failed to get claim: %w", err)
	}
	if claim == nil {
		return "", fmt.Errorf("claim not found")
	}

	// Generate meeting ID
	meetingID := uuid.New().String()

	// Insert meeting
	query := `
		INSERT INTO meetings (
			id, claim_id, meeting_type, scheduled_date, scheduled_time,
			location, duration_minutes, adjuster_name, adjuster_email, adjuster_phone,
			assigned_representative_id, notes, status, created_by_user_id
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
	`

	_, err = s.db.ExecContext(
		ctx,
		query,
		meetingID,
		claimID,
		input.MeetingType,
		input.ScheduledDate,
		input.ScheduledTime,
		input.Location,
		input.DurationMinutes,
		input.AdjusterName,
		input.AdjusterEmail,
		input.AdjusterPhone,
		input.AssignedRepresentativeID,
		input.Notes,
		models.MeetingStatusScheduled,
		userID,
	)
	if err != nil {
		return "", fmt.Errorf("failed to create meeting: %w", err)
	}

	// Update claim status to field_scheduled if currently filed
	if claim.Status == "filed" {
		statusInput := UpdateClaimStatusInput{Status: "field_scheduled"}
		_, err = s.claimService.UpdateClaimStatus(claimID, orgID, userID, statusInput)
		if err != nil {
			log.Printf("Warning: failed to update claim status: %v", err)
		}
	}

	// Log activity
	metadata := map[string]interface{}{
		"meeting_id":     meetingID,
		"meeting_type":   input.MeetingType,
		"scheduled_date": input.ScheduledDate,
		"scheduled_time": input.ScheduledTime,
		"location":       input.Location,
	}
	if input.AdjusterName != nil {
		metadata["adjuster_name"] = *input.AdjusterName
	}

	err = s.logActivity(ctx, claimID, userID, "meeting_scheduled", "Meeting scheduled", metadata)
	if err != nil {
		log.Printf("Warning: failed to log activity: %v", err)
	}

	// Send email notifications (non-blocking)
	go s.sendMeetingNotifications(meetingID, claimID, input)

	return meetingID, nil
}

// GetMeeting retrieves a meeting by ID with ownership check
func (s *MeetingService) GetMeeting(ctx context.Context, meetingID, orgID string) (*models.Meeting, error) {
	query := `
		SELECT m.*
		FROM meetings m
		INNER JOIN claims c ON m.claim_id = c.id
		INNER JOIN properties p ON c.property_id = p.id
		WHERE m.id = $1 AND p.organization_id = $2
	`

	var meeting models.Meeting
	err := s.db.QueryRowContext(ctx, query, meetingID, orgID).Scan(
		&meeting.ID,
		&meeting.ClaimID,
		&meeting.MeetingType,
		&meeting.ScheduledDate,
		&meeting.ScheduledTime,
		&meeting.Location,
		&meeting.DurationMinutes,
		&meeting.Status,
		&meeting.AdjusterName,
		&meeting.AdjusterEmail,
		&meeting.AdjusterPhone,
		&meeting.AssignedRepresentativeID,
		&meeting.Notes,
		&meeting.OutcomeSummary,
		&meeting.CreatedByUserID,
		&meeting.CreatedAt,
		&meeting.UpdatedAt,
		&meeting.CompletedAt,
		&meeting.CancelledAt,
		&meeting.CancellationReason,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get meeting: %w", err)
	}

	return &meeting, nil
}

// ListMeetingsByClaimID retrieves all meetings for a claim
func (s *MeetingService) ListMeetingsByClaimID(ctx context.Context, claimID, orgID string) ([]models.Meeting, error) {
	query := `
		SELECT m.*
		FROM meetings m
		INNER JOIN claims c ON m.claim_id = c.id
		INNER JOIN properties p ON c.property_id = p.id
		WHERE m.claim_id = $1 AND p.organization_id = $2
		ORDER BY m.scheduled_date DESC, m.scheduled_time DESC
	`

	rows, err := s.db.QueryContext(ctx, query, claimID, orgID)
	if err != nil {
		return nil, fmt.Errorf("failed to list meetings: %w", err)
	}
	defer rows.Close()

	var meetings []models.Meeting
	for rows.Next() {
		var meeting models.Meeting
		err := rows.Scan(
			&meeting.ID,
			&meeting.ClaimID,
			&meeting.MeetingType,
			&meeting.ScheduledDate,
			&meeting.ScheduledTime,
			&meeting.Location,
			&meeting.DurationMinutes,
			&meeting.Status,
			&meeting.AdjusterName,
			&meeting.AdjusterEmail,
			&meeting.AdjusterPhone,
			&meeting.AssignedRepresentativeID,
			&meeting.Notes,
			&meeting.OutcomeSummary,
			&meeting.CreatedByUserID,
			&meeting.CreatedAt,
			&meeting.UpdatedAt,
			&meeting.CompletedAt,
			&meeting.CancelledAt,
			&meeting.CancellationReason,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan meeting: %w", err)
		}
		meetings = append(meetings, meeting)
	}

	return meetings, nil
}

// UpdateMeetingStatusInput contains data for updating meeting status
type UpdateMeetingStatusInput struct {
	Status string `json:"status"`
}

// UpdateMeetingStatus updates a meeting's status
func (s *MeetingService) UpdateMeetingStatus(ctx context.Context, meetingID, userID, orgID, status string) error {
	// Verify ownership
	meeting, err := s.GetMeeting(ctx, meetingID, orgID)
	if err != nil {
		return fmt.Errorf("failed to get meeting: %w", err)
	}
	if meeting == nil {
		return fmt.Errorf("meeting not found")
	}

	// Validate status transition
	validTransitions := map[string][]string{
		models.MeetingStatusScheduled:   {models.MeetingStatusConfirmed, models.MeetingStatusCancelled, models.MeetingStatusRescheduled},
		models.MeetingStatusConfirmed:   {models.MeetingStatusCompleted, models.MeetingStatusCancelled},
		models.MeetingStatusCompleted:   {}, // Final state
		models.MeetingStatusCancelled:   {}, // Final state
		models.MeetingStatusRescheduled: {}, // Requires creating new meeting
	}

	allowed := false
	for _, validStatus := range validTransitions[meeting.Status] {
		if status == validStatus {
			allowed = true
			break
		}
	}
	if !allowed {
		return fmt.Errorf("invalid status transition from %s to %s", meeting.Status, status)
	}

	// Update status
	query := `UPDATE meetings SET status = $1, updated_at = NOW() WHERE id = $2`
	_, err = s.db.ExecContext(ctx, query, status, meetingID)
	if err != nil {
		return fmt.Errorf("failed to update meeting status: %w", err)
	}

	// Log activity
	metadata := map[string]interface{}{
		"meeting_id":  meetingID,
		"old_status":  meeting.Status,
		"new_status":  status,
	}
	err = s.logActivity(ctx, meeting.ClaimID, userID, "meeting_status_changed", fmt.Sprintf("Meeting status changed to %s", status), metadata)
	if err != nil {
		log.Printf("Warning: failed to log activity: %v", err)
	}

	return nil
}

// CompleteMeetingInput contains data for completing a meeting
type CompleteMeetingInput struct {
	OutcomeSummary string `json:"outcome_summary"`
}

// CompleteMeeting marks a meeting as completed with outcome
func (s *MeetingService) CompleteMeeting(ctx context.Context, meetingID, userID, orgID string, input CompleteMeetingInput) error {
	// Verify ownership
	meeting, err := s.GetMeeting(ctx, meetingID, orgID)
	if err != nil {
		return fmt.Errorf("failed to get meeting: %w", err)
	}
	if meeting == nil {
		return fmt.Errorf("meeting not found")
	}

	if meeting.Status == models.MeetingStatusCompleted {
		return fmt.Errorf("meeting already completed")
	}

	// Update meeting
	query := `
		UPDATE meetings
		SET status = $1, outcome_summary = $2, completed_at = NOW(), updated_at = NOW()
		WHERE id = $3
	`
	_, err = s.db.ExecContext(ctx, query, models.MeetingStatusCompleted, input.OutcomeSummary, meetingID)
	if err != nil {
		return fmt.Errorf("failed to complete meeting: %w", err)
	}

	// Potentially update claim status to audit_pending if appropriate
	claim, err := s.claimService.GetClaim(meeting.ClaimID, orgID)
	if err == nil && claim != nil && claim.Status == "field_scheduled" {
		statusInput := UpdateClaimStatusInput{Status: "audit_pending"}
		_, err = s.claimService.UpdateClaimStatus(meeting.ClaimID, orgID, userID, statusInput)
		if err != nil {
			log.Printf("Warning: failed to update claim status: %v", err)
		}
	}

	// Log activity
	metadata := map[string]interface{}{
		"meeting_id":      meetingID,
		"outcome_summary": input.OutcomeSummary,
	}
	err = s.logActivity(ctx, meeting.ClaimID, userID, "meeting_completed", "Meeting completed", metadata)
	if err != nil {
		log.Printf("Warning: failed to log activity: %v", err)
	}

	return nil
}

// CancelMeetingInput contains data for cancelling a meeting
type CancelMeetingInput struct {
	CancellationReason string `json:"cancellation_reason"`
}

// CancelMeeting cancels a meeting with reason
func (s *MeetingService) CancelMeeting(ctx context.Context, meetingID, userID, orgID string, input CancelMeetingInput) error {
	// Verify ownership
	meeting, err := s.GetMeeting(ctx, meetingID, orgID)
	if err != nil {
		return fmt.Errorf("failed to get meeting: %w", err)
	}
	if meeting == nil {
		return fmt.Errorf("meeting not found")
	}

	if meeting.Status == models.MeetingStatusCancelled {
		return fmt.Errorf("meeting already cancelled")
	}

	// Update meeting
	query := `
		UPDATE meetings
		SET status = $1, cancellation_reason = $2, cancelled_at = NOW(), updated_at = NOW()
		WHERE id = $3
	`
	_, err = s.db.ExecContext(ctx, query, models.MeetingStatusCancelled, input.CancellationReason, meetingID)
	if err != nil {
		return fmt.Errorf("failed to cancel meeting: %w", err)
	}

	// Log activity
	metadata := map[string]interface{}{
		"meeting_id":          meetingID,
		"cancellation_reason": input.CancellationReason,
	}
	err = s.logActivity(ctx, meeting.ClaimID, userID, "meeting_cancelled", "Meeting cancelled", metadata)
	if err != nil {
		log.Printf("Warning: failed to log activity: %v", err)
	}

	return nil
}

// AssignRepresentativeInput contains data for assigning a representative
type AssignRepresentativeInput struct {
	RepresentativeID string `json:"representative_id"`
}

// AssignRepresentative assigns a representative to a meeting
func (s *MeetingService) AssignRepresentative(ctx context.Context, meetingID, userID, orgID string, representativeID string) error {
	// Verify ownership
	meeting, err := s.GetMeeting(ctx, meetingID, orgID)
	if err != nil {
		return fmt.Errorf("failed to get meeting: %w", err)
	}
	if meeting == nil {
		return fmt.Errorf("meeting not found")
	}

	// Update meeting
	query := `UPDATE meetings SET assigned_representative_id = $1, updated_at = NOW() WHERE id = $2`
	_, err = s.db.ExecContext(ctx, query, representativeID, meetingID)
	if err != nil {
		return fmt.Errorf("failed to assign representative: %w", err)
	}

	// Log activity
	metadata := map[string]interface{}{
		"meeting_id":        meetingID,
		"representative_id": representativeID,
	}
	err = s.logActivity(ctx, meeting.ClaimID, userID, "meeting_representative_assigned", "Representative assigned to meeting", metadata)
	if err != nil {
		log.Printf("Warning: failed to log activity: %v", err)
	}

	// Send notification to representative (non-blocking)
	go s.sendRepresentativeNotification(meetingID, meeting.ClaimID, representativeID)

	return nil
}

// Helper: logActivity logs an activity for a claim
func (s *MeetingService) logActivity(ctx context.Context, claimID, userID, activityType, description string, metadata map[string]interface{}) error {
	metadataJSON, err := json.Marshal(metadata)
	if err != nil {
		return fmt.Errorf("failed to marshal metadata: %w", err)
	}

	query := `
		INSERT INTO claim_activities (id, claim_id, user_id, activity_type, description, metadata)
		VALUES ($1, $2, $3, $4, $5, $6)
	`

	_, err = s.db.ExecContext(
		ctx,
		query,
		uuid.New().String(),
		claimID,
		userID,
		activityType,
		description,
		string(metadataJSON),
	)

	return err
}

// Helper: sendMeetingNotifications sends email notifications for a new meeting
func (s *MeetingService) sendMeetingNotifications(meetingID, claimID string, input CreateMeetingInput) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Get claim details
	query := `
		SELECT c.claim_number, p.legal_address
		FROM claims c
		INNER JOIN properties p ON c.property_id = p.id
		WHERE c.id = $1
	`

	var claimNumber, propertyAddress string
	err := s.db.QueryRowContext(ctx, query, claimID).Scan(&claimNumber, &propertyAddress)
	if err != nil {
		log.Printf("Error getting claim details for meeting notification: %v", err)
		return
	}

	// Send email to adjuster if email provided
	if input.AdjusterEmail != nil && *input.AdjusterEmail != "" {
		adjusterName := "Adjuster"
		if input.AdjusterName != nil {
			adjusterName = *input.AdjusterName
		}

		emailInput := SendMeetingNotificationInput{
			To:              *input.AdjusterEmail,
			RecipientName:   adjusterName,
			MeetingType:     input.MeetingType,
			MeetingDate:     input.ScheduledDate,
			MeetingTime:     input.ScheduledTime,
			Location:        input.Location,
			PropertyAddress: propertyAddress,
			ClaimNumber:     claimNumber,
			AdjusterName:    "",
		}

		err := s.emailService.SendMeetingNotification(emailInput)
		if err != nil {
			log.Printf("Error sending meeting notification to adjuster: %v", err)
		}
	}

	// TODO: Send email to assigned representative if assigned
	// This would require fetching representative details from users table
}

// Helper: sendRepresentativeNotification sends notification to assigned representative
func (s *MeetingService) sendRepresentativeNotification(meetingID, claimID, representativeID string) {
	// TODO: Implement representative notification
	// Would require:
	// 1. Fetch representative email from users table
	// 2. Fetch meeting and claim details
	// 3. Send email notification
	log.Printf("TODO: Send representative notification for meeting %s", meetingID)
}
