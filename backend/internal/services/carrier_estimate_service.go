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

type CarrierEstimateService struct {
	db           *sql.DB
	storage      *storage.SupabaseStorage
	claimService *ClaimService
}

func NewCarrierEstimateService(db *sql.DB, storageClient *storage.SupabaseStorage, claimService *ClaimService) *CarrierEstimateService {
	return &CarrierEstimateService{
		db:           db,
		storage:      storageClient,
		claimService: claimService,
	}
}

type RequestCarrierEstimateUploadURLInput struct {
	FileName string `json:"file_name" binding:"required"`
	FileSize int64  `json:"file_size" binding:"required"`
	MimeType string `json:"mime_type" binding:"required"`
}

type CarrierEstimateUploadURLResponse struct {
	UploadURL  string `json:"upload_url"`
	EstimateID string `json:"estimate_id"`
	FilePath   string `json:"file_path"`
}

// RequestUploadURL generates a presigned upload URL for carrier estimate
func (s *CarrierEstimateService) RequestUploadURL(claimID string, organizationID string, userID string, input RequestCarrierEstimateUploadURLInput) (*CarrierEstimateUploadURLResponse, error) {
	// Validate file size (max 10MB for PDFs)
	const maxFileSize = 10 * 1024 * 1024 // 10MB
	if input.FileSize > maxFileSize {
		return nil, fmt.Errorf("file size exceeds maximum allowed (10MB)")
	}

	// Validate MIME type (PDF only)
	if input.MimeType != "application/pdf" {
		return nil, fmt.Errorf("only PDF files are allowed for carrier estimates")
	}

	// Verify claim ownership through claim → property → organization chain
	claim, err := s.claimService.GetClaim(claimID, organizationID)
	if err != nil {
		return nil, err
	}

	// Generate presigned upload URL with carrier-estimate document type
	uploadURL, filePath, err := s.storage.GenerateUploadURL(organizationID, claimID, "carrier-estimate", input.FileName)
	if err != nil {
		return nil, fmt.Errorf("failed to generate upload URL: %w", err)
	}

	// Create pending carrier estimate record
	estimateID := uuid.New().String()
	query := `
		INSERT INTO carrier_estimates (
			id, claim_id, uploaded_by_user_id, file_path,
			file_name, file_size_bytes, parse_status, uploaded_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id
	`

	err = s.db.QueryRow(
		query,
		estimateID,
		claim.ID,
		userID,
		filePath,
		input.FileName,
		input.FileSize,
		models.ParseStatusPending,
		time.Now(),
	).Scan(&estimateID)

	if err != nil {
		return nil, fmt.Errorf("failed to create carrier estimate record: %w", err)
	}

	return &CarrierEstimateUploadURLResponse{
		UploadURL:  uploadURL,
		EstimateID: estimateID,
		FilePath:   filePath,
	}, nil
}

// ConfirmUpload marks a carrier estimate as confirmed after successful upload
func (s *CarrierEstimateService) ConfirmUpload(claimID string, estimateID string, organizationID string) (*models.CarrierEstimate, error) {
	// Verify claim ownership
	_, err := s.claimService.GetClaim(claimID, organizationID)
	if err != nil {
		return nil, err
	}

	// Query the carrier estimate to return
	query := `
		SELECT id, claim_id, uploaded_by_user_id, file_path, file_name,
			file_size_bytes, parsed_data, parse_status, parse_error,
			uploaded_at, parsed_at
		FROM carrier_estimates
		WHERE id = $1 AND claim_id = $2
	`

	var estimate models.CarrierEstimate
	err = s.db.QueryRow(query, estimateID, claimID).Scan(
		&estimate.ID,
		&estimate.ClaimID,
		&estimate.UploadedByUserID,
		&estimate.FilePath,
		&estimate.FileName,
		&estimate.FileSizeBytes,
		&estimate.ParsedData,
		&estimate.ParseStatus,
		&estimate.ParseError,
		&estimate.UploadedAt,
		&estimate.ParsedAt,
	)

	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("carrier estimate not found")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to confirm carrier estimate: %w", err)
	}

	return &estimate, nil
}

// GetCarrierEstimatesByClaimID retrieves all carrier estimates for a claim with organization verification
func (s *CarrierEstimateService) GetCarrierEstimatesByClaimID(ctx context.Context, claimID string, organizationID string) ([]models.CarrierEstimate, error) {
	// Verify claim ownership
	_, err := s.claimService.GetClaim(claimID, organizationID)
	if err != nil {
		return nil, err
	}

	query := `
		SELECT id, claim_id, uploaded_by_user_id, file_path, file_name,
			file_size_bytes, parsed_data, parse_status, parse_error,
			uploaded_at, parsed_at
		FROM carrier_estimates
		WHERE claim_id = $1
		ORDER BY uploaded_at DESC
	`

	rows, err := s.db.QueryContext(ctx, query, claimID)
	if err != nil {
		return nil, fmt.Errorf("failed to query carrier estimates: %w", err)
	}
	defer rows.Close()

	estimates := []models.CarrierEstimate{}
	for rows.Next() {
		var estimate models.CarrierEstimate
		err := rows.Scan(
			&estimate.ID,
			&estimate.ClaimID,
			&estimate.UploadedByUserID,
			&estimate.FilePath,
			&estimate.FileName,
			&estimate.FileSizeBytes,
			&estimate.ParsedData,
			&estimate.ParseStatus,
			&estimate.ParseError,
			&estimate.UploadedAt,
			&estimate.ParsedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan carrier estimate: %w", err)
		}
		estimates = append(estimates, estimate)
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("failed to iterate carrier estimates: %w", err)
	}

	return estimates, nil
}

// CreateCarrierEstimate creates a new carrier estimate record
func (s *CarrierEstimateService) CreateCarrierEstimate(ctx context.Context, claimID string, uploadedByUserID string, filePath string, fileName string, fileSize int64) (*models.CarrierEstimate, error) {
	estimateID := uuid.New().String()
	query := `
		INSERT INTO carrier_estimates (
			id, claim_id, uploaded_by_user_id, file_path,
			file_name, file_size_bytes, parse_status, uploaded_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id, claim_id, uploaded_by_user_id, file_path, file_name,
			file_size_bytes, parse_status, uploaded_at
	`

	var estimate models.CarrierEstimate
	err := s.db.QueryRowContext(
		ctx,
		query,
		estimateID,
		claimID,
		uploadedByUserID,
		filePath,
		fileName,
		fileSize,
		models.ParseStatusPending,
		time.Now(),
	).Scan(
		&estimate.ID,
		&estimate.ClaimID,
		&estimate.UploadedByUserID,
		&estimate.FilePath,
		&estimate.FileName,
		&estimate.FileSizeBytes,
		&estimate.ParseStatus,
		&estimate.UploadedAt,
	)

	if err != nil {
		return nil, fmt.Errorf("failed to create carrier estimate: %w", err)
	}

	return &estimate, nil
}
