package services

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/claimcoach/backend/internal/config"
	"github.com/claimcoach/backend/internal/models"
	"github.com/google/uuid"
)

type MagicLinkService struct {
	db           *sql.DB
	cfg          *config.Config
	claimService *ClaimService
}

func NewMagicLinkService(db *sql.DB, cfg *config.Config, claimService *ClaimService) *MagicLinkService {
	return &MagicLinkService{
		db:           db,
		cfg:          cfg,
		claimService: claimService,
	}
}

type GenerateMagicLinkInput struct {
	ContractorName  string  `json:"contractor_name" binding:"required"`
	ContractorEmail string  `json:"contractor_email" binding:"required,email"`
	ContractorPhone *string `json:"contractor_phone"`
}

type MagicLinkResponse struct {
	MagicLinkID     string     `json:"magic_link_id"`
	Token           string     `json:"token"`
	LinkURL         string     `json:"link_url"`
	ContractorName  string     `json:"contractor_name"`
	ContractorEmail string     `json:"contractor_email"`
	ContractorPhone *string    `json:"contractor_phone,omitempty"`
	ExpiresAt       time.Time  `json:"expires_at"`
	Status          string     `json:"status"`
}

func (s *MagicLinkService) GenerateMagicLink(claimID string, organizationID string, userID string, input GenerateMagicLinkInput) (*MagicLinkResponse, error) {
	// Step 1: Validate claim ownership
	_, err := s.claimService.GetClaim(claimID, organizationID)
	if err != nil {
		return nil, err
	}

	// Step 2: Invalidate previous active links for this claim
	err = s.invalidatePreviousLinks(claimID)
	if err != nil {
		return nil, fmt.Errorf("failed to invalidate previous links: %w", err)
	}

	// Step 3: Generate cryptographically secure token (UUID v4)
	token := uuid.New().String()

	// Step 4: Calculate expiration (72 hours from now)
	expiresAt := time.Now().Add(72 * time.Hour)

	// Step 5: Insert into database
	magicLink := &models.MagicLink{
		ID:              uuid.New().String(),
		ClaimID:         claimID,
		Token:           token,
		ContractorName:  input.ContractorName,
		ContractorEmail: input.ContractorEmail,
		ContractorPhone: input.ContractorPhone,
		ExpiresAt:       expiresAt,
		AccessCount:     0,
		Status:          "active",
		CreatedAt:       time.Now(),
	}

	query := `
		INSERT INTO magic_links (
			id, claim_id, token, contractor_name, contractor_email, contractor_phone,
			expires_at, accessed_at, access_count, status, created_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		RETURNING id, claim_id, token, contractor_name, contractor_email, contractor_phone,
			expires_at, accessed_at, access_count, status, created_at
	`

	err = s.db.QueryRow(
		query,
		magicLink.ID,
		magicLink.ClaimID,
		magicLink.Token,
		magicLink.ContractorName,
		magicLink.ContractorEmail,
		magicLink.ContractorPhone,
		magicLink.ExpiresAt,
		nil, // accessed_at
		magicLink.AccessCount,
		magicLink.Status,
		magicLink.CreatedAt,
	).Scan(
		&magicLink.ID,
		&magicLink.ClaimID,
		&magicLink.Token,
		&magicLink.ContractorName,
		&magicLink.ContractorEmail,
		&magicLink.ContractorPhone,
		&magicLink.ExpiresAt,
		&magicLink.AccessedAt,
		&magicLink.AccessCount,
		&magicLink.Status,
		&magicLink.CreatedAt,
	)

	if err != nil {
		return nil, fmt.Errorf("failed to create magic link: %w", err)
	}

	// Step 6: Log activity
	metadata := map[string]interface{}{
		"contractor_name":  input.ContractorName,
		"contractor_email": input.ContractorEmail,
		"magic_link_id":    magicLink.ID,
	}
	metadataJSON, _ := json.Marshal(metadata)
	metadataStr := string(metadataJSON)

	description := fmt.Sprintf("Magic link generated for contractor: %s (%s)", input.ContractorName, input.ContractorEmail)
	err = s.claimService.createActivity(claimID, &userID, "magic_link_generated", description, &metadataStr)
	if err != nil {
		// Don't fail the entire operation if activity logging fails
		fmt.Printf("Warning: failed to log activity: %v\n", err)
	}

	// Step 7: Build frontend URL
	linkURL := fmt.Sprintf("%s/upload/%s", s.cfg.FrontendURL, token)

	// Return response
	response := &MagicLinkResponse{
		MagicLinkID:     magicLink.ID,
		Token:           magicLink.Token,
		LinkURL:         linkURL,
		ContractorName:  magicLink.ContractorName,
		ContractorEmail: magicLink.ContractorEmail,
		ContractorPhone: magicLink.ContractorPhone,
		ExpiresAt:       magicLink.ExpiresAt,
		Status:          magicLink.Status,
	}

	return response, nil
}

// ValidationResult contains the result of token validation
type ValidationResult struct {
	Valid          bool         `json:"valid"`
	Reason         string       `json:"reason,omitempty"` // "expired", "not_found", "completed"
	MagicLinkID    string       `json:"magic_link_id,omitempty"`
	Claim          *ClaimInfo   `json:"claim,omitempty"`
	ContractorName string       `json:"contractor_name,omitempty"`
	ExpiresAt      time.Time    `json:"expires_at,omitempty"`
	Status         string       `json:"status,omitempty"`
}

// ClaimInfo contains minimal claim information for validation response
type ClaimInfo struct {
	ID           string       `json:"id"`
	ClaimNumber  *string      `json:"claim_number"`
	LossType     string       `json:"loss_type"`
	IncidentDate time.Time    `json:"incident_date"`
	Property     PropertyInfo `json:"property"`
}

// PropertyInfo contains property information for validation response
type PropertyInfo struct {
	Nickname     string `json:"nickname"`
	LegalAddress string `json:"legal_address"`
}

// ValidateToken validates a magic link token and returns claim information
func (s *MagicLinkService) ValidateToken(token string) (*ValidationResult, error) {
	// Query with joins to get all needed data in one query
	query := `
		SELECT
			ml.id, ml.claim_id, ml.contractor_name, ml.expires_at, ml.status,
			c.claim_number, c.loss_type, c.incident_date,
			p.nickname, p.legal_address
		FROM magic_links ml
		JOIN claims c ON c.id = ml.claim_id
		JOIN properties p ON p.id = c.property_id
		WHERE ml.token = $1
	`

	var magicLinkID, claimID, contractorName, status string
	var expiresAt, incidentDate time.Time
	var claimNumber *string
	var lossType, nickname, legalAddress string

	err := s.db.QueryRow(query, token).Scan(
		&magicLinkID,
		&claimID,
		&contractorName,
		&expiresAt,
		&status,
		&claimNumber,
		&lossType,
		&incidentDate,
		&nickname,
		&legalAddress,
	)

	// Check if token exists
	if err == sql.ErrNoRows {
		return &ValidationResult{
			Valid:  false,
			Reason: "not_found",
		}, nil
	}

	if err != nil {
		return nil, fmt.Errorf("failed to query magic link: %w", err)
	}

	// Check if expired (expires_at < now)
	if time.Now().After(expiresAt) {
		return &ValidationResult{
			Valid:  false,
			Reason: "expired",
		}, nil
	}

	// Check if status is not active
	if status != "active" {
		return &ValidationResult{
			Valid:  false,
			Reason: status, // Return the actual status (e.g., "completed")
		}, nil
	}

	// Token is valid - update access tracking
	updateQuery := `
		UPDATE magic_links
		SET access_count = access_count + 1,
			accessed_at = NOW()
		WHERE token = $1
	`

	_, err = s.db.Exec(updateQuery, token)
	if err != nil {
		// Don't fail the validation if tracking update fails
		fmt.Printf("Warning: failed to update access tracking: %v\n", err)
	}

	// Return valid result with claim data
	result := &ValidationResult{
		Valid:          true,
		MagicLinkID:    magicLinkID,
		ContractorName: contractorName,
		ExpiresAt:      expiresAt,
		Status:         status,
		Claim: &ClaimInfo{
			ID:           claimID,
			ClaimNumber:  claimNumber,
			LossType:     lossType,
			IncidentDate: incidentDate,
			Property: PropertyInfo{
				Nickname:     nickname,
				LegalAddress: legalAddress,
			},
		},
	}

	return result, nil
}

// invalidatePreviousLinks marks all active magic links for a claim as expired
func (s *MagicLinkService) invalidatePreviousLinks(claimID string) error {
	query := `
		UPDATE magic_links
		SET status = 'expired'
		WHERE claim_id = $1 AND status = 'active'
	`

	_, err := s.db.Exec(query, claimID)
	if err != nil {
		return fmt.Errorf("failed to invalidate previous links: %w", err)
	}

	return nil
}
