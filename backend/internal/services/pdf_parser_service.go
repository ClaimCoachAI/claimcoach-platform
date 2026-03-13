package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/claimcoach/backend/internal/models"
	"github.com/claimcoach/backend/internal/storage"
)

// PDFParserClient defines the interface for parsing PDFs with an LLM
type PDFParserClient interface {
	ParsePDF(ctx context.Context, pdfContent []byte, prompt string, maxTokens int) (string, error)
}

// StorageClient interface for storage operations
type StorageClient interface {
	GenerateDownloadURL(filePath string) (string, error)
}

// ClaimGetter interface for claim verification
type ClaimGetter interface {
	GetClaim(claimID, organizationID string) (*models.Claim, error)
}

// PDFParserService handles parsing of carrier estimate PDFs
type PDFParserService struct {
	db          *sql.DB
	storage     StorageClient
	pdfClient   PDFParserClient
	claimGetter ClaimGetter
}

// NewPDFParserService creates a new PDF parser service
func NewPDFParserService(db *sql.DB, storageClient *storage.SupabaseStorage, pdfClient PDFParserClient, claimService *ClaimService) *PDFParserService {
	return &PDFParserService{
		db:          db,
		storage:     storageClient,
		pdfClient:   pdfClient,
		claimGetter: claimService,
	}
}

// LineItem represents a parsed line item from the carrier estimate
type LineItem struct {
	Description string  `json:"description"`
	Quantity    float64 `json:"quantity"`
	Unit        string  `json:"unit"`
	UnitCost    float64 `json:"unit_cost"`
	Total       float64 `json:"total"`
	Category    string  `json:"category"`
}

// ParsedEstimateData represents the structured data extracted from a PDF
type ParsedEstimateData struct {
	DocumentType string     `json:"document_type"`
	LineItems    []LineItem `json:"line_items"`
	Total        float64    `json:"total"`
	Notes        string     `json:"notes,omitempty"`
}

// ParseCarrierEstimate downloads and parses a carrier estimate PDF
func (s *PDFParserService) ParseCarrierEstimate(ctx context.Context, carrierEstimateID string, organizationID string) error {
	// Get the carrier estimate record
	estimate, err := s.getCarrierEstimate(ctx, carrierEstimateID)
	if err != nil {
		return fmt.Errorf("failed to get carrier estimate: %w", err)
	}

	// Verify organization access through claim
	_, err = s.claimGetter.GetClaim(estimate.ClaimID, organizationID)
	if err != nil {
		return fmt.Errorf("unauthorized access to carrier estimate: %w", err)
	}

	// Update status to processing
	if err := s.updateParseStatus(ctx, carrierEstimateID, models.ParseStatusProcessing, nil); err != nil {
		return fmt.Errorf("failed to update status to processing: %w", err)
	}

	// Download PDF from Supabase storage
	pdfContent, err := s.downloadPDF(ctx, estimate.FilePath)
	if err != nil {
		parseError := fmt.Sprintf("Failed to download PDF: %v", err)
		s.updateParseStatus(ctx, carrierEstimateID, models.ParseStatusFailed, &parseError)
		return fmt.Errorf("failed to download PDF: %w", err)
	}

	// Parse PDF using Claude (extract and structure in one step)
	parsedData, err := s.parsePDFWithClaude(ctx, pdfContent)
	if err != nil {
		parseError := fmt.Sprintf("Failed to parse PDF: %v", err)
		s.updateParseStatus(ctx, carrierEstimateID, models.ParseStatusFailed, &parseError)
		return fmt.Errorf("failed to parse PDF: %w", err)
	}

	// Convert parsed data to JSON string
	parsedDataJSON, err := json.Marshal(parsedData)
	if err != nil {
		parseError := fmt.Sprintf("Failed to marshal parsed data: %v", err)
		s.updateParseStatus(ctx, carrierEstimateID, models.ParseStatusFailed, &parseError)
		return fmt.Errorf("failed to marshal parsed data: %w", err)
	}

	// Update database with parsed data
	parsedDataStr := string(parsedDataJSON)
	if err := s.updateParsedData(ctx, carrierEstimateID, &parsedDataStr); err != nil {
		parseError := fmt.Sprintf("Failed to save parsed data: %v", err)
		s.updateParseStatus(ctx, carrierEstimateID, models.ParseStatusFailed, &parseError)
		return fmt.Errorf("failed to update parsed data: %w", err)
	}

	return nil
}

// parsePDFWithClaude sends the PDF directly to Claude for extraction and structuring
func (s *PDFParserService) parsePDFWithClaude(ctx context.Context, pdfContent []byte) (*ParsedEstimateData, error) {
	prompt := `You are analyzing an insurance document. It may be a carrier estimate, Explanation of Benefits (EOB), denial letter, coverage decision, or any other insurance-related document.

Extract all available information and return a JSON object with this exact structure:
{
  "document_type": "string (e.g. Carrier Estimate, Denial Letter, EOB, Coverage Decision, Partial Payment, etc.)",
  "line_items": [
    {
      "description": "string",
      "quantity": number,
      "unit": "string",
      "unit_cost": number,
      "total": number,
      "category": "string"
    }
  ],
  "total": number,
  "notes": "string (summary of key findings, denial reasons, coverage decisions, or other important details not captured in line items)"
}

Rules:
- Identify the document type and set document_type accordingly
- If line items exist (repair estimates, itemized costs, etc.): extract ALL of them into line_items
- If this is a denial letter or coverage decision: put denial reasons, policy exclusions, and any amounts referenced as line items where possible; summarize the decision in notes
- If this is an EOB: extract covered/denied amounts and benefit details as line items
- For any amounts or decisions that don't fit as line items, capture them in notes
- Use 0 for missing numeric values
- Use empty string for missing text values
- category should describe the type (e.g., Roofing, Siding, Denial, Coverage Decision, Deductible, etc.)
- Return ONLY valid JSON, no additional text or explanation`

	// Retry up to 3 times for transient LLM failures
	var responseText string
	var lastErr error
	for attempt := 1; attempt <= 3; attempt++ {
		responseText, lastErr = s.pdfClient.ParsePDF(ctx, pdfContent, prompt, 4000)
		if lastErr == nil {
			break
		}
		if attempt < 3 {
			time.Sleep(time.Duration(attempt) * 2 * time.Second)
		}
	}
	if lastErr != nil {
		return nil, fmt.Errorf("LLM request failed after 3 attempts: %w", lastErr)
	}

	// Extract JSON if there's surrounding text
	jsonStart := strings.Index(responseText, "{")
	jsonEnd := strings.LastIndex(responseText, "}")
	if jsonStart >= 0 && jsonEnd > jsonStart {
		responseText = responseText[jsonStart : jsonEnd+1]
	}

	var parsedData ParsedEstimateData
	if err := json.Unmarshal([]byte(responseText), &parsedData); err != nil {
		return nil, fmt.Errorf("failed to parse LLM response as JSON: %w (response: %s)", err, responseText)
	}

	if len(parsedData.LineItems) == 0 && parsedData.Notes == "" && parsedData.Total == 0 {
		return nil, fmt.Errorf("could not extract any information from this document — please ensure it is a valid insurance document (carrier estimate, denial letter, EOB, or coverage decision)")
	}

	return &parsedData, nil
}

// getCarrierEstimate retrieves a carrier estimate by ID
func (s *PDFParserService) getCarrierEstimate(ctx context.Context, estimateID string) (*models.CarrierEstimate, error) {
	query := `
		SELECT id, claim_id, uploaded_by_user_id, file_path, file_name,
			file_size_bytes, parsed_data, parse_status, parse_error,
			uploaded_at, parsed_at
		FROM carrier_estimates
		WHERE id = $1
	`

	var estimate models.CarrierEstimate
	err := s.db.QueryRowContext(ctx, query, estimateID).Scan(
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
		return nil, fmt.Errorf("failed to query carrier estimate: %w", err)
	}

	return &estimate, nil
}

// updateParseStatus updates the parse status and error message
func (s *PDFParserService) updateParseStatus(ctx context.Context, estimateID string, status string, errorMsg *string) error {
	query := `
		UPDATE carrier_estimates
		SET parse_status = $1, parse_error = $2
		WHERE id = $3
	`

	_, err := s.db.ExecContext(ctx, query, status, errorMsg, estimateID)
	if err != nil {
		return fmt.Errorf("failed to update parse status: %w", err)
	}

	return nil
}

// updateParsedData updates the parsed data and marks parsing as completed
func (s *PDFParserService) updateParsedData(ctx context.Context, estimateID string, parsedData *string) error {
	query := `
		UPDATE carrier_estimates
		SET parsed_data = $1,
			parse_status = $2,
			parse_error = NULL,
			parsed_at = $3
		WHERE id = $4
	`

	now := time.Now()
	_, err := s.db.ExecContext(ctx, query, parsedData, models.ParseStatusCompleted, now, estimateID)
	if err != nil {
		return fmt.Errorf("failed to update parsed data: %w", err)
	}

	return nil
}

// downloadPDF downloads a PDF from Supabase storage
func (s *PDFParserService) downloadPDF(ctx context.Context, filePath string) ([]byte, error) {
	// Generate a download URL
	downloadURL, err := s.storage.GenerateDownloadURL(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to generate download URL: %w", err)
	}

	// Download the PDF content
	req, err := http.NewRequestWithContext(ctx, "GET", downloadURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create download request: %w", err)
	}

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to download PDF: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("download failed with status: %d", resp.StatusCode)
	}

	pdfContent, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read PDF content: %w", err)
	}

	return pdfContent, nil
}
