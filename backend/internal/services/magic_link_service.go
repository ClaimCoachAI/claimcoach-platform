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
