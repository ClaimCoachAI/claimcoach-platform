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

	"github.com/claimcoach/backend/internal/llm"
	"github.com/claimcoach/backend/internal/models"
	"github.com/claimcoach/backend/internal/storage"
	"github.com/ledongthuc/pdf"
)

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
	llmClient   LLMClient
	claimGetter ClaimGetter
}

// NewPDFParserService creates a new PDF parser service
func NewPDFParserService(db *sql.DB, storageClient *storage.SupabaseStorage, llmClient *llm.PerplexityClient, claimService *ClaimService) *PDFParserService {
	return &PDFParserService{
		db:          db,
		storage:     storageClient,
		llmClient:   llmClient,
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
	LineItems []LineItem `json:"line_items"`
	Total     float64    `json:"total"`
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

	// Extract text from PDF
	extractedText, err := s.extractTextFromPDF(pdfContent)
	if err != nil {
		parseError := fmt.Sprintf("Failed to extract text from PDF: %v", err)
		s.updateParseStatus(ctx, carrierEstimateID, models.ParseStatusFailed, &parseError)
		return fmt.Errorf("failed to extract text from PDF: %w", err)
	}

	// Use LLM to structure the data
	parsedData, err := s.structureDataWithLLM(ctx, extractedText)
	if err != nil {
		parseError := fmt.Sprintf("Failed to structure data with LLM: %v", err)
		s.updateParseStatus(ctx, carrierEstimateID, models.ParseStatusFailed, &parseError)
		return fmt.Errorf("failed to structure data with LLM: %w", err)
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

// extractTextFromPDF extracts all text content from a PDF
func (s *PDFParserService) extractTextFromPDF(pdfContent []byte) (string, error) {
	// Create a bytes.Reader which implements io.ReaderAt
	reader, err := pdf.NewReader(strings.NewReader(string(pdfContent)), int64(len(pdfContent)))
	if err != nil {
		return "", fmt.Errorf("failed to create PDF reader: %w", err)
	}

	var textBuilder strings.Builder
	numPages := reader.NumPage()

	// Extract text from each page
	for pageNum := 1; pageNum <= numPages; pageNum++ {
		page := reader.Page(pageNum)
		if page.V.IsNull() {
			continue
		}

		// Get text content from page
		text, err := page.GetPlainText(nil)
		if err != nil {
			// Log error but continue with other pages
			continue
		}

		textBuilder.WriteString(text)
		textBuilder.WriteString("\n\n")
	}

	extractedText := textBuilder.String()
	if len(strings.TrimSpace(extractedText)) == 0 {
		return "", fmt.Errorf("no text content found in PDF")
	}

	return extractedText, nil
}

// structureDataWithLLM uses the LLM to extract structured line items from text
func (s *PDFParserService) structureDataWithLLM(ctx context.Context, extractedText string) (*ParsedEstimateData, error) {
	// Construct prompt for LLM
	systemPrompt := `You are a data extraction assistant. Your task is to extract line items from a carrier estimate document.

Extract the following information for each line item:
- description: Description of the work or item
- quantity: Numeric quantity
- unit: Unit of measurement (e.g., SF, LF, EA)
- unit_cost: Cost per unit
- total: Total cost for the line item
- category: Category of work (e.g., Roofing, Siding, Exterior, Interior, etc.)

Return a JSON object with this exact structure:
{
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
  "total": number
}

Important:
- Extract ALL line items, not just summaries
- Use 0 for missing numeric values
- Use empty string for missing text values
- Calculate the total by summing all line item totals
- Return ONLY valid JSON, no additional text or explanation`

	userPrompt := fmt.Sprintf("Extract line items from this carrier estimate:\n\n%s", extractedText)

	messages := []llm.Message{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: userPrompt},
	}

	// Call LLM with low temperature for consistency
	response, err := s.llmClient.Chat(ctx, messages, 0.1, 4000)
	if err != nil {
		return nil, fmt.Errorf("LLM request failed: %w", err)
	}

	if len(response.Choices) == 0 {
		return nil, fmt.Errorf("no response from LLM")
	}

	// Parse JSON response
	responseContent := response.Choices[0].Message.Content

	// Try to extract JSON if there's extra text
	jsonStart := strings.Index(responseContent, "{")
	jsonEnd := strings.LastIndex(responseContent, "}")
	if jsonStart >= 0 && jsonEnd > jsonStart {
		responseContent = responseContent[jsonStart : jsonEnd+1]
	}

	var parsedData ParsedEstimateData
	if err := json.Unmarshal([]byte(responseContent), &parsedData); err != nil {
		return nil, fmt.Errorf("failed to parse LLM response as JSON: %w (response: %s)", err, responseContent)
	}

	// Validate that we got some data
	if len(parsedData.LineItems) == 0 {
		return nil, fmt.Errorf("no line items extracted from document")
	}

	return &parsedData, nil
}
