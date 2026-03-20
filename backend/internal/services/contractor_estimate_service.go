// backend/internal/services/contractor_estimate_service.go
package services

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/claimcoach/backend/internal/models"
	"github.com/claimcoach/backend/internal/storage"
	"github.com/google/uuid"
)

type ContractorEstimateService struct {
	db           *sql.DB
	storage      *storage.SupabaseStorage
	claimService *ClaimService
}

func NewContractorEstimateService(db *sql.DB, storageClient *storage.SupabaseStorage, claimService *ClaimService) *ContractorEstimateService {
	return &ContractorEstimateService{
		db:           db,
		storage:      storageClient,
		claimService: claimService,
	}
}

type RequestContractorEstimateUploadURLInput struct {
	FileName string `json:"file_name" binding:"required"`
	FileSize int64  `json:"file_size" binding:"required"`
	MimeType string `json:"mime_type" binding:"required"`
}

type ContractorEstimateUploadURLResponse struct {
	UploadURL  string `json:"upload_url"`
	EstimateID string `json:"estimate_id"`
	FilePath   string `json:"file_path"`
}

// RequestUploadURL generates a presigned upload URL for a contractor estimate PDF.
func (s *ContractorEstimateService) RequestUploadURL(claimID, organizationID, userID string, input RequestContractorEstimateUploadURLInput) (*ContractorEstimateUploadURLResponse, error) {
	const maxFileSize = 10 * 1024 * 1024 // 10MB
	if input.FileSize > maxFileSize {
		return nil, fmt.Errorf("file size exceeds maximum allowed (10MB)")
	}
	if input.MimeType != "application/pdf" {
		return nil, fmt.Errorf("only PDF files are allowed for contractor estimates")
	}

	claim, err := s.claimService.GetClaim(claimID, organizationID)
	if err != nil {
		return nil, err
	}

	uploadURL, filePath, err := s.storage.GenerateUploadURL(organizationID, claimID, "contractor-estimate", input.FileName)
	if err != nil {
		return nil, fmt.Errorf("failed to generate upload URL: %w", err)
	}

	estimateID := uuid.New().String()
	err = s.db.QueryRow(`
		INSERT INTO contractor_estimates (
			id, claim_id, uploaded_by_user_id, file_path,
			file_name, file_size_bytes, parse_status, uploaded_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id
	`,
		estimateID, claim.ID, userID, filePath,
		input.FileName, input.FileSize, models.ParseStatusPending, time.Now(),
	).Scan(&estimateID)
	if err != nil {
		return nil, fmt.Errorf("failed to create contractor estimate record: %w", err)
	}

	return &ContractorEstimateUploadURLResponse{
		UploadURL:  uploadURL,
		EstimateID: estimateID,
		FilePath:   filePath,
	}, nil
}

// ConfirmUpload returns the contractor_estimate record after the client has PUT the file.
func (s *ContractorEstimateService) ConfirmUpload(claimID, estimateID, organizationID string) (*models.ContractorEstimate, error) {
	_, err := s.claimService.GetClaim(claimID, organizationID)
	if err != nil {
		return nil, err
	}

	var estimate models.ContractorEstimate
	err = s.db.QueryRow(`
		SELECT id, claim_id, uploaded_by_user_id, file_path, file_name,
			file_size_bytes, parsed_data, parse_status, parse_error,
			uploaded_at, parsed_at
		FROM contractor_estimates
		WHERE id = $1 AND claim_id = $2
	`, estimateID, claimID).Scan(
		&estimate.ID, &estimate.ClaimID, &estimate.UploadedByUserID,
		&estimate.FilePath, &estimate.FileName, &estimate.FileSizeBytes,
		&estimate.ParsedData, &estimate.ParseStatus, &estimate.ParseError,
		&estimate.UploadedAt, &estimate.ParsedAt,
	)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("contractor estimate not found")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to confirm contractor estimate: %w", err)
	}
	return &estimate, nil
}

// GetLatestByClaimID returns the most recently uploaded contractor estimate for a claim.
// Returns nil (no error) if none exists.
func (s *ContractorEstimateService) GetLatestByClaimID(ctx context.Context, claimID, organizationID string) (*models.ContractorEstimate, error) {
	_, err := s.claimService.GetClaim(claimID, organizationID)
	if err != nil {
		return nil, err
	}

	var estimate models.ContractorEstimate
	err = s.db.QueryRowContext(ctx, `
		SELECT id, claim_id, uploaded_by_user_id, file_path, file_name,
			file_size_bytes, parsed_data, parse_status, parse_error,
			uploaded_at, parsed_at
		FROM contractor_estimates
		WHERE claim_id = $1
		ORDER BY created_at DESC
		LIMIT 1
	`, claimID).Scan(
		&estimate.ID, &estimate.ClaimID, &estimate.UploadedByUserID,
		&estimate.FilePath, &estimate.FileName, &estimate.FileSizeBytes,
		&estimate.ParsedData, &estimate.ParseStatus, &estimate.ParseError,
		&estimate.UploadedAt, &estimate.ParsedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to query contractor estimate: %w", err)
	}
	return &estimate, nil
}
