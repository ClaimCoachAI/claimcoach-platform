package services

import (
	"archive/zip"
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"time"

	"github.com/claimcoach/backend/internal/models"
	"github.com/claimcoach/backend/internal/storage"
	"github.com/go-pdf/fpdf"
	"github.com/google/uuid"
)

// -------------------------------------------------------------------
// Internal JSON shapes matching what AuditService writes to the DB
// -------------------------------------------------------------------

type estimateLineItem struct {
	Description string  `json:"description"`
	Category    string  `json:"category"`
	Quantity    float64 `json:"quantity"`
	Unit        string  `json:"unit"`
	UnitCost    float64 `json:"unit_cost"`
	Total       float64 `json:"total"`
}

type generatedEstimate struct {
	LineItems      []estimateLineItem `json:"line_items"`
	Subtotal       float64            `json:"subtotal"`
	OverheadProfit float64            `json:"overhead_profit"`
	Total          float64            `json:"total"`
}

type discrepancyItem struct {
	Item          string  `json:"item"`
	IndustryPrice float64 `json:"industry_price"`
	CarrierPrice  float64 `json:"carrier_price"`
	Delta         float64 `json:"delta"`
	Justification string  `json:"justification"`
}

type comparisonSummary struct {
	TotalIndustry float64 `json:"total_industry"`
	TotalCarrier  float64 `json:"total_carrier"`
	TotalDelta    float64 `json:"total_delta"`
}

type comparisonData struct {
	Discrepancies []discrepancyItem `json:"discrepancies"`
	Summary       comparisonSummary `json:"summary"`
}

// photoDoc holds the fields needed from documents for ZIP assembly.
type photoDoc struct {
	ID       string
	FileURL  string
	FileName string
}

// -------------------------------------------------------------------
// Service
// -------------------------------------------------------------------

// LegalPackageService handles legal escalation initiation and the full
// approval-triggered workflow: PDF generation, ZIP assembly, email sending.
type LegalPackageService struct {
	db           *sql.DB
	emailService EmailService
	storage      *storage.SupabaseStorage
	claimService *ClaimService
	auditService *AuditService
	frontendURL  string
}

// NewLegalPackageService constructs the service.
func NewLegalPackageService(
	db *sql.DB,
	emailService EmailService,
	storageClient *storage.SupabaseStorage,
	claimService *ClaimService,
	auditService *AuditService,
	frontendURL string,
) *LegalPackageService {
	return &LegalPackageService{
		db:           db,
		emailService: emailService,
		storage:      storageClient,
		claimService: claimService,
		auditService: auditService,
		frontendURL:  frontendURL,
	}
}

// -------------------------------------------------------------------
// InitiateEscalation — called by POST /api/claims/:id/legal-escalation
// -------------------------------------------------------------------

// InitiateEscalationInput holds the PM-supplied form data.
type InitiateEscalationInput struct {
	LegalPartnerName  string `json:"legal_partner_name" binding:"required"`
	LegalPartnerEmail string `json:"legal_partner_email" binding:"required,email"`
	OwnerName         string `json:"owner_name" binding:"required"`
	OwnerEmail        string `json:"owner_email" binding:"required,email"`
}

// InitiateEscalation creates the approval request row, updates the claim,
// and sends the homeowner approval email. Returns the created request.
func (s *LegalPackageService) InitiateEscalation(
	ctx context.Context,
	claimID string,
	orgID string,
	input InitiateEscalationInput,
) (*models.LegalApprovalRequest, error) {
	// Fetch the claim to verify ownership and load property
	claim, err := s.claimService.GetClaim(claimID, orgID)
	if err != nil {
		return nil, fmt.Errorf("claim not found: %w", err)
	}

	token := uuid.New().String()
	expiresAt := time.Now().Add(7 * 24 * time.Hour) // 7 days

	req := &models.LegalApprovalRequest{
		ID:         uuid.New().String(),
		ClaimID:    claimID,
		Token:      token,
		OwnerName:  input.OwnerName,
		OwnerEmail: input.OwnerEmail,
		Status:     models.LegalApprovalStatusPending,
		ExpiresAt:  expiresAt,
		CreatedAt:  time.Now(),
	}

	// Begin transaction: insert approval request + update claim fields
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	_, err = tx.ExecContext(ctx, `
		INSERT INTO legal_approval_requests
			(id, claim_id, token, owner_name, owner_email, status, expires_at, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		req.ID, req.ClaimID, req.Token, req.OwnerName, req.OwnerEmail,
		req.Status, req.ExpiresAt, req.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("insert legal_approval_request: %w", err)
	}

	_, err = tx.ExecContext(ctx, `
		UPDATE claims SET
			legal_partner_name    = $1,
			legal_partner_email   = $2,
			owner_email           = $3,
			legal_escalation_status = 'pending_approval',
			updated_at            = NOW()
		WHERE id = $4`,
		input.LegalPartnerName, input.LegalPartnerEmail, input.OwnerEmail, claimID,
	)
	if err != nil {
		return nil, fmt.Errorf("update claim legal fields: %w", err)
	}

	if err = tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit tx: %w", err)
	}

	// Send the homeowner approval email (best-effort — DB is already committed)
	approvalURL := fmt.Sprintf("%s/legal-approval/%s", s.frontendURL, token)
	propertyAddr := ""
	if claim.Property != nil {
		propertyAddr = claim.Property.LegalAddress
	}
	emailErr := s.emailService.SendOwnerApprovalEmail(SendOwnerApprovalEmailInput{
		To:              input.OwnerEmail,
		OwnerName:       input.OwnerName,
		PropertyAddress: propertyAddr,
		ApprovalURL:     approvalURL,
		ExpiresAt:       expiresAt,
	})
	if emailErr != nil {
		// Log but do not fail — the approval request row was committed; PM can resend
		fmt.Printf("WARN: failed to send owner approval email: %v\n", emailErr)
	}

	return req, nil
}

// -------------------------------------------------------------------
// GetApprovalPageData — called by GET /api/legal-approval/:token
// -------------------------------------------------------------------

// ApprovalPageData is the JSON returned to the homeowner approval page.
type ApprovalPageData struct {
	PropertyAddress  string  `json:"property_address"`
	LossType         string  `json:"loss_type"`
	IncidentDate     string  `json:"incident_date"`
	CarrierEstimate  float64 `json:"carrier_estimate"`
	IndustryEstimate float64 `json:"industry_estimate"`
	Delta            float64 `json:"delta"`
	OwnerName        string  `json:"owner_name"`
	LegalPartnerName string  `json:"legal_partner_name"`
	Status           string  `json:"status"`
}

// GetApprovalPageData looks up the token and returns the display data.
// Returns nil if the token does not exist (caller should 404).
func (s *LegalPackageService) GetApprovalPageData(ctx context.Context, token string) (*ApprovalPageData, error) {
	var req models.LegalApprovalRequest
	err := s.db.QueryRowContext(ctx,
		`SELECT id, claim_id, owner_name, owner_email, status, expires_at
		   FROM legal_approval_requests WHERE token = $1`, token,
	).Scan(&req.ID, &req.ClaimID, &req.OwnerName, &req.OwnerEmail, &req.Status, &req.ExpiresAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("lookup token: %w", err)
	}

	// Auto-expire stale pending requests
	if req.Status == models.LegalApprovalStatusPending && time.Now().After(req.ExpiresAt) {
		_, _ = s.db.ExecContext(ctx,
			`UPDATE legal_approval_requests SET status = 'expired' WHERE id = $1`, req.ID)
		req.Status = models.LegalApprovalStatusExpired
	}

	// Fetch claim with property
	// NOTE: GetClaim requires orgID — use a raw query here since this is a public endpoint
	var lossType string
	var incidentDate time.Time
	var legalPartnerName, propertyAddr string
	var totalCarrier, totalDelta float64

	err = s.db.QueryRowContext(ctx, `
		SELECT c.loss_type, c.incident_date, COALESCE(c.legal_partner_name, ''),
		       COALESCE(p.legal_address, ''),
		       COALESCE(ar.total_carrier_estimate, 0),
		       COALESCE(ar.total_delta, 0)
		  FROM claims c
		  LEFT JOIN properties p ON p.id = c.property_id
		  LEFT JOIN audit_reports ar ON ar.claim_id = c.id AND ar.status = 'completed'
		 WHERE c.id = $1
		 ORDER BY ar.created_at DESC
		 LIMIT 1`,
		req.ClaimID,
	).Scan(&lossType, &incidentDate, &legalPartnerName, &propertyAddr, &totalCarrier, &totalDelta)
	if err != nil {
		return nil, fmt.Errorf("fetch claim data for approval page: %w", err)
	}

	industryEstimate := totalCarrier + totalDelta

	return &ApprovalPageData{
		PropertyAddress:  propertyAddr,
		LossType:         lossType,
		IncidentDate:     incidentDate.Format("2006-01-02"),
		CarrierEstimate:  totalCarrier,
		IndustryEstimate: industryEstimate,
		Delta:            totalDelta,
		OwnerName:        req.OwnerName,
		LegalPartnerName: legalPartnerName,
		Status:           req.Status,
	}, nil
}

// -------------------------------------------------------------------
// ProcessApproval — called by POST /api/legal-approval/:token/respond
// -------------------------------------------------------------------

// ProcessApprovalInput is the body for the respond endpoint.
type ProcessApprovalInput struct {
	Action string `json:"action" binding:"required"` // "approve" or "decline"
}

// ProcessApproval records the homeowner decision.
// On "approve" it generates the PDF, assembles the ZIP, and emails the lawyer.
// On "decline" it records the decision and notifies the PM.
func (s *LegalPackageService) ProcessApproval(ctx context.Context, token string, input ProcessApprovalInput) error {
	if input.Action != "approve" && input.Action != "decline" {
		return fmt.Errorf("action must be 'approve' or 'decline'")
	}

	// Step 1: Fetch and validate the approval request
	var req models.LegalApprovalRequest
	err := s.db.QueryRowContext(ctx,
		`SELECT id, claim_id, owner_name, owner_email, status, expires_at
		   FROM legal_approval_requests WHERE token = $1`, token,
	).Scan(&req.ID, &req.ClaimID, &req.OwnerName, &req.OwnerEmail, &req.Status, &req.ExpiresAt)
	if err == sql.ErrNoRows {
		return fmt.Errorf("approval request not found")
	}
	if err != nil {
		return fmt.Errorf("lookup token: %w", err)
	}

	if req.Status != models.LegalApprovalStatusPending {
		return fmt.Errorf("approval request is no longer pending (status: %s)", req.Status)
	}
	if time.Now().After(req.ExpiresAt) {
		_, _ = s.db.ExecContext(ctx,
			`UPDATE legal_approval_requests SET status = 'expired' WHERE id = $1`, req.ID)
		return fmt.Errorf("approval link has expired")
	}

	if input.Action == "decline" {
		return s.processDecline(ctx, req)
	}
	return s.processApprove(ctx, req)
}

// processDecline records a decline and updates the claim status.
func (s *LegalPackageService) processDecline(ctx context.Context, req models.LegalApprovalRequest) error {
	now := time.Now()
	_, err := s.db.ExecContext(ctx, `
		UPDATE legal_approval_requests
		   SET status = 'declined', responded_at = $1
		 WHERE id = $2`, now, req.ID)
	if err != nil {
		return fmt.Errorf("record decline: %w", err)
	}
	_, err = s.db.ExecContext(ctx, `
		UPDATE claims SET legal_escalation_status = 'declined', updated_at = NOW()
		 WHERE id = $1`, req.ClaimID)
	return err
}

// processApprove generates the PDF+ZIP and sends it to the lawyer.
func (s *LegalPackageService) processApprove(ctx context.Context, req models.LegalApprovalRequest) error {
	// Step 2: Begin transaction — mark approved immediately so double-submits are blocked
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	now := time.Now()
	_, err = tx.ExecContext(ctx, `
		UPDATE legal_approval_requests
		   SET status = 'approved', responded_at = $1
		 WHERE id = $2`, now, req.ID)
	if err != nil {
		return fmt.Errorf("mark approved: %w", err)
	}

	// Step 3: Fetch claim (with property), audit report, scope sheet, and photos
	var claim models.Claim
	var propertyAddr, lossType string
	var incidentDate time.Time
	var legalPartnerEmail, legalPartnerName, createdByUserID string

	err = tx.QueryRowContext(ctx, `
		SELECT c.id, c.loss_type, c.incident_date,
		       COALESCE(c.legal_partner_email, ''),
		       COALESCE(c.legal_partner_name, ''),
		       c.created_by_user_id,
		       COALESCE(p.legal_address, ''),
		       c.adjuster_name, c.claim_number
		  FROM claims c
		  LEFT JOIN properties p ON p.id = c.property_id
		 WHERE c.id = $1`, req.ClaimID,
	).Scan(
		&claim.ID, &lossType, &incidentDate,
		&legalPartnerEmail, &legalPartnerName, &createdByUserID,
		&propertyAddr,
		&claim.AdjusterName, &claim.ClaimNumber,
	)
	if err != nil {
		return fmt.Errorf("fetch claim: %w", err)
	}
	claim.LossType = lossType
	claim.IncidentDate = incidentDate
	claim.LegalPartnerEmail = &legalPartnerEmail
	claim.LegalPartnerName = &legalPartnerName
	claim.CreatedByUserID = createdByUserID
	claim.Property = &models.Property{LegalAddress: propertyAddr}

	// Fetch the most recent completed audit report
	var auditReport models.AuditReport
	err = tx.QueryRowContext(ctx, `
		SELECT id, generated_estimate, comparison_data,
		       COALESCE(total_contractor_estimate, 0),
		       COALESCE(total_carrier_estimate, 0),
		       COALESCE(total_delta, 0)
		  FROM audit_reports
		 WHERE claim_id = $1 AND status = 'completed'
		 ORDER BY created_at DESC LIMIT 1`, req.ClaimID,
	).Scan(
		&auditReport.ID, &auditReport.GeneratedEstimate, &auditReport.ComparisonData,
		&auditReport.TotalContractorEstimate,
		&auditReport.TotalCarrierEstimate,
		&auditReport.TotalDelta,
	)
	if err != nil {
		return fmt.Errorf("fetch audit report: %w", err)
	}

	// Fetch contractor photos
	rows, err := tx.QueryContext(ctx, `
		SELECT id, file_url, file_name
		  FROM documents
		 WHERE claim_id = $1
		   AND document_type = 'contractor_photo'
		   AND status = 'confirmed'
		 ORDER BY created_at ASC`, req.ClaimID,
	)
	if err != nil {
		return fmt.Errorf("fetch photos: %w", err)
	}
	defer rows.Close()

	var photos []photoDoc
	for rows.Next() {
		var d photoDoc
		if err = rows.Scan(&d.ID, &d.FileURL, &d.FileName); err != nil {
			return fmt.Errorf("scan photo row: %w", err)
		}
		photos = append(photos, d)
	}

	// Step 5: Generate PDF in memory
	pdfBytes, err := s.generatePDF(&claim, &auditReport)
	if err != nil {
		return fmt.Errorf("generate PDF: %w", err)
	}

	// Step 6–7: Download photo bytes and build ZIP
	zipBytes, err := s.buildZIP(pdfBytes, photos)
	if err != nil {
		return fmt.Errorf("build ZIP: %w", err)
	}

	// Step 8: Send ZIP to lawyer
	subject := fmt.Sprintf("Claim File — %s (%s)", propertyAddr, lossType)
	carrierEst := 0.0
	if auditReport.TotalCarrierEstimate != nil {
		carrierEst = *auditReport.TotalCarrierEstimate
	}
	totalDelta := 0.0
	if auditReport.TotalDelta != nil {
		totalDelta = *auditReport.TotalDelta
	}
	plainBody := fmt.Sprintf(
		"Please find attached a claim file for review.\n\nProperty: %s\nLoss Type: %s\nIncident Date: %s\nCarrier Estimate: $%.2f\nIndustry Estimate: $%.2f\nUnderpayment: $%.2f\n\nThis package was submitted by the property owner for potential legal representation.\nThe attached ZIP contains a detailed estimate comparison and contractor site photos.",
		propertyAddr, lossType,
		incidentDate.Format("January 2, 2006"),
		carrierEst,
		carrierEst+totalDelta,
		totalDelta,
	)

	err = s.emailService.SendLegalPartnerEmail(SendLegalPartnerEmailInput{
		To:          legalPartnerEmail,
		PartnerName: legalPartnerName,
		Subject:     subject,
		PlainBody:   plainBody,
		ZIPBytes:    zipBytes,
		ZIPFilename: fmt.Sprintf("claim-file-%s.zip", req.ClaimID[:8]),
	})
	if err != nil {
		return fmt.Errorf("send to lawyer: %w", err)
	}

	// Step 10: Update claim status to sent_to_lawyer
	_, err = tx.ExecContext(ctx, `
		UPDATE claims SET legal_escalation_status = 'sent_to_lawyer', updated_at = NOW()
		 WHERE id = $1`, req.ClaimID)
	if err != nil {
		return fmt.Errorf("update claim status: %w", err)
	}

	// Step 11: Commit
	if err = tx.Commit(); err != nil {
		return fmt.Errorf("commit: %w", err)
	}

	// Post-commit: send PM confirmation (best-effort)
	_ = s.sendPMConfirmation(ctx, req, claim, legalPartnerName, legalPartnerEmail, propertyAddr)

	return nil
}

// sendPMConfirmation sends a notification email to the PM after a successful package send.
func (s *LegalPackageService) sendPMConfirmation(
	ctx context.Context,
	req models.LegalApprovalRequest,
	claim models.Claim,
	legalPartnerName, legalPartnerEmail, propertyAddr string,
) error {
	// Look up the PM's email from the users table
	var pmEmail string
	err := s.db.QueryRowContext(ctx,
		`SELECT email FROM users WHERE id = $1`, claim.CreatedByUserID,
	).Scan(&pmEmail)
	if err != nil {
		return fmt.Errorf("fetch PM email: %w", err)
	}

	subject := fmt.Sprintf("Legal Package Sent — %s", propertyAddr)
	body := fmt.Sprintf(
		`<p>%s approved the legal escalation. A full claim package has been sent to %s at %s.</p>`,
		req.OwnerName, legalPartnerName, legalPartnerEmail,
	)
	return s.emailService.SendPMConfirmationEmail(SendPMConfirmationEmailInput{
		To:       pmEmail,
		Subject:  subject,
		HTMLBody: body,
	})
}

// -------------------------------------------------------------------
// generatePDF — builds the Xactimate-style PDF, returns raw bytes
// -------------------------------------------------------------------

func (s *LegalPackageService) generatePDF(claim *models.Claim, auditReport *models.AuditReport) ([]byte, error) {
	// Parse the JSON blobs from the audit report
	var estimate generatedEstimate
	if auditReport.GeneratedEstimate != nil {
		if err := json.Unmarshal([]byte(*auditReport.GeneratedEstimate), &estimate); err != nil {
			return nil, fmt.Errorf("parse generated_estimate: %w", err)
		}
	}

	var comparison comparisonData
	if auditReport.ComparisonData != nil {
		if err := json.Unmarshal([]byte(*auditReport.ComparisonData), &comparison); err != nil {
			return nil, fmt.Errorf("parse comparison_data: %w", err)
		}
	}

	pdf := fpdf.New("P", "pt", "Letter", "")
	pdf.SetMargins(54, 54, 54) // 0.75 inch margins (72pt per inch)
	pdf.AddPage()

	pageW, _ := pdf.GetPageSize()
	contentW := pageW - 108 // 54pt * 2

	// --- Header block ---
	pdf.SetFont("Helvetica", "B", 13)
	pdf.CellFormat(contentW, 18, "PROPERTY DAMAGE ESTIMATE", "", 0, "L", false, 0, "")
	pdf.SetFont("Helvetica", "", 9)
	pdf.CellFormat(0, 18, fmt.Sprintf("Prepared: %s", time.Now().Format("January 2, 2006")), "", 1, "R", false, 0, "")

	// Horizontal rule
	pdf.SetDrawColor(180, 180, 180)
	pdf.Line(54, pdf.GetY(), pageW-54, pdf.GetY())
	pdf.Ln(6)

	// Header fields
	propertyAddr := ""
	if claim.Property != nil {
		propertyAddr = claim.Property.LegalAddress
	}
	claimNum := "N/A"
	if claim.ClaimNumber != nil {
		claimNum = *claim.ClaimNumber
	}
	adjuster := "N/A"
	if claim.AdjusterName != nil {
		adjuster = *claim.AdjusterName
	}

	headerFields := [][2]string{
		{"Property:", propertyAddr},
		{"Claim No:", claimNum},
		{"Loss Type:", claim.LossType},
		{"Incident:", claim.IncidentDate.Format("January 2, 2006")},
		{"Adjuster:", adjuster},
	}
	labelW := 70.0
	pdf.SetFont("Helvetica", "", 9)
	for _, f := range headerFields {
		pdf.SetFont("Helvetica", "B", 9)
		pdf.CellFormat(labelW, 14, f[0], "", 0, "L", false, 0, "")
		pdf.SetFont("Helvetica", "", 9)
		pdf.CellFormat(contentW-labelW, 14, f[1], "", 1, "L", false, 0, "")
	}
	pdf.Ln(8)

	// --- Line Items Table ---
	pdf.SetFont("Helvetica", "B", 10)
	pdf.CellFormat(contentW, 16, "LINE ITEM ESTIMATE", "", 1, "L", false, 0, "")
	pdf.Ln(2)

	// Column widths: description(60%), qty(8%), unit(8%), unitcost(12%), total(12%)
	colW := [5]float64{contentW * 0.60, contentW * 0.08, contentW * 0.08, contentW * 0.12, contentW * 0.12}

	// Table header row
	pdf.SetFillColor(230, 230, 230)
	pdf.SetFont("Helvetica", "B", 8)
	headers := [5]string{"Description", "Qty", "Unit", "Unit Cost", "Total"}
	aligns := [5]string{"L", "R", "C", "R", "R"}
	for i, h := range headers {
		pdf.CellFormat(colW[i], 14, h, "1", 0, aligns[i], true, 0, "")
	}
	pdf.Ln(-1)

	// Group line items by category
	type categoryGroup struct {
		name  string
		items []estimateLineItem
	}
	var categories []categoryGroup
	catIndex := map[string]int{}
	for _, item := range estimate.LineItems {
		cat := item.Category
		if cat == "" {
			cat = "General"
		}
		if idx, ok := catIndex[cat]; ok {
			categories[idx].items = append(categories[idx].items, item)
		} else {
			catIndex[cat] = len(categories)
			categories = append(categories, categoryGroup{name: cat, items: []estimateLineItem{item}})
		}
	}
	// Sort categories alphabetically for deterministic output
	sort.Slice(categories, func(i, j int) bool { return categories[i].name < categories[j].name })

	fill := false
	pdf.SetFont("Helvetica", "", 8)
	for _, group := range categories {
		// Category header row
		pdf.SetFillColor(245, 245, 245)
		pdf.SetFont("Helvetica", "B", 8)
		pdf.CellFormat(contentW, 13, "  "+group.name, "1", 1, "L", true, 0, "")
		pdf.SetFont("Helvetica", "", 8)

		for _, item := range group.items {
			if fill {
				pdf.SetFillColor(249, 250, 251)
			} else {
				pdf.SetFillColor(255, 255, 255)
			}
			fill = !fill
			pdf.CellFormat(colW[0], 13, "  "+item.Description, "1", 0, "L", true, 0, "")
			pdf.CellFormat(colW[1], 13, fmt.Sprintf("%.2f", item.Quantity), "1", 0, "R", true, 0, "")
			pdf.CellFormat(colW[2], 13, item.Unit, "1", 0, "C", true, 0, "")
			pdf.CellFormat(colW[3], 13, fmt.Sprintf("$%.2f", item.UnitCost), "1", 0, "R", true, 0, "")
			pdf.CellFormat(colW[4], 13, fmt.Sprintf("$%.2f", item.Total), "1", 1, "R", true, 0, "")
		}
	}

	// Footer totals
	rightColW := colW[3] + colW[4]
	labelColW := contentW - rightColW
	totals := [][2]string{
		{"Subtotal", fmt.Sprintf("$%.2f", estimate.Subtotal)},
		{"O&P (10%)", fmt.Sprintf("$%.2f", estimate.OverheadProfit)},
	}
	pdf.SetFillColor(255, 255, 255)
	pdf.SetFont("Helvetica", "", 8)
	for _, row := range totals {
		pdf.CellFormat(labelColW, 13, "", "1", 0, "L", false, 0, "")
		pdf.CellFormat(rightColW, 13, row[0]+"   "+row[1], "1", 1, "R", false, 0, "")
	}
	pdf.SetFont("Helvetica", "B", 9)
	pdf.CellFormat(labelColW, 14, "", "1", 0, "L", false, 0, "")
	pdf.CellFormat(rightColW, 14, fmt.Sprintf("TOTAL   $%.2f", estimate.Total), "1", 1, "R", false, 0, "")
	pdf.Ln(12)

	// --- Discrepancy Comparison Table ---
	if len(comparison.Discrepancies) > 0 {
		pdf.SetFont("Helvetica", "B", 10)
		pdf.CellFormat(contentW, 16, "COMPARISON — CARRIER VS. INDUSTRY STANDARD", "", 1, "L", false, 0, "")
		pdf.Ln(2)

		// Column widths: description(52%), industry(16%), carrier(16%), underpayment(16%)
		dColW := [4]float64{contentW * 0.52, contentW * 0.16, contentW * 0.16, contentW * 0.16}

		pdf.SetFillColor(230, 230, 230)
		pdf.SetFont("Helvetica", "B", 8)
		dHeaders := [4]string{"Description", "Industry Est.", "Carrier Est.", "Underpayment"}
		dAligns := [4]string{"L", "R", "R", "R"}
		for i, h := range dHeaders {
			pdf.CellFormat(dColW[i], 14, h, "1", 0, dAligns[i], true, 0, "")
		}
		pdf.Ln(-1)

		fill = false
		pdf.SetFont("Helvetica", "", 8)
		for _, disc := range comparison.Discrepancies {
			if fill {
				pdf.SetFillColor(249, 250, 251)
			} else {
				pdf.SetFillColor(255, 255, 255)
			}
			fill = !fill
			pdf.CellFormat(dColW[0], 13, "  "+disc.Item, "1", 0, "L", true, 0, "")
			pdf.CellFormat(dColW[1], 13, fmt.Sprintf("$%.2f", disc.IndustryPrice), "1", 0, "R", true, 0, "")
			pdf.CellFormat(dColW[2], 13, fmt.Sprintf("$%.2f", disc.CarrierPrice), "1", 0, "R", true, 0, "")
			pdf.CellFormat(dColW[3], 13, fmt.Sprintf("$%.2f", disc.Delta), "1", 1, "R", true, 0, "")
		}

		// Total underpayment row
		totalDelta := 0.0
		if auditReport.TotalDelta != nil {
			totalDelta = *auditReport.TotalDelta
		}
		pdf.SetFont("Helvetica", "B", 9)
		pdf.SetFillColor(255, 255, 255)
		totalLabelW := dColW[0] + dColW[1] + dColW[2]
		pdf.CellFormat(totalLabelW, 14, "TOTAL UNDERPAYMENT", "1", 0, "R", false, 0, "")
		pdf.CellFormat(dColW[3], 14, fmt.Sprintf("$%.2f", totalDelta), "1", 1, "R", false, 0, "")
	}

	// --- Footer (every page, added after content) ---
	pdf.SetFooterFunc(func() {
		pdf.SetY(-40)
		pdf.SetFont("Helvetica", "I", 7)
		pdf.SetTextColor(120, 120, 120)
		footerText := "This estimate was prepared using current industry-standard pricing and is provided for informational purposes in connection with an insurance claim dispute."
		pdf.MultiCell(contentW, 10, footerText, "", "C", false)
		pdf.SetFont("Helvetica", "I", 7)
		pdf.CellFormat(contentW, 10,
			fmt.Sprintf("Page %d of {nb}", pdf.PageNo()),
			"", 0, "C", false, 0, "")
	})
	pdf.AliasNbPages("{nb}")

	var buf bytes.Buffer
	if err := pdf.Output(&buf); err != nil {
		return nil, fmt.Errorf("render PDF: %w", err)
	}
	return buf.Bytes(), nil
}

// -------------------------------------------------------------------
// buildZIP — assembles PDF + photo bytes into a ZIP archive
// -------------------------------------------------------------------

func (s *LegalPackageService) buildZIP(pdfBytes []byte, photos []photoDoc) ([]byte, error) {
	var buf bytes.Buffer
	w := zip.NewWriter(&buf)

	// Add the PDF
	f, err := w.Create("discrepancy-report.pdf")
	if err != nil {
		return nil, fmt.Errorf("create PDF entry in zip: %w", err)
	}
	if _, err = f.Write(pdfBytes); err != nil {
		return nil, fmt.Errorf("write PDF to zip: %w", err)
	}

	// Add photos with zero-padded index prefix
	for i, photo := range photos {
		// Get a short-lived signed download URL from Supabase Storage
		signedURL, err := s.storage.GenerateDownloadURL(photo.FileURL)
		if err != nil {
			return nil, fmt.Errorf("generate download URL for photo %s: %w", photo.ID, err)
		}

		// HTTP GET the bytes
		resp, err := http.Get(signedURL) //nolint:noctx — accept context limitation here
		if err != nil {
			return nil, fmt.Errorf("download photo %s: %w", photo.ID, err)
		}
		defer resp.Body.Close()
		photoBytes, err := io.ReadAll(resp.Body)
		if err != nil {
			return nil, fmt.Errorf("read photo bytes %s: %w", photo.ID, err)
		}

		entryName := fmt.Sprintf("photos/%03d_%s", i+1, photo.FileName)
		pf, err := w.Create(entryName)
		if err != nil {
			return nil, fmt.Errorf("create zip entry for photo %s: %w", photo.ID, err)
		}
		if _, err = pf.Write(photoBytes); err != nil {
			return nil, fmt.Errorf("write photo to zip %s: %w", photo.ID, err)
		}
	}

	if err := w.Close(); err != nil {
		return nil, fmt.Errorf("close zip writer: %w", err)
	}
	return buf.Bytes(), nil
}
