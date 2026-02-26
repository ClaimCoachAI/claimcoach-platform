package services

import (
	"archive/zip"
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"
	"unicode"

	"github.com/claimcoach/backend/internal/storage"
	"github.com/go-pdf/fpdf"
)

// LegalPackageService assembles the attorney ZIP package for LEGAL_REVIEW claims.
type LegalPackageService struct {
	db           *sql.DB
	storage      *storage.SupabaseStorage
	auditService *AuditService
}

func NewLegalPackageService(db *sql.DB, storageClient *storage.SupabaseStorage, auditService *AuditService) *LegalPackageService {
	return &LegalPackageService{
		db:           db,
		storage:      storageClient,
		auditService: auditService,
	}
}

// legalClaimData holds all the structured data needed to generate the package.
type legalClaimData struct {
	ClaimNumber   string
	LossType      string
	IncidentDate  time.Time
	PropertyAddr  string
	OwnerEntity   string
	CarrierName   string
	PolicyNumber  string
	PolicyPDFPath *string // storage path, may be nil
	PMBrain       *PMBrainAnalysis
}

// GenerateLegalPackage builds the complete ZIP bundle and returns its bytes and filename.
func (s *LegalPackageService) GenerateLegalPackage(ctx context.Context, claimID, orgID string) ([]byte, string, error) {
	// 1. Load claim + property + policy data
	data, err := s.loadClaimData(ctx, claimID, orgID)
	if err != nil {
		return nil, "", err
	}

	// 2. Load audit report and parse PMBrainAnalysis
	report, err := s.auditService.GetAuditReportByClaimID(ctx, claimID, orgID)
	if err != nil || report == nil {
		return nil, "", fmt.Errorf("audit report required before generating legal package")
	}
	if report.PMBrainAnalysis == nil {
		return nil, "", fmt.Errorf("audit report required before generating legal package")
	}
	var pmBrain PMBrainAnalysis
	if err := json.Unmarshal([]byte(*report.PMBrainAnalysis), &pmBrain); err != nil {
		return nil, "", fmt.Errorf("failed to parse audit data: %w", err)
	}
	data.PMBrain = &pmBrain

	// 3. Generate attorney briefing PDF
	pdfBytes, err := s.generateBriefingPDF(data)
	if err != nil {
		return nil, "", fmt.Errorf("failed to generate PDF: %w", err)
	}

	// 4. Load documents from DB categorized by type
	docsByType, err := s.loadDocuments(ctx, claimID)
	if err != nil {
		return nil, "", fmt.Errorf("failed to load documents: %w", err)
	}

	// 5. Load carrier estimates (separate table)
	carrierEstimates, err := s.loadCarrierEstimates(ctx, claimID)
	if err != nil {
		// Non-fatal: log and continue
		log.Printf("Warning: failed to load carrier estimates for claim %s: %v", claimID, err)
		carrierEstimates = nil
	}

	// 6. Assemble and return ZIP
	zipBytes, err := s.assembleZIP(pdfBytes, data, docsByType, carrierEstimates)
	if err != nil {
		return nil, "", fmt.Errorf("failed to assemble ZIP: %w", err)
	}

	// Build a clean filename
	safeClaimNum := strings.NewReplacer("/", "-", " ", "-", "\\", "-").Replace(data.ClaimNumber)
	if safeClaimNum == "" {
		safeClaimNum = claimID[:8]
	}
	filename := fmt.Sprintf("ClaimCoach-Legal-Package-%s-%s.zip", safeClaimNum, time.Now().Format("2006-01-02"))

	return zipBytes, filename, nil
}

// loadClaimData fetches claim + property + policy in one query.
func (s *LegalPackageService) loadClaimData(ctx context.Context, claimID, orgID string) (*legalClaimData, error) {
	query := `
		SELECT
			c.claim_number,
			c.loss_type,
			c.incident_date,
			p.legal_address,
			COALESCE(p.owner_entity_name, ''),
			COALESCE(pol.carrier_name, ''),
			COALESCE(pol.policy_number, ''),
			pol.policy_pdf_url
		FROM claims c
		INNER JOIN properties p ON c.property_id = p.id
		LEFT JOIN insurance_policies pol ON pol.property_id = p.id
		WHERE c.id = $1 AND p.organization_id = $2
	`

	var d legalClaimData
	var policyPDFPath sql.NullString
	var policyNumber sql.NullString

	err := s.db.QueryRowContext(ctx, query, claimID, orgID).Scan(
		&d.ClaimNumber,
		&d.LossType,
		&d.IncidentDate,
		&d.PropertyAddr,
		&d.OwnerEntity,
		&d.CarrierName,
		&policyNumber,
		&policyPDFPath,
	)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("claim not found")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to load claim data: %w", err)
	}

	if policyNumber.Valid {
		d.PolicyNumber = policyNumber.String
	}
	if policyPDFPath.Valid && policyPDFPath.String != "" {
		d.PolicyPDFPath = &policyPDFPath.String
	}

	return &d, nil
}

// loadDocuments fetches all confirmed documents for the claim grouped by type.
func (s *LegalPackageService) loadDocuments(ctx context.Context, claimID string) (map[string][]docEntry, error) {
	query := `
		SELECT document_type, file_url, file_name
		FROM documents
		WHERE claim_id = $1 AND status = 'confirmed'
		ORDER BY document_type, created_at ASC
	`
	rows, err := s.db.QueryContext(ctx, query, claimID)
	if err != nil {
		return nil, fmt.Errorf("failed to query documents: %w", err)
	}
	defer rows.Close()

	result := make(map[string][]docEntry)
	for rows.Next() {
		var docType, fileURL, fileName string
		if err := rows.Scan(&docType, &fileURL, &fileName); err != nil {
			continue
		}
		result[docType] = append(result[docType], docEntry{fileURL: fileURL, fileName: fileName})
	}
	return result, rows.Err()
}

type docEntry struct {
	fileURL  string
	fileName string
}

// loadCarrierEstimates fetches carrier estimates from the separate carrier_estimates table.
// Note: carrier_estimates has no status column — all records are valid uploads.
func (s *LegalPackageService) loadCarrierEstimates(ctx context.Context, claimID string) ([]docEntry, error) {
	query := `
		SELECT file_path, file_name
		FROM carrier_estimates
		WHERE claim_id = $1
		ORDER BY uploaded_at ASC
	`
	rows, err := s.db.QueryContext(ctx, query, claimID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var entries []docEntry
	for rows.Next() {
		var filePath, fileName string
		if err := rows.Scan(&filePath, &fileName); err != nil {
			continue
		}
		entries = append(entries, docEntry{fileURL: filePath, fileName: fileName})
	}
	return entries, rows.Err()
}

// fetchFile downloads a file from Supabase Storage and returns its bytes.
// Returns nil bytes (not an error) if the file can't be fetched, so the ZIP
// continues building with remaining files.
func (s *LegalPackageService) fetchFile(filePath string) []byte {
	signedURL, err := s.storage.GenerateDownloadURL(filePath)
	if err != nil {
		log.Printf("Warning: could not generate download URL for %s: %v", filePath, err)
		return nil
	}

	resp, err := http.Get(signedURL) //nolint:noctx
	if err != nil {
		log.Printf("Warning: could not download %s: %v", filePath, err)
		return nil
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		log.Printf("Warning: download returned %d for %s", resp.StatusCode, filePath)
		return nil
	}

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		log.Printf("Warning: could not read response body for %s: %v", filePath, err)
		return nil
	}
	return data
}

// addFilesToZIP fetches and writes a slice of docEntries into the given ZIP folder.
// Returns the number of files successfully added.
func (s *LegalPackageService) addFilesToZIP(w *zip.Writer, folder string, entries []docEntry) int {
	added := 0
	for _, e := range entries {
		fileBytes := s.fetchFile(e.fileURL)
		if fileBytes == nil {
			continue
		}
		zipPath := folder + sanitizeFilename(e.fileName)
		fw, err := w.Create(zipPath)
		if err != nil {
			log.Printf("Warning: could not create ZIP entry %s: %v", zipPath, err)
			continue
		}
		if _, err := fw.Write(fileBytes); err != nil {
			log.Printf("Warning: could not write ZIP entry %s: %v", zipPath, err)
			continue
		}
		added++
	}
	return added
}

// assembleZIP builds the final ZIP in memory from PDF + all document categories.
func (s *LegalPackageService) assembleZIP(
	pdfBytes []byte,
	data *legalClaimData,
	docsByType map[string][]docEntry,
	carrierEstimates []docEntry,
) ([]byte, error) {
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)

	// 1-Legal-Brief/ — always present
	fw, err := zw.Create("1-Legal-Brief/Attorney-Briefing.pdf")
	if err != nil {
		return nil, fmt.Errorf("could not create legal brief ZIP entry: %w", err)
	}
	if _, err := fw.Write(pdfBytes); err != nil {
		return nil, fmt.Errorf("could not write legal brief to ZIP: %w", err)
	}

	// 2-Carrier-Documents/
	var carrierDocs []docEntry
	carrierDocs = append(carrierDocs, carrierEstimates...)
	carrierDocs = append(carrierDocs, docsByType["carrier_estimate"]...)
	s.addFilesToZIP(zw, "2-Carrier-Documents/", carrierDocs)

	// 3-ClaimCoach-Documents/
	s.addFilesToZIP(zw, "3-ClaimCoach-Documents/", docsByType["contractor_estimate"])
	s.addFilesToZIP(zw, "3-ClaimCoach-Documents/photos/", docsByType["contractor_photo"])

	// 4-Policy-Documents/
	var policyDocs []docEntry
	if data.PolicyPDFPath != nil {
		policyDocs = append(policyDocs, docEntry{fileURL: *data.PolicyPDFPath, fileName: "Policy.pdf"})
	}
	policyDocs = append(policyDocs, docsByType["policy_pdf"]...)
	s.addFilesToZIP(zw, "4-Policy-Documents/", policyDocs)

	// 5-Additional-Evidence/
	var evidenceDocs []docEntry
	evidenceDocs = append(evidenceDocs, docsByType["proof_of_repair"]...)
	evidenceDocs = append(evidenceDocs, docsByType["other"]...)
	s.addFilesToZIP(zw, "5-Additional-Evidence/", evidenceDocs)

	if err := zw.Close(); err != nil {
		return nil, fmt.Errorf("failed to finalise ZIP: %w", err)
	}
	return buf.Bytes(), nil
}

// generateBriefingPDF produces the attorney one-pager as a PDF using fpdf.
func (s *LegalPackageService) generateBriefingPDF(data *legalClaimData) ([]byte, error) {
	pdf := fpdf.New("P", "mm", "A4", "")
	pdf.SetMargins(15, 15, 15)
	pdf.AddPage()

	pageW := 180.0 // 210 - 15*2

	formatCurrency := func(v float64) string {
		return fmt.Sprintf("$%.2f", v)
	}

	// ── Header ───────────────────────────────────────────────────────────────
	pdf.SetFont("Helvetica", "B", 16)
	pdf.SetTextColor(15, 23, 42) // slate-900
	pdf.CellFormat(pageW, 10, "LEGAL REFERRAL ONE-PAGER", "", 1, "C", false, 0, "")
	pdf.SetFont("Helvetica", "", 9)
	pdf.SetTextColor(100, 116, 139)
	pdf.CellFormat(pageW, 6, "Prepared by ClaimCoach AI  |  "+time.Now().Format("January 2, 2006"), "", 1, "C", false, 0, "")
	pdf.Ln(4)

	hr := strings.Repeat("-", 80)
	pdf.SetFont("Courier", "", 8)
	pdf.SetTextColor(148, 163, 184)
	pdf.CellFormat(pageW, 4, hr, "", 1, "L", false, 0, "")
	pdf.Ln(3)

	// helper: section header
	sectionHeader := func(title string) {
		pdf.SetFont("Helvetica", "B", 11)
		pdf.SetTextColor(15, 23, 42)
		pdf.CellFormat(pageW, 7, title, "", 1, "L", false, 0, "")
	}

	// helper: key-value row
	kv := func(key, val string) {
		pdf.SetFont("Helvetica", "B", 9)
		pdf.SetTextColor(71, 85, 105)
		pdf.CellFormat(55, 6, key, "", 0, "L", false, 0, "")
		pdf.SetFont("Helvetica", "", 9)
		pdf.SetTextColor(15, 23, 42)
		pdf.CellFormat(pageW-55, 6, latin1Safe(val), "", 1, "L", false, 0, "")
	}

	// helper: body paragraph
	body := func(text string) {
		pdf.SetFont("Helvetica", "", 9)
		pdf.SetTextColor(30, 41, 59)
		pdf.MultiCell(pageW, 5, latin1Safe(text), "", "L", false)
	}

	lossTypeRaw := strings.ToLower(data.LossType)
	lossTypeDisplay := lossTypeRaw
	if len(lossTypeRaw) > 0 {
		lossTypeDisplay = strings.ToUpper(lossTypeRaw[:1]) + lossTypeRaw[1:]
	}

	// ── Section 1: Claim Snapshot ─────────────────────────────────────────────
	sectionHeader("1. CLAIM SNAPSHOT")
	kv("Claim ID:", data.ClaimNumber)
	kv("Property:", data.PropertyAddr)
	kv("Loss Type:", lossTypeDisplay)
	kv("Loss Date:", data.IncidentDate.Format("January 2, 2006"))
	kv("Carrier:", data.CarrierName)
	kv("Policy Number:", data.PolicyNumber)
	pdf.Ln(4)

	pmb := data.PMBrain

	// ── Section 2: Executive Summary ─────────────────────────────────────────
	sectionHeader("2. EXECUTIVE SUMMARY")
	topReasons := ""
	if len(pmb.TopDeltaDrivers) > 0 {
		items := make([]string, 0, 2)
		for i, d := range pmb.TopDeltaDrivers {
			if i >= 2 {
				break
			}
			items = append(items, d.LineItem)
		}
		topReasons = strings.Join(items, " and ")
	}
	execSummary := fmt.Sprintf("Carrier underpaid by %s", formatCurrency(pmb.TotalDelta))
	if topReasons != "" {
		execSummary += fmt.Sprintf(", citing discrepancies in %s", topReasons)
	}
	if len(pmb.CoverageDisputes) > 0 {
		execSummary += fmt.Sprintf(", with %d item(s) disputed or denied", len(pmb.CoverageDisputes))
	}
	execSummary += ". Property owner has authorized engagement of legal counsel to pursue recovery of covered damages."
	body("   " + execSummary)
	pdf.Ln(4)

	// ── Section 3: Financial Summary ─────────────────────────────────────────
	sectionHeader("3. FINANCIAL SUMMARY")
	kv("ClaimCoach Estimate (Net Position):", formatCurrency(pmb.TotalContractorEstimate))
	kv("Carrier Net Position (carrier offer):", formatCurrency(pmb.TotalCarrierEstimate))
	kv("Delta (underpayment):", formatCurrency(pmb.TotalDelta))
	pdf.Ln(4)

	// ── Section 4: Key Dispute Issues & Drivers ───────────────────────────────
	sectionHeader("4. KEY DISPUTE ISSUES & DRIVERS")
	if len(pmb.TopDeltaDrivers) > 0 {
		for i, d := range pmb.TopDeltaDrivers {
			pdf.SetFont("Helvetica", "B", 9)
			pdf.SetTextColor(15, 23, 42)
			line := fmt.Sprintf("   %d. %s", i+1, latin1Safe(d.LineItem))
			pdf.CellFormat(pageW, 6, line, "", 1, "L", false, 0, "")
			pdf.SetFont("Helvetica", "", 8)
			pdf.SetTextColor(71, 85, 105)
			impact := fmt.Sprintf("      Dollar Impact: %s (carrier %s vs. required %s)",
				formatCurrency(d.Delta), formatCurrency(d.CarrierPrice), formatCurrency(d.ContractorPrice))
			pdf.CellFormat(pageW, 5, impact, "", 1, "L", false, 0, "")
			pdf.SetFont("Helvetica", "I", 8)
			pdf.MultiCell(pageW, 5, "      Issue: "+latin1Safe(d.Reason), "", "L", false)
		}
	} else {
		body("   No individual line-item drivers identified.")
	}
	if len(pmb.CoverageDisputes) > 0 {
		pdf.Ln(2)
		pdf.SetFont("Helvetica", "B", 9)
		pdf.SetTextColor(15, 23, 42)
		pdf.CellFormat(pageW, 6, "   Coverage Disputes:", "", 1, "L", false, 0, "")
		for _, cd := range pmb.CoverageDisputes {
			pdf.SetFont("Helvetica", "", 8)
			pdf.SetTextColor(71, 85, 105)
			line := fmt.Sprintf("   * %s [%s]: %s", latin1Safe(cd.Item), strings.ToUpper(cd.Status), latin1Safe(cd.ContractorPosition))
			pdf.MultiCell(pageW, 5, line, "", "L", false)
		}
	}
	pdf.Ln(4)

	// ── Section 5: Requested Legal Outcome ───────────────────────────────────
	sectionHeader("5. REQUESTED LEGAL OUTCOME")
	body("   Primary goal: Recover full covered damages and resolve claim.")
	pdf.Ln(4)

	// ── Section 6: Attachments Index ─────────────────────────────────────────
	sectionHeader("6. ATTACHMENTS INDEX")
	pdf.SetFont("Helvetica", "", 9)
	pdf.SetTextColor(30, 41, 59)
	attachments := []string{
		"Carrier Estimate (PDF)  —  see 2-Carrier-Documents/",
		"ClaimCoach Scope Sheet  —  see 3-ClaimCoach-Documents/",
		"Contractor Photos       —  see 3-ClaimCoach-Documents/photos/",
		"Policy Declarations     —  see 4-Policy-Documents/",
		"Additional Evidence     —  see 5-Additional-Evidence/",
	}
	for _, a := range attachments {
		pdf.CellFormat(pageW, 5, "   [ ] "+a, "", 1, "L", false, 0, "")
	}

	// ── Footer ────────────────────────────────────────────────────────────────
	pdf.Ln(6)
	pdf.SetFont("Helvetica", "I", 8)
	pdf.SetTextColor(148, 163, 184)
	pdf.CellFormat(pageW, 5, "Generated by ClaimCoach AI  |  This document is confidential and prepared for legal purposes.", "", 1, "C", false, 0, "")

	if pdf.Error() != nil {
		return nil, fmt.Errorf("PDF generation error: %w", pdf.Error())
	}

	var buf bytes.Buffer
	if err := pdf.Output(&buf); err != nil {
		return nil, fmt.Errorf("PDF output error: %w", err)
	}
	return buf.Bytes(), nil
}

// latin1Safe strips or replaces characters that are outside the Latin-1 range
// used by fpdf's built-in core fonts.
func latin1Safe(s string) string {
	var b strings.Builder
	for _, r := range s {
		switch r {
		case '\u2500', '\u2501': // box-drawing dashes
			b.WriteByte('-')
		case '\u2019', '\u2018': // curly apostrophes
			b.WriteByte('\'')
		case '\u201c', '\u201d': // curly quotes
			b.WriteByte('"')
		case '\u2013': // en-dash
			b.WriteByte('-')
		case '\u2014': // em-dash
			b.WriteString("--")
		case '\u2022', '\u2023': // bullet
			b.WriteByte('*')
		default:
			if r <= unicode.MaxLatin1 {
				b.WriteRune(r)
			} else {
				b.WriteByte('?')
			}
		}
	}
	return b.String()
}

// sanitizeFilename ensures a filename is safe for use in a ZIP archive.
func sanitizeFilename(name string) string {
	name = strings.TrimSpace(name)
	if name == "" {
		return "file"
	}
	// Replace path separators
	name = strings.NewReplacer("/", "-", "\\", "-", ":", "-").Replace(name)
	return name
}

