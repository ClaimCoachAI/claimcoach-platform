package services

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/claimcoach/backend/internal/models"
	"github.com/go-pdf/fpdf"
	"github.com/google/uuid"
)

type fileUploader interface {
	UploadFile(filePath string, data []byte, mimeType string) error
}

type estimateLineItem struct {
	XactimateCode string  `json:"xactimate_code"`
	Description   string  `json:"description"`
	Quantity      float64 `json:"quantity"`
	Unit          string  `json:"unit"`
	UnitCost      float64 `json:"unit_cost"`
	Total         float64 `json:"total"`
	Category      string  `json:"category"`
	Justification string  `json:"justification"`
}

type estimateReport struct {
	LineItems      []estimateLineItem `json:"line_items"`
	Subtotal       float64            `json:"subtotal"`
	OverheadProfit float64            `json:"overhead_profit"`
	Total          float64            `json:"total"`
}

type PDFReportService struct {
	db       *sql.DB
	uploader fileUploader
}

func NewPDFReportService(db *sql.DB, uploader fileUploader) *PDFReportService {
	return &PDFReportService{db: db, uploader: uploader}
}

func (s *PDFReportService) GenerateAndStore(
	ctx context.Context,
	claimID, orgID, userID, reportID, estimateJSON, propertyAddress string,
) error {
	report, err := parseEstimateJSON(estimateJSON)
	if err != nil {
		return err
	}

	pdfBytes, err := renderPDF(report, claimID, propertyAddress)
	if err != nil {
		return fmt.Errorf("failed to render PDF: %w", err)
	}

	filePath := fmt.Sprintf("organizations/%s/claims/%s/audit_report/claimcoach-estimate_%s.pdf",
		orgID, claimID, shortID(reportID))

	mimeType := "application/pdf"
	if err := s.uploader.UploadFile(filePath, pdfBytes, mimeType); err != nil {
		return fmt.Errorf("failed to upload PDF: %w", err)
	}

	return s.insertDocumentRecord(ctx, claimID, userID, filePath, int64(len(pdfBytes)))
}

func parseEstimateJSON(raw string) (*estimateReport, error) {
	var report estimateReport
	if err := json.Unmarshal([]byte(raw), &report); err != nil {
		return nil, fmt.Errorf("failed to parse estimate JSON: %w", err)
	}
	return &report, nil
}

func renderPDF(report *estimateReport, claimID, propertyAddress string) ([]byte, error) {
	pdf := fpdf.New("P", "mm", "A4", "")
	pdf.SetMargins(15, 15, 15)
	pdf.AddPage()

	pageW, _ := pdf.GetPageSize()
	contentW := pageW - 30

	pdf.SetFont("Arial", "B", 18)
	pdf.SetTextColor(15, 52, 96)
	pdf.CellFormat(contentW, 10, "ClaimCoach Estimate Report", "", 1, "L", false, 0, "")

	pdf.SetFont("Arial", "", 10)
	pdf.SetTextColor(80, 80, 80)
	if propertyAddress != "" {
		pdf.CellFormat(contentW, 6, propertyAddress, "", 1, "L", false, 0, "")
	}
	pdf.CellFormat(contentW/2, 6, fmt.Sprintf("Claim ID: %s", shortID(claimID)), "", 0, "L", false, 0, "")
	pdf.CellFormat(contentW/2, 6, fmt.Sprintf("Generated: %s", time.Now().Format("January 2, 2006")), "", 1, "R", false, 0, "")
	pdf.Ln(6)

	colWidths := [6]float64{28, 62, 14, 14, 22, 22}
	headers := [6]string{"Code", "Description", "Qty", "Unit", "Unit Cost", "Total"}

	pdf.SetFillColor(230, 245, 245)
	pdf.SetFont("Arial", "B", 9)
	pdf.SetTextColor(15, 52, 96)
	for i, h := range headers {
		pdf.CellFormat(colWidths[i], 7, h, "1", 0, "C", true, 0, "")
	}
	pdf.Ln(-1)

	categoryOrder := []string{}
	byCategory := map[string][]estimateLineItem{}
	for _, item := range report.LineItems {
		if _, exists := byCategory[item.Category]; !exists {
			categoryOrder = append(categoryOrder, item.Category)
		}
		byCategory[item.Category] = append(byCategory[item.Category], item)
	}

	for _, cat := range categoryOrder {
		pdf.SetFillColor(240, 240, 240)
		pdf.SetFont("Arial", "B", 9)
		pdf.SetTextColor(60, 60, 60)
		pdf.CellFormat(contentW, 6, " "+cat, "1", 1, "L", true, 0, "")

		pdf.SetFont("Arial", "", 8)
		pdf.SetTextColor(30, 30, 30)
		for _, item := range byCategory[cat] {
			pdf.SetFillColor(255, 255, 255)
			pdf.CellFormat(colWidths[0], 6, item.XactimateCode, "1", 0, "C", false, 0, "")
			pdf.CellFormat(colWidths[1], 6, truncate(item.Description, 38), "1", 0, "L", false, 0, "")
			pdf.CellFormat(colWidths[2], 6, fmt.Sprintf("%.1f", item.Quantity), "1", 0, "R", false, 0, "")
			pdf.CellFormat(colWidths[3], 6, item.Unit, "1", 0, "C", false, 0, "")
			pdf.CellFormat(colWidths[4], 6, fmt.Sprintf("$%.2f", item.UnitCost), "1", 0, "R", false, 0, "")
			pdf.CellFormat(colWidths[5], 6, fmt.Sprintf("$%.2f", item.Total), "1", 1, "R", false, 0, "")

			if item.Justification != "" {
				pdf.SetFont("Arial", "I", 7)
				pdf.SetTextColor(100, 100, 100)
				pdf.CellFormat(colWidths[0], 5, "", "", 0, "", false, 0, "")
				pdf.MultiCell(contentW-colWidths[0], 5, truncate(item.Justification, 120), "", "L", false)
				pdf.SetFont("Arial", "", 8)
				pdf.SetTextColor(30, 30, 30)
			}
		}
	}

	pdf.Ln(4)
	summaryX := pageW - 15 - 80
	pdf.SetFont("Arial", "", 9)
	pdf.SetTextColor(60, 60, 60)

	printRow := func(label string, amount float64, bold bool) {
		if bold {
			pdf.SetFont("Arial", "B", 10)
			pdf.SetTextColor(15, 52, 96)
		}
		pdf.SetX(summaryX)
		pdf.CellFormat(50, 7, label, "", 0, "L", false, 0, "")
		pdf.CellFormat(30, 7, fmt.Sprintf("$%.2f", amount), "T", 1, "R", false, 0, "")
		if bold {
			pdf.SetFont("Arial", "", 9)
			pdf.SetTextColor(60, 60, 60)
		}
	}

	printRow("Subtotal", report.Subtotal, false)
	printRow("Overhead & Profit (20%)", report.OverheadProfit, false)
	printRow("Grand Total", report.Total, true)

	var buf bytes.Buffer
	if err := pdf.Output(&buf); err != nil {
		return nil, fmt.Errorf("fpdf output failed: %w", err)
	}
	return buf.Bytes(), nil
}

func (s *PDFReportService) insertDocumentRecord(ctx context.Context, claimID, userID, filePath string, fileSize int64) error {
	query := `
		INSERT INTO documents (
			id, claim_id, uploaded_by_user_id, document_type, file_url,
			file_name, file_size_bytes, mime_type, status, created_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
	`
	_, err := s.db.ExecContext(ctx, query,
		uuid.New().String(), claimID, userID,
		models.DocumentTypeAuditReport, filePath,
		"ClaimCoach Estimate Report.pdf", fileSize,
		"application/pdf", "confirmed", time.Now(),
	)
	if err != nil {
		return fmt.Errorf("failed to insert document record: %w", err)
	}
	return nil
}

func shortID(id string) string {
	if len(id) < 8 {
		return id
	}
	return id[:8]
}

func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen-1] + "…"
}
