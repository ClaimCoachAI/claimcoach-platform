// backend/internal/services/contractor_pdf_parser_service.go
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

// ContractorPDFParserService parses contractor estimate PDFs to extract damage scope.
type ContractorPDFParserService struct {
	db          *sql.DB
	storage     StorageClient
	pdfClient   PDFParserClient
	claimGetter ClaimGetter
}

func NewContractorPDFParserService(db *sql.DB, storageClient *storage.SupabaseStorage, pdfClient PDFParserClient, claimService *ClaimService) *ContractorPDFParserService {
	return &ContractorPDFParserService{
		db:          db,
		storage:     storageClient,
		pdfClient:   pdfClient,
		claimGetter: claimService,
	}
}

// ParseContractorEstimate downloads and parses a contractor estimate PDF synchronously.
// Updates the contractor_estimates record with parse_status and parsed_data.
// Returns the parsed data on success (so the handler can return it directly to the client).
func (s *ContractorPDFParserService) ParseContractorEstimate(ctx context.Context, estimateID, organizationID string) (*models.ContractorEstimateParsedData, error) {
	estimate, err := s.getContractorEstimate(ctx, estimateID)
	if err != nil {
		return nil, fmt.Errorf("failed to get contractor estimate: %w", err)
	}

	_, err = s.claimGetter.GetClaim(estimate.ClaimID, organizationID)
	if err != nil {
		return nil, fmt.Errorf("unauthorized access to contractor estimate: %w", err)
	}

	if err := s.updateParseStatus(ctx, estimateID, models.ParseStatusProcessing, nil); err != nil {
		return nil, fmt.Errorf("failed to update status to processing: %w", err)
	}

	pdfContent, err := s.downloadPDFContent(ctx, estimate.FilePath)
	if err != nil {
		parseError := fmt.Sprintf("Failed to download PDF: %v", err)
		s.updateParseStatus(ctx, estimateID, models.ParseStatusFailed, &parseError)
		return nil, fmt.Errorf("failed to download PDF: %w", err)
	}

	parsedData, err := s.parsePDFWithClaude(ctx, pdfContent)
	if err != nil {
		parseError := fmt.Sprintf("Failed to parse PDF: %v", err)
		s.updateParseStatus(ctx, estimateID, models.ParseStatusFailed, &parseError)
		return nil, fmt.Errorf("failed to parse PDF: %w", err)
	}

	parsedDataJSON, err := json.Marshal(parsedData)
	if err != nil {
		parseError := fmt.Sprintf("Failed to marshal parsed data: %v", err)
		s.updateParseStatus(ctx, estimateID, models.ParseStatusFailed, &parseError)
		return nil, fmt.Errorf("failed to marshal parsed data: %w", err)
	}

	parsedDataStr := string(parsedDataJSON)
	if err := s.saveParsedData(ctx, estimateID, &parsedDataStr); err != nil {
		parseError := fmt.Sprintf("Failed to save parsed data: %v", err)
		s.updateParseStatus(ctx, estimateID, models.ParseStatusFailed, &parseError)
		return nil, fmt.Errorf("failed to save parsed data: %w", err)
	}

	return parsedData, nil
}

const contractorEstimateParsePrompt = `You are analyzing a contractor's property damage estimate PDF. Extract what was damaged and what repair/replacement work is proposed — NOT the prices.

The PDF may be formatted in two ways:
- Section-based (e.g., named sections like "Roofing", "Windows" with line items underneath)
- Line-item invoice (numbered rows with Product/Description/Qty/Rate/Amount columns)

In both cases, extract the vendor name, property address, and damage areas. For each area, provide:
- category: the trade or area name (e.g., Roof, Windows, Siding, Gutters, Interior)
- summary: one plain-English sentence describing the damage and proposed work
- items: the specific repair/replacement work line items

IMPORTANT: Ignore all price columns, unit costs, amounts, totals, and any financial data.

Return ONLY a JSON object with this exact structure:
{
  "vendor_name": "string",
  "property_address": "string",
  "areas": [
    {
      "category": "string",
      "summary": "string",
      "items": ["string", "string"]
    }
  ]
}

Rules:
- Group line items by trade/area — do not list each PDF line item as its own area
- items should be concise descriptions of work (e.g., "tear off and replace architectural shingles", "install drip edge")
- If vendor name or address are not found, use empty string
- Return ONLY valid JSON, no additional text or explanation`

func (s *ContractorPDFParserService) parsePDFWithClaude(ctx context.Context, pdfContent []byte) (*models.ContractorEstimateParsedData, error) {
	var responseText string
	var lastErr error
	for attempt := 1; attempt <= 3; attempt++ {
		responseText, lastErr = s.pdfClient.ParsePDF(ctx, pdfContent, contractorEstimateParsePrompt, 2000)
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

	var parsedData models.ContractorEstimateParsedData
	if err := json.Unmarshal([]byte(responseText), &parsedData); err != nil {
		return nil, fmt.Errorf("failed to parse LLM response as JSON: %w (response: %s)", err, responseText)
	}

	if len(parsedData.Areas) == 0 {
		return nil, fmt.Errorf("could not extract any damage areas from this PDF — ensure it is a contractor property damage estimate")
	}

	return &parsedData, nil
}

func (s *ContractorPDFParserService) getContractorEstimate(ctx context.Context, estimateID string) (*models.ContractorEstimate, error) {
	var estimate models.ContractorEstimate
	err := s.db.QueryRowContext(ctx, `
		SELECT id, claim_id, uploaded_by_user_id, file_path, file_name,
			file_size_bytes, parsed_data, parse_status, parse_error,
			uploaded_at, parsed_at
		FROM contractor_estimates
		WHERE id = $1
	`, estimateID).Scan(
		&estimate.ID, &estimate.ClaimID, &estimate.UploadedByUserID,
		&estimate.FilePath, &estimate.FileName, &estimate.FileSizeBytes,
		&estimate.ParsedData, &estimate.ParseStatus, &estimate.ParseError,
		&estimate.UploadedAt, &estimate.ParsedAt,
	)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("contractor estimate not found")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to query contractor estimate: %w", err)
	}
	return &estimate, nil
}

func (s *ContractorPDFParserService) updateParseStatus(ctx context.Context, estimateID, status string, errorMsg *string) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE contractor_estimates SET parse_status = $1, parse_error = $2, updated_at = $3
		WHERE id = $4
	`, status, errorMsg, time.Now(), estimateID)
	return err
}

func (s *ContractorPDFParserService) saveParsedData(ctx context.Context, estimateID string, parsedData *string) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE contractor_estimates
		SET parsed_data = $1, parse_status = $2, parse_error = NULL,
		    parsed_at = $3, updated_at = $3
		WHERE id = $4
	`, parsedData, models.ParseStatusCompleted, time.Now(), estimateID)
	return err
}

func (s *ContractorPDFParserService) downloadPDFContent(ctx context.Context, filePath string) ([]byte, error) {
	downloadURL, err := s.storage.GenerateDownloadURL(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to generate download URL: %w", err)
	}
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
	return io.ReadAll(resp.Body)
}
