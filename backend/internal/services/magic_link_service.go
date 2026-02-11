package services

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/claimcoach/backend/internal/config"
	"github.com/claimcoach/backend/internal/models"
	"github.com/claimcoach/backend/internal/storage"
	"github.com/google/uuid"
)

type MagicLinkService struct {
	db           *sql.DB
	cfg          *config.Config
	storage      *storage.SupabaseStorage
	claimService *ClaimService
	emailService EmailService
}

func NewMagicLinkService(db *sql.DB, cfg *config.Config, storageClient *storage.SupabaseStorage, claimService *ClaimService, emailService EmailService) *MagicLinkService {
	return &MagicLinkService{
		db:           db,
		cfg:          cfg,
		storage:      storageClient,
		claimService: claimService,
		emailService: emailService,
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

	// Step 8: Get claim and property data for email
	claim, err := s.claimService.GetClaim(claimID, organizationID)
	if err != nil {
		// Log error but don't fail magic link creation
		fmt.Printf("Warning: failed to get claim for email: %v\n", err)
	} else {
		// Get property information
		var propertyName, propertyAddress string
		propertyQuery := `SELECT nickname, legal_address FROM properties WHERE id = $1`
		err = s.db.QueryRow(propertyQuery, claim.PropertyID).Scan(&propertyName, &propertyAddress)
		
		if err != nil {
			fmt.Printf("Warning: failed to get property for email: %v\n", err)
		} else {
			// Send email notification
			emailInput := SendMagicLinkEmailInput{
				To:              input.ContractorEmail,
				ContractorName:  input.ContractorName,
				PropertyName:    propertyName,
				PropertyAddress: propertyAddress,
				LossType:        claim.LossType,
				MagicLinkURL:    linkURL,
				ExpiresAt:       expiresAt,
			}

			err = s.emailService.SendMagicLinkEmail(emailInput)
			if err != nil {
				// Log error but don't fail magic link creation
				fmt.Printf("Warning: Failed to send email notification: %v\n", err)
			}
		}
	}

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

// RequestUploadURLWithToken generates a presigned upload URL using magic link token (no auth required)
func (s *MagicLinkService) RequestUploadURLWithToken(token string, fileName string, fileSize int64, mimeType string, documentType string) (*UploadURLResponse, error) {
	// Step 1: Validate the token
	validation, err := s.ValidateToken(token)
	if err != nil {
		return nil, fmt.Errorf("failed to validate token: %w", err)
	}

	if !validation.Valid {
		return nil, fmt.Errorf("invalid or expired token: %s", validation.Reason)
	}

	// Step 2: Validate document type and file
	if !models.IsValidDocumentType(documentType) {
		return nil, models.ErrInvalidDocumentType
	}

	err = models.ValidateFile(documentType, fileSize, mimeType)
	if err != nil {
		return nil, err
	}

	// Step 3: Get claim and organization info from validation
	claimID := validation.Claim.ID

	// Get organization ID from claim
	var organizationID string
	orgQuery := `
		SELECT p.organization_id
		FROM claims c
		JOIN properties p ON c.property_id = p.id
		WHERE c.id = $1
	`
	err = s.db.QueryRow(orgQuery, claimID).Scan(&organizationID)
	if err != nil {
		return nil, fmt.Errorf("failed to get organization ID: %w", err)
	}

	// Step 4: Generate presigned upload URL
	uploadURL, filePath, err := s.storage.GenerateUploadURL(organizationID, claimID, documentType, fileName)
	if err != nil {
		return nil, fmt.Errorf("failed to generate upload URL: %w", err)
	}

	// Step 5: Create pending document record (uploaded_by_user_id = NULL for contractor uploads)
	documentID := uuid.New().String()
	query := `
		INSERT INTO documents (
			id, claim_id, uploaded_by_user_id, document_type, file_url,
			file_name, file_size_bytes, mime_type, status, created_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		RETURNING id
	`

	err = s.db.QueryRow(
		query,
		documentID,
		claimID,
		nil, // uploaded_by_user_id is NULL for contractor uploads
		documentType,
		filePath,
		fileName,
		fileSize,
		mimeType,
		"pending",
		time.Now(),
	).Scan(&documentID)

	if err != nil {
		return nil, fmt.Errorf("failed to create document record: %w", err)
	}

	return &UploadURLResponse{
		UploadURL:  uploadURL,
		DocumentID: documentID,
		FilePath:   filePath,
	}, nil
}

// ConfirmUploadWithToken confirms a document upload using magic link token (no auth required)
func (s *MagicLinkService) ConfirmUploadWithToken(token string, documentID string) (*models.Document, error) {
	// Step 1: Validate the token
	validation, err := s.ValidateToken(token)
	if err != nil {
		return nil, fmt.Errorf("failed to validate token: %w", err)
	}

	if !validation.Valid {
		return nil, fmt.Errorf("invalid or expired token: %s", validation.Reason)
	}

	claimID := validation.Claim.ID

	// Step 2: Update document status to confirmed
	query := `
		UPDATE documents
		SET status = 'confirmed'
		WHERE id = $1 AND claim_id = $2 AND status = 'pending'
		RETURNING id, claim_id, uploaded_by_user_id, document_type, file_url,
			file_name, file_size_bytes, mime_type, metadata, status, created_at
	`

	var doc models.Document
	err = s.db.QueryRow(query, documentID, claimID).Scan(
		&doc.ID,
		&doc.ClaimID,
		&doc.UploadedByUserID,
		&doc.DocumentType,
		&doc.FileURL,
		&doc.FileName,
		&doc.FileSizeBytes,
		&doc.MimeType,
		&doc.Metadata,
		&doc.Status,
		&doc.CreatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("document not found or already confirmed")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to confirm document: %w", err)
	}

	// Step 3: Create activity log (no user_id since contractor uploads)
	metadata := map[string]interface{}{
		"document_id":      documentID,
		"document_type":    doc.DocumentType,
		"file_name":        doc.FileName,
		"contractor_name":  validation.ContractorName,
		"uploaded_via":     "magic_link",
	}
	metadataJSON, _ := json.Marshal(metadata)
	metadataStr := string(metadataJSON)

	description := fmt.Sprintf("Contractor uploaded document: %s (%s)", doc.FileName, doc.DocumentType)
	err = s.claimService.createActivity(claimID, nil, "contractor_document_upload", description, &metadataStr)
	if err != nil {
		// Don't fail the entire operation if activity logging fails
		fmt.Printf("Warning: failed to log activity: %v\n", err)
	}

	return &doc, nil
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
