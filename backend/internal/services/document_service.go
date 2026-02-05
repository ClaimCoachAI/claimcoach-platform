package services

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/claimcoach/backend/internal/models"
	"github.com/claimcoach/backend/internal/storage"
	"github.com/google/uuid"
)

type DocumentService struct {
	db           *sql.DB
	storage      *storage.SupabaseStorage
	claimService *ClaimService
}

func NewDocumentService(db *sql.DB, storageClient *storage.SupabaseStorage, claimService *ClaimService) *DocumentService {
	return &DocumentService{
		db:           db,
		storage:      storageClient,
		claimService: claimService,
	}
}

type RequestUploadURLInput struct {
	FileName     string `json:"file_name" binding:"required"`
	FileSize     int64  `json:"file_size" binding:"required"`
	MimeType     string `json:"mime_type" binding:"required"`
	DocumentType string `json:"document_type" binding:"required"`
}

type UploadURLResponse struct {
	UploadURL  string `json:"upload_url"`
	DocumentID string `json:"document_id"`
	FilePath   string `json:"file_path"`
}

// RequestUploadURL generates a presigned upload URL and creates a pending document record
func (s *DocumentService) RequestUploadURL(claimID string, organizationID string, userID string, input RequestUploadURLInput) (*UploadURLResponse, error) {
	// Validate document type
	if !models.IsValidDocumentType(input.DocumentType) {
		return nil, models.ErrInvalidDocumentType
	}

	// Validate file size and MIME type
	err := models.ValidateFile(input.DocumentType, input.FileSize, input.MimeType)
	if err != nil {
		return nil, err
	}

	// Verify claim ownership through claim → property → organization chain
	claim, err := s.claimService.GetClaim(claimID, organizationID)
	if err != nil {
		return nil, err
	}

	// Generate presigned upload URL
	uploadURL, filePath, err := s.storage.GenerateUploadURL(organizationID, claimID, input.DocumentType, input.FileName)
	if err != nil {
		return nil, fmt.Errorf("failed to generate upload URL: %w", err)
	}

	// Create pending document record
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
		claim.ID,
		userID,
		input.DocumentType,
		filePath,
		input.FileName,
		input.FileSize,
		input.MimeType,
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

// ConfirmUpload marks a document as confirmed and logs the activity
func (s *DocumentService) ConfirmUpload(claimID string, documentID string, organizationID string, userID string) (*models.Document, error) {
	// Verify claim ownership
	_, err := s.claimService.GetClaim(claimID, organizationID)
	if err != nil {
		return nil, err
	}

	// Update document status to confirmed
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

	// Create activity log
	metadata := map[string]interface{}{
		"document_id":   documentID,
		"document_type": doc.DocumentType,
		"file_name":     doc.FileName,
	}
	metadataJSON, _ := json.Marshal(metadata)
	metadataStr := string(metadataJSON)

	description := fmt.Sprintf("Document uploaded: %s (%s)", doc.FileName, doc.DocumentType)
	err = s.createActivity(claimID, &userID, "document_upload", description, &metadataStr)
	if err != nil {
		// Don't fail the entire operation if activity logging fails
		fmt.Printf("Warning: failed to log activity: %v\n", err)
	}

	return &doc, nil
}

// ListDocuments returns all confirmed documents for a claim
func (s *DocumentService) ListDocuments(claimID string, organizationID string) ([]models.Document, error) {
	// Verify claim ownership
	_, err := s.claimService.GetClaim(claimID, organizationID)
	if err != nil {
		return nil, err
	}

	query := `
		SELECT id, claim_id, uploaded_by_user_id, document_type, file_url,
			file_name, file_size_bytes, mime_type, metadata, status, created_at
		FROM documents
		WHERE claim_id = $1 AND status = 'confirmed'
		ORDER BY created_at DESC
	`

	rows, err := s.db.Query(query, claimID)
	if err != nil {
		return nil, fmt.Errorf("failed to list documents: %w", err)
	}
	defer rows.Close()

	documents := []models.Document{}
	for rows.Next() {
		var doc models.Document
		err := rows.Scan(
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
		if err != nil {
			return nil, fmt.Errorf("failed to scan document: %w", err)
		}
		documents = append(documents, doc)
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("failed to iterate documents: %w", err)
	}

	return documents, nil
}

// GetDocument retrieves a single document and generates a download URL
func (s *DocumentService) GetDocument(documentID string, organizationID string) (*models.Document, string, error) {
	// Query document with organization verification
	query := `
		SELECT d.id, d.claim_id, d.uploaded_by_user_id, d.document_type, d.file_url,
			d.file_name, d.file_size_bytes, d.mime_type, d.metadata, d.status, d.created_at
		FROM documents d
		INNER JOIN claims c ON d.claim_id = c.id
		INNER JOIN properties p ON c.property_id = p.id
		WHERE d.id = $1 AND p.organization_id = $2 AND d.status = 'confirmed'
	`

	var doc models.Document
	err := s.db.QueryRow(query, documentID, organizationID).Scan(
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
		return nil, "", fmt.Errorf("document not found")
	}
	if err != nil {
		return nil, "", fmt.Errorf("failed to get document: %w", err)
	}

	// Generate presigned download URL (5 min expiry)
	downloadURL, err := s.storage.GenerateDownloadURL(doc.FileURL)
	if err != nil {
		return nil, "", fmt.Errorf("failed to generate download URL: %w", err)
	}

	return &doc, downloadURL, nil
}

// createActivity is a helper function to log activities
func (s *DocumentService) createActivity(claimID string, userID *string, activityType string, description string, metadata *string) error {
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
