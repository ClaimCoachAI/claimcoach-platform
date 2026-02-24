# Legal Package Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When an AI audit reveals a carrier underpayment >= $10,000, the PM can initiate legal escalation — the homeowner approves via a standalone page, and the system auto-generates a ZIP (Xactimate-style PDF + contractor photos) and emails it to the legal partner.

**Architecture:** Three new API endpoints (POST escalation, GET approval page data, POST approval response) backed by a new `legal_package_service.go` that generates the PDF in-memory using `go-pdf/fpdf`, assembles a ZIP using stdlib `archive/zip`, and sends it via the existing SendGrid integration. The frontend adds delta-threshold logic to ClaimStepper (rebuttal vs. legal prompt) and a new standalone `LegalApprovalPage.tsx` gated by a one-time token — analogous to the existing `/upload/:token` contractor page.

**Tech Stack:** Go 1.25 + Gin + PostgreSQL (Supabase), `github.com/go-pdf/fpdf` (pure Go, Lambda-safe), `archive/zip` (stdlib), SendGrid (existing), React 18 + TypeScript + Tailwind, React Router v6, TanStack Query v5.

---

## Codebase Orientation

### Key existing files

| File | What it does |
|------|-------------|
| `backend/internal/models/claim.go` | `Claim` struct — needs 3 new fields |
| `backend/internal/models/magic_link.go` | Pattern to copy for `LegalApprovalRequest` model |
| `backend/internal/services/email_service.go` | `EmailService` interface + `MockEmailService` — add 2 new methods |
| `backend/internal/services/sendgrid_email_service.go` | SendGrid impl — add 2 new methods + `sendEmailWithAttachment` helper |
| `backend/internal/api/router.go` | Register 3 new routes — 2 public, 1 protected |
| `backend/internal/config/config.go` | Add `LegalEscalationThreshold float64` field |
| `frontend/src/components/ClaimStepper.tsx` | ~3600 lines, Step 6 logic lives around lines 1478–1585 |
| `frontend/src/pages/ContractorUpload.tsx` | Token-gated standalone page — exact pattern to replicate |
| `frontend/src/App.tsx` | React Router routes — add `/legal-approval/:token` |
| `frontend/src/types/claim.ts` | `Claim` interface — add 3 new fields |

### Migration numbering
Latest migration is `000010`. New migration will be `000011`.

### Token generation pattern (from `magic_link_service.go`)
```go
token := uuid.New().String()  // uuid v4, cryptographically secure
expiresAt := time.Now().Add(72 * time.Hour)
```
Copy this exactly for `legal_approval_requests`.

### Delta threshold business rules
| Delta | What to show |
|-------|-------------|
| < $500 | Nothing |
| $500 – $9,999.99 | Rebuttal letter CTA only |
| >= $10,000 | Legal action prompt only (no rebuttal) |

The `$10,000` threshold comes from env var `LEGAL_ESCALATION_THRESHOLD_DOLLARS` (default `10000`). This is config, not a magic number.

---

## Task 1: Database Migration 000011

**Files:**
- Create: `backend/internal/database/migrations/000011_add_legal_package.up.sql`
- Create: `backend/internal/database/migrations/000011_add_legal_package.down.sql`

### Step 1: Write the up migration

Create `backend/internal/database/migrations/000011_add_legal_package.up.sql`:

```sql
-- Migration 000011: Legal Package
-- Adds legal escalation fields to claims table and creates legal_approval_requests table.

-- Legal escalation tracking on the claim itself
ALTER TABLE claims
    ADD COLUMN legal_partner_name    VARCHAR(255),
    ADD COLUMN legal_partner_email   VARCHAR(255),
    ADD COLUMN owner_email           VARCHAR(255),
    ADD COLUMN legal_escalation_status VARCHAR(50)
        CHECK (legal_escalation_status IN (
            'pending_approval', 'approved', 'declined', 'sent_to_lawyer'
        ));

-- One approval request row per escalation attempt
CREATE TABLE legal_approval_requests (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id     UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    token        VARCHAR(255) NOT NULL UNIQUE,
    owner_name   VARCHAR(255) NOT NULL,
    owner_email  VARCHAR(255) NOT NULL,
    status       VARCHAR(50) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'declined', 'expired')),
    expires_at   TIMESTAMP NOT NULL,
    responded_at TIMESTAMP,
    created_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_legal_approval_token  ON legal_approval_requests(token);
CREATE INDEX idx_legal_approval_claim  ON legal_approval_requests(claim_id);
CREATE INDEX idx_legal_approval_status ON legal_approval_requests(status);
```

### Step 2: Write the down migration

Create `backend/internal/database/migrations/000011_add_legal_package.down.sql`:

```sql
-- Rollback 000011: Legal Package

DROP INDEX IF EXISTS idx_legal_approval_status;
DROP INDEX IF EXISTS idx_legal_approval_claim;
DROP INDEX IF EXISTS idx_legal_approval_token;

DROP TABLE IF EXISTS legal_approval_requests;

ALTER TABLE claims
    DROP COLUMN IF EXISTS legal_escalation_status,
    DROP COLUMN IF EXISTS owner_email,
    DROP COLUMN IF EXISTS legal_partner_email,
    DROP COLUMN IF EXISTS legal_partner_name;
```

### Step 3: Apply the migration via Supabase MCP

Run the up migration against the Supabase project using the `apply_migration` MCP tool with `name = "add_legal_package"` and the SQL from step 1.

Expected: migration applies cleanly with no errors. Verify by checking `legal_approval_requests` table exists.

### Step 4: Commit

```bash
git add "backend/internal/database/migrations/000011_add_legal_package.up.sql" \
        "backend/internal/database/migrations/000011_add_legal_package.down.sql"
git commit -m "feat(db): add legal package migration 000011 — claims columns + legal_approval_requests table"
```

---

## Task 2: Backend Models

**Files:**
- Create: `backend/internal/models/legal_approval.go`
- Modify: `backend/internal/models/claim.go` (add 4 fields to `Claim` struct)

### Step 1: Create the LegalApprovalRequest model

Create `backend/internal/models/legal_approval.go`:

```go
package models

import "time"

// LegalApprovalRequest represents a homeowner approval request for legal escalation.
// One row is created per escalation attempt. The token is a one-time-use UUID v4.
type LegalApprovalRequest struct {
	ID          string     `json:"id" db:"id"`
	ClaimID     string     `json:"claim_id" db:"claim_id"`
	Token       string     `json:"token" db:"token"`
	OwnerName   string     `json:"owner_name" db:"owner_name"`
	OwnerEmail  string     `json:"owner_email" db:"owner_email"`
	Status      string     `json:"status" db:"status"` // pending | approved | declined | expired
	ExpiresAt   time.Time  `json:"expires_at" db:"expires_at"`
	RespondedAt *time.Time `json:"responded_at,omitempty" db:"responded_at"`
	CreatedAt   time.Time  `json:"created_at" db:"created_at"`
}

// LegalApprovalStatus constants
const (
	LegalApprovalStatusPending  = "pending"
	LegalApprovalStatusApproved = "approved"
	LegalApprovalStatusDeclined = "declined"
	LegalApprovalStatusExpired  = "expired"
)
```

### Step 2: Add legal fields to the Claim struct

In `backend/internal/models/claim.go`, add four fields to the `Claim` struct. Insert them after the `InspectionDatetime` field (line ~58), before the `// Existing fields` comment:

```go
	// Legal escalation fields (added in migration 000011)
	LegalPartnerName       *string `json:"legal_partner_name,omitempty" db:"legal_partner_name"`
	LegalPartnerEmail      *string `json:"legal_partner_email,omitempty" db:"legal_partner_email"`
	OwnerEmail             *string `json:"owner_email,omitempty" db:"owner_email"`
	LegalEscalationStatus  *string `json:"legal_escalation_status,omitempty" db:"legal_escalation_status"`
```

### Step 3: Verify the package compiles

```bash
cd "/Users/benjaminlopez/Documents/ClaimCoachAI Code/backend" && go build ./internal/models/...
```

Expected: no output (clean compile).

### Step 4: Commit

```bash
git add backend/internal/models/legal_approval.go backend/internal/models/claim.go
git commit -m "feat(models): add LegalApprovalRequest model and legal escalation fields on Claim"
```

---

## Task 3: Config — Add Threshold Env Var

**Files:**
- Modify: `backend/internal/config/config.go`

### Step 1: Add the threshold field to Config

In `config.go`, add to the `Config` struct (after `ClaimCoachEmail`):

```go
	// Legal escalation threshold — claims with delta >= this amount trigger legal prompt
	// Configurable via LEGAL_ESCALATION_THRESHOLD_DOLLARS env var (default: 10000)
	LegalEscalationThreshold float64
```

In the `Load()` function, after the `ClaimCoachEmail` line, add:

```go
		LegalEscalationThreshold: getEnvFloat64OrDefault("LEGAL_ESCALATION_THRESHOLD_DOLLARS", 10000),
```

Add the helper function at the bottom of the file (after `getEnvIntOrDefault`):

```go
func getEnvFloat64OrDefault(key string, defaultValue float64) float64 {
	if value := os.Getenv(key); value != "" {
		if f, err := strconv.ParseFloat(value, 64); err == nil {
			return f
		}
	}
	return defaultValue
}
```

Note: `strconv` is already imported (used by `getEnvIntOrDefault`). No new import needed.

### Step 2: Build to verify

```bash
cd "/Users/benjaminlopez/Documents/ClaimCoachAI Code/backend" && go build ./internal/config/...
```

Expected: clean compile.

### Step 3: Commit

```bash
git add backend/internal/config/config.go
git commit -m "feat(config): add LEGAL_ESCALATION_THRESHOLD_DOLLARS env var (default 10000)"
```

---

## Task 4: Add go-pdf/fpdf Dependency

**Files:**
- Modify: `backend/go.mod`
- Modify: `backend/go.sum` (auto-updated)

### Step 1: Add the dependency

```bash
cd "/Users/benjaminlopez/Documents/ClaimCoachAI Code/backend" && go get github.com/go-pdf/fpdf@latest
```

Expected output (approximate):
```
go: added github.com/go-pdf/fpdf v2.x.x
```

### Step 2: Verify it resolves

```bash
cd "/Users/benjaminlopez/Documents/ClaimCoachAI Code/backend" && go mod tidy
```

Expected: no errors.

### Step 3: Commit

```bash
git add backend/go.mod backend/go.sum
git commit -m "chore(deps): add github.com/go-pdf/fpdf for server-side PDF generation"
```

---

## Task 5: Backend Service — legal_package_service.go

This is the largest backend task. It covers: PDF generation, ZIP assembly, email orchestration, and the DB operations for escalation initiation and approval processing.

**Files:**
- Create: `backend/internal/services/legal_package_service.go`

### Step 1: Understand the data shapes used in this service

The service needs these types from existing models:

- `models.Claim` — has `Property *Property`, `Policy *Policy`, `LegalPartnerEmail`, `LegalPartnerName`
- `models.AuditReport` — has `GeneratedEstimate *string` (JSON), `ComparisonData *string` (JSON), `TotalCarrierEstimate *float64`, `TotalDelta *float64`
- `models.ScopeSheet` — has `Areas []ScopeArea`
- `models.Document` — has `FileURL string`, `FileName string`, `DocumentType string`
- `models.LegalApprovalRequest` — the new model from Task 2

The `AuditReport.GeneratedEstimate` JSON contains:
```json
{
  "line_items": [
    {
      "description": "Roof Replacement",
      "category": "Roofing",
      "quantity": 1,
      "unit": "SQ",
      "unit_cost": 450.00,
      "total": 450.00
    }
  ],
  "subtotal": 9450.00,
  "overhead_profit": 945.00,
  "total": 9580.70
}
```

The `AuditReport.ComparisonData` JSON contains:
```json
{
  "discrepancies": [
    {
      "item": "Roof Replacement",
      "industry_price": 9580.70,
      "carrier_price": 5240.80,
      "delta": 4339.90,
      "justification": "..."
    }
  ],
  "summary": {
    "total_industry": 9580.70,
    "total_carrier": 5240.80,
    "total_delta": 4339.90
  }
}
```

### Step 2: Create the service file

Create `backend/internal/services/legal_package_service.go`:

```go
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
	LineItems       []estimateLineItem `json:"line_items"`
	Subtotal        float64            `json:"subtotal"`
	OverheadProfit  float64            `json:"overhead_profit"`
	Total           float64            `json:"total"`
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
		ID:        uuid.New().String(),
		ClaimID:   claimID,
		Token:     token,
		OwnerName: input.OwnerName,
		OwnerEmail: input.OwnerEmail,
		Status:    models.LegalApprovalStatusPending,
		ExpiresAt: expiresAt,
		CreatedAt: time.Now(),
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
	var claimID, lossType string
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
	_ = claimID
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

	type photoDoc struct {
		ID       string
		FileURL  string
		FileName string
	}
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
	plainBody := fmt.Sprintf(
		"Please find attached a claim file for review.\n\nProperty: %s\nLoss Type: %s\nIncident Date: %s\nCarrier Estimate: $%.2f\nIndustry Estimate: $%.2f\nUnderpayment: $%.2f\n\nThis package was submitted by the property owner for potential legal representation.\nThe attached ZIP contains a detailed estimate comparison and contractor site photos.",
		propertyAddr, lossType,
		incidentDate.Format("January 2, 2006"),
		*auditReport.TotalCarrierEstimate,
		*auditReport.TotalCarrierEstimate + *auditReport.TotalDelta,
		*auditReport.TotalDelta,
	)

	err = s.emailService.SendLegalPartnerEmail(SendLegalPartnerEmailInput{
		To:           legalPartnerEmail,
		PartnerName:  legalPartnerName,
		Subject:      subject,
		PlainBody:    plainBody,
		ZIPBytes:     zipBytes,
		ZIPFilename:  fmt.Sprintf("claim-file-%s.zip", req.ClaimID[:8]),
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
	return s.emailService.(*SendGridEmailService).sendEmail(pmEmail, subject, body)
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

func (s *LegalPackageService) buildZIP(pdfBytes []byte, photos []struct {
	ID       string
	FileURL  string
	FileName string
}) ([]byte, error) {
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
```

> **Note on `buildZIP` signature:** The `photos` parameter uses an anonymous struct type. When calling `buildZIP` from `processApprove`, convert `[]photoDoc` to `[]struct{ ID, FileURL, FileName string }`. To avoid this awkwardness, define `photoDoc` at the package level (not inside the function). Update the code accordingly — define `type photoDoc struct { ID, FileURL, FileName string }` at the top of the file alongside the other internal types, then use it consistently.

### Step 3: Build to verify

```bash
cd "/Users/benjaminlopez/Documents/ClaimCoachAI Code/backend" && go build ./internal/services/...
```

Expected: clean compile. Fix any type errors that arise (e.g., pointer dereference on `TotalCarrierEstimate` — remember it is `*float64`).

### Step 4: Commit

```bash
git add backend/internal/services/legal_package_service.go
git commit -m "feat(services): add LegalPackageService — PDF generation, ZIP assembly, email orchestration"
```

---

## Task 6: Email Interface + SendGrid Implementation

**Files:**
- Modify: `backend/internal/services/email_service.go`
- Modify: `backend/internal/services/sendgrid_email_service.go`

### Step 1: Add two new input types and extend the interface

In `backend/internal/services/email_service.go`, after the existing `SendMeetingNotificationInput` struct, add:

```go
// SendOwnerApprovalEmailInput contains all data needed to send the homeowner approval request email.
type SendOwnerApprovalEmailInput struct {
	To              string
	OwnerName       string
	PropertyAddress string
	ApprovalURL     string
	ExpiresAt       time.Time
}

// SendLegalPartnerEmailInput contains all data needed to send the legal package email with attachment.
type SendLegalPartnerEmailInput struct {
	To          string
	PartnerName string
	Subject     string
	PlainBody   string
	ZIPBytes    []byte
	ZIPFilename string
}
```

In the `EmailService` interface, add two new method signatures:

```go
	SendOwnerApprovalEmail(input SendOwnerApprovalEmailInput) error
	SendLegalPartnerEmail(input SendLegalPartnerEmailInput) error
```

In `MockEmailService`, add stub implementations (log only, return nil):

```go
func (s *MockEmailService) SendOwnerApprovalEmail(input SendOwnerApprovalEmailInput) error {
	log.Printf("[MOCK EMAIL] Owner approval to: %s | URL: %s | Expires: %s",
		input.To, input.ApprovalURL, input.ExpiresAt.Format(time.RFC3339))
	return nil
}

func (s *MockEmailService) SendLegalPartnerEmail(input SendLegalPartnerEmailInput) error {
	log.Printf("[MOCK EMAIL] Legal partner package to: %s | Subject: %s | ZIP bytes: %d",
		input.To, input.Subject, len(input.ZIPBytes))
	return nil
}
```

### Step 2: Implement the two new methods in SendGridEmailService

In `backend/internal/services/sendgrid_email_service.go`, add after `SendClaimCoachNotification`:

```go
// SendOwnerApprovalEmail sends the homeowner a link to review and approve legal escalation.
func (s *SendGridEmailService) SendOwnerApprovalEmail(input SendOwnerApprovalEmailInput) error {
	subject := fmt.Sprintf("Action Required — Review Your Claim at %s", input.PropertyAddress)
	htmlBody := fmt.Sprintf(`<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Review Your Claim</title></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f5f5f5; margin: 0; padding: 0;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: white; border-radius: 8px; padding: 30px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
      <p>Hi %s,</p>
      <p>Your property manager has reviewed the insurance claim for <strong>%s</strong> and found a potential underpayment by the carrier. They would like your approval to share the full claim file with a legal partner who can assess your options.</p>
      <p>Please review the details and let us know your decision:</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="%s" style="background: #111827; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold; font-size: 15px;">Review and Respond</a>
      </div>
      <p style="color: #6b7280; font-size: 13px;">This link expires on <strong>%s</strong>. If you have questions, please contact your property manager directly.</p>
    </div>
  </div>
</body>
</html>`,
		input.OwnerName,
		input.PropertyAddress,
		input.ApprovalURL,
		input.ExpiresAt.Format("Monday, January 2, 2006"),
	)
	return s.sendEmail(input.To, subject, htmlBody)
}

// SendLegalPartnerEmail sends the ZIP package to the legal partner via SendGrid attachment.
func (s *SendGridEmailService) SendLegalPartnerEmail(input SendLegalPartnerEmailInput) error {
	from := mail.NewEmail(s.fromName, s.fromEmail)
	to := mail.NewEmail(input.PartnerName, input.To)

	message := mail.NewSingleEmail(from, input.Subject, to, input.PlainBody, "")

	// Attach the ZIP file
	attachment := mail.NewAttachment()
	attachment.SetContent(base64.StdEncoding.EncodeToString(input.ZIPBytes))
	attachment.SetType("application/zip")
	attachment.SetFilename(input.ZIPFilename)
	attachment.SetDisposition("attachment")
	message.AddAttachment(attachment)

	client := sendgrid.NewSendClient(s.apiKey)
	response, err := client.Send(message)
	if err != nil {
		return fmt.Errorf("send legal partner email: %w", err)
	}
	if response.StatusCode >= 400 {
		return fmt.Errorf("sendgrid error %d: %s", response.StatusCode, response.Body)
	}
	return nil
}
```

Add `"encoding/base64"` to the import block in `sendgrid_email_service.go`.

### Step 3: Build to verify

```bash
cd "/Users/benjaminlopez/Documents/ClaimCoachAI Code/backend" && go build ./internal/services/...
```

Expected: clean compile.

### Step 4: Commit

```bash
git add backend/internal/services/email_service.go \
        backend/internal/services/sendgrid_email_service.go
git commit -m "feat(email): add SendOwnerApprovalEmail and SendLegalPartnerEmail to interface and SendGrid impl"
```

---

## Task 7: Backend Handler + Routes

**Files:**
- Create: `backend/internal/handlers/legal_package_handler.go`
- Modify: `backend/internal/api/router.go`
- Modify: `backend/internal/config/config.go` (already done in Task 3)

### Step 1: Create the handler

Create `backend/internal/handlers/legal_package_handler.go`:

```go
package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/claimcoach/backend/internal/auth"
	"github.com/claimcoach/backend/internal/services"
)

// LegalPackageHandler exposes the 3 legal package endpoints.
type LegalPackageHandler struct {
	svc *services.LegalPackageService
}

// NewLegalPackageHandler constructs the handler.
func NewLegalPackageHandler(svc *services.LegalPackageService) *LegalPackageHandler {
	return &LegalPackageHandler{svc: svc}
}

// InitiateEscalation handles POST /api/claims/:id/legal-escalation
// Requires auth. Creates the approval request and sends the homeowner email.
func (h *LegalPackageHandler) InitiateEscalation(c *gin.Context) {
	claimID := c.Param("id")
	user := c.MustGet("user").(*auth.User)

	var input services.InitiateEscalationInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	req, err := h.svc.InitiateEscalation(c.Request.Context(), claimID, user.OrganizationID, input)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"owner_name":  req.OwnerName,
			"owner_email": req.OwnerEmail,
			"expires_at":  req.ExpiresAt,
		},
	})
}

// GetApprovalPage handles GET /api/legal-approval/:token
// Public (no auth). Returns the data needed to render the homeowner approval page.
func (h *LegalPackageHandler) GetApprovalPage(c *gin.Context) {
	token := c.Param("token")

	data, err := h.svc.GetApprovalPageData(c.Request.Context(), token)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load approval data"})
		return
	}
	if data == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "approval link not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": data})
}

// RespondToApproval handles POST /api/legal-approval/:token/respond
// Public (no auth). Records the homeowner approve/decline decision.
func (h *LegalPackageHandler) RespondToApproval(c *gin.Context) {
	token := c.Param("token")

	var input services.ProcessApprovalInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.svc.ProcessApproval(c.Request.Context(), token, input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}
```

### Step 2: Register the routes in router.go

In `backend/internal/api/router.go`:

**Instantiate the service and handler** — add after the `rcvDemandHandler` block (around line 96):

```go
	legalPackageService := services.NewLegalPackageService(
		db, emailService, storageClient, claimService, auditService, cfg.FrontendURL,
	)
	legalPackageHandler := handlers.NewLegalPackageHandler(legalPackageService)
```

**Register public routes** — add after the last public magic-link route (around line 119):

```go
	// Public legal approval endpoints (token-gated, no JWT required)
	r.GET("/api/legal-approval/:token", legalPackageHandler.GetApprovalPage)
	r.POST("/api/legal-approval/:token/respond", legalPackageHandler.RespondToApproval)
```

**Register protected route** — add inside the `api` group after the RCV demand routes (end of the group, before the closing `}`):

```go
		// Legal package route (protected)
		api.POST("/claims/:id/legal-escalation", legalPackageHandler.InitiateEscalation)
```

### Step 3: Build the full backend

```bash
cd "/Users/benjaminlopez/Documents/ClaimCoachAI Code/backend" && go build ./...
```

Expected: clean compile.

### Step 4: Quick smoke test with curl (requires running server)

Start the server locally (if you have a `.env` file):
```bash
cd "/Users/benjaminlopez/Documents/ClaimCoachAI Code/backend" && go run cmd/server/main.go
```

In another terminal:
```bash
curl -s http://localhost:8080/api/legal-approval/nonexistent-token | jq .
```
Expected:
```json
{"error": "approval link not found"}
```

### Step 5: Commit

```bash
git add backend/internal/handlers/legal_package_handler.go \
        backend/internal/api/router.go
git commit -m "feat(api): add legal package handler and routes (POST escalation, GET/POST approval)"
```

---

## Task 8: Frontend — Claim Type + Delta Threshold Logic in ClaimStepper

**Files:**
- Modify: `frontend/src/types/claim.ts`
- Modify: `frontend/src/components/ClaimStepper.tsx`

### Step 1: Add legal escalation fields to the Claim TypeScript interface

In `frontend/src/types/claim.ts`, add to the `Claim` interface (after `updated_at`):

```ts
  // Legal escalation (added in migration 000011)
  legal_partner_name?: string
  legal_partner_email?: string
  owner_email?: string
  legal_escalation_status?: 'pending_approval' | 'approved' | 'declined' | 'sent_to_lawyer'
```

### Step 2: Add state variables at the top of ClaimStepper

In `ClaimStepper.tsx`, locate the existing state declarations around line 66–68 (near `rebuttalText`, `auditLoadingStep`, `photosOpen`). Add four new state variables directly after `photosOpen`:

```ts
  // Legal escalation state (Step 6)
  const [discrepanciesOpen, setDiscrepanciesOpen] = useState(false)
  const [legalEscalationDismissed, setLegalEscalationDismissed] = useState(false)
  const [showLegalEscalationForm, setShowLegalEscalationForm] = useState(false)
  const [legalEscalationSubmitted, setLegalEscalationSubmitted] = useState<{
    ownerName: string
    ownerEmail: string
    legalPartnerName: string
  } | null>(null)
```

### Step 3: Add the legal escalation mutation

After the existing `generateRebuttalMutation` (search for `generateRebuttalMutation`), add:

```ts
  const legalEscalationMutation = useMutation({
    mutationFn: async (data: {
      legal_partner_name: string
      legal_partner_email: string
      owner_name: string
      owner_email: string
    }) => {
      const res = await api.post(`/api/claims/${claim.id}/legal-escalation`, data)
      return res.data
    },
    onSuccess: (_, variables) => {
      setLegalEscalationSubmitted({
        ownerName: variables.owner_name,
        ownerEmail: variables.owner_email,
        legalPartnerName: variables.legal_partner_name,
      })
    },
  })
```

### Step 4: Replace the discrepancy list with a collapsible summary

Locate the discrepancy list block starting at line ~1503:

```tsx
                {/* Discrepancies list */}
                {comparisonData.discrepancies.length > 0 ? (
                  <div className="audit-discrepancies">
                    <div className="audit-disc-header-row">
                      <span className="audit-disc-count">{comparisonData.discrepancies.length} Discrepanc{comparisonData.discrepancies.length === 1 ? 'y' : 'ies'} Found</span>
                    </div>
                    {comparisonData.discrepancies.map((disc, i) => (
```

Replace the entire discrepancy block (from the `{/* Discrepancies list */}` comment through the closing `</div>` of the `audit-no-disc` block) with:

```tsx
                {/* Discrepancies — collapsible summary row */}
                {comparisonData.discrepancies.length > 0 ? (() => {
                  const sorted = [...comparisonData.discrepancies].sort((a, b) => b.delta - a.delta)
                  const topGap = sorted[0]
                  return (
                    <div className="audit-discrepancies">
                      <div className="audit-disc-summary-row">
                        <span className="audit-disc-count">
                          {comparisonData.discrepancies.length} Discrepanc{comparisonData.discrepancies.length === 1 ? 'y' : 'ies'} Found
                        </span>
                        <span className="audit-disc-top-gap">
                          Top gap: {topGap.item} +${(topGap.delta || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </span>
                        <button
                          type="button"
                          className="audit-disc-toggle"
                          onClick={() => setDiscrepanciesOpen(o => !o)}
                        >
                          {discrepanciesOpen ? 'Hide Details ▴' : 'View Details ▾'}
                        </button>
                      </div>
                      {discrepanciesOpen && (
                        <div className="audit-disc-expanded">
                          {comparisonData.discrepancies.map((disc, i) => (
                            <div key={i} className="audit-disc-item">
                              <div className="audit-disc-top">
                                <span className="audit-disc-item-name">{disc.item}</span>
                                <span className="audit-disc-delta-badge">+${(disc.delta || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                              </div>
                              <div className="audit-disc-prices">
                                <span className="audit-disc-price">Industry: ${(disc.industry_price || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                                <span className="audit-disc-sep">·</span>
                                <span className="audit-disc-price carrier-price">Carrier: ${(disc.carrier_price || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                              </div>
                              {disc.justification && (
                                <p className="audit-disc-justification">{disc.justification}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })() : (
                  <div className="audit-no-disc">
                    <span>✓ No significant discrepancies found. The carrier estimate appears to be in line with industry standards.</span>
                  </div>
                )}
```

### Step 5: Apply delta threshold logic to the rebuttal section

The current rebuttal CTA is always shown when there are discrepancies. Replace the condition to enforce the $500–$9,999.99 range. Locate:

```tsx
                {/* Rebuttal section */}
                {!rebuttalText && comparisonData.discrepancies.length > 0 && (
```

Change to:

```tsx
                {/* Rebuttal section — only shown for delta $500–$9,999.99 */}
                {!rebuttalText && comparisonData.discrepancies.length > 0 &&
                  (comparisonData.summary.total_delta || 0) >= 500 &&
                  (comparisonData.summary.total_delta || 0) < 10000 && (
```

### Step 6: Add the legal action prompt (delta >= $10,000)

After the `{rebuttalText && (...)}` block (which ends around line 1568), and before the `{/* Continue CTA */}` comment, insert:

```tsx
                {/* Legal action prompt — delta >= $10,000 */}
                {(comparisonData.summary.total_delta || 0) >= 10000 &&
                  !legalEscalationDismissed &&
                  !showLegalEscalationForm &&
                  !legalEscalationSubmitted &&
                  !claim.legal_escalation_status && (
                  <div className="legal-escalation-prompt">
                    <div className="legal-escalation-prompt-content">
                      <strong className="legal-escalation-prompt-title">
                        You may be leaving ${(comparisonData.summary.total_delta || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} on the table
                      </strong>
                      <p className="legal-escalation-prompt-text">
                        The carrier underpaid by a significant amount relative to industry-standard repair costs.
                        You may have grounds to escalate this claim with a legal partner.
                      </p>
                    </div>
                    <div className="legal-escalation-prompt-actions">
                      <button
                        type="button"
                        className="legal-escalation-btn-primary"
                        onClick={() => setShowLegalEscalationForm(true)}
                      >
                        Pursue Legal Action
                      </button>
                      <button
                        type="button"
                        className="legal-escalation-btn-secondary"
                        onClick={() => setLegalEscalationDismissed(true)}
                      >
                        Skip for Now
                      </button>
                    </div>
                  </div>
                )}

                {/* Legal escalation form */}
                {showLegalEscalationForm && !legalEscalationSubmitted && (() => {
                  // Local form state — use a sub-component pattern with useState inside an IIFE is not valid.
                  // Instead, this form is rendered conditionally and uses uncontrolled inputs read via FormData on submit.
                  // For simplicity, read values from the form element directly on submit.
                  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
                    e.preventDefault()
                    const form = e.currentTarget
                    const fd = new FormData(form)
                    legalEscalationMutation.mutate({
                      legal_partner_name: fd.get('legal_partner_name') as string,
                      legal_partner_email: fd.get('legal_partner_email') as string,
                      owner_name: fd.get('owner_name') as string,
                      owner_email: fd.get('owner_email') as string,
                    })
                  }
                  return (
                    <div className="legal-escalation-form-wrap">
                      <h4 className="legal-escalation-form-title">Escalate to Legal Partner</h4>
                      <form onSubmit={handleSubmit} className="legal-escalation-form">
                        <label className="form-label">
                          Legal Partner Name
                          <input name="legal_partner_name" type="text" required className="form-input" placeholder="Sarah Chen" />
                        </label>
                        <label className="form-label">
                          Legal Partner Email
                          <input name="legal_partner_email" type="email" required className="form-input" placeholder="schen@chenlaw.com" />
                        </label>
                        <label className="form-label">
                          Owner Name
                          <input
                            name="owner_name"
                            type="text"
                            required
                            className="form-input"
                            defaultValue={claim.property?.owner_entity_name || ''}
                          />
                        </label>
                        <label className="form-label">
                          Owner Email
                          <input name="owner_email" type="email" required className="form-input" placeholder="owner@example.com" />
                        </label>
                        {legalEscalationMutation.isError && (
                          <div className="error">Failed to send escalation. Please try again.</div>
                        )}
                        <div className="legal-escalation-form-actions">
                          <button
                            type="button"
                            className="btn-ghost"
                            onClick={() => { setShowLegalEscalationForm(false); setLegalEscalationDismissed(false) }}
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            className="btn-primary"
                            disabled={legalEscalationMutation.isPending}
                          >
                            {legalEscalationMutation.isPending ? 'Sending...' : 'Send Approval Request'}
                          </button>
                        </div>
                      </form>
                    </div>
                  )
                })()}

                {/* Legal escalation confirmation */}
                {legalEscalationSubmitted && (
                  <div className="legal-escalation-confirmation">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{color: '#16a34a', flexShrink: 0}}>
                      <path d="M22 11.08V12a10 10 0 11-5.93-9.14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M22 4L12 14.01l-3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <p>
                      Approval request sent to <strong>{legalEscalationSubmitted.ownerName}</strong> ({legalEscalationSubmitted.ownerEmail}).
                      Once they approve, the legal package will be automatically sent to <strong>{legalEscalationSubmitted.legalPartnerName}</strong>.
                    </p>
                  </div>
                )}

                {/* Already escalated — show status */}
                {claim.legal_escalation_status && (
                  <div className="legal-escalation-status-badge">
                    Legal escalation: {claim.legal_escalation_status.replace(/_/g, ' ')}
                  </div>
                )}
```

> **Note on IIFE form pattern:** The IIFE-with-event-handler pattern above is not idiomatic React. Replace it with a named inline component or use `useRef`/`useState` at the ClaimStepper level for the form fields. The cleaner approach is to declare four state variables at the ClaimStepper level:
> ```ts
> const [legalPartnerName, setLegalPartnerName] = useState('')
> const [legalPartnerEmail, setLegalPartnerEmail] = useState('')
> const [ownerName, setOwnerName] = useState(claim.property?.owner_entity_name || '')
> const [ownerEmail, setOwnerEmail] = useState('')
> ```
> Then use controlled inputs in the form and call `legalEscalationMutation.mutate({...})` directly in the `onSubmit` handler using these state values. Add these four `useState` declarations immediately after the four legal escalation state vars added in Step 2.

### Step 7: Add CSS for the new components

In the `<style>` section of ClaimStepper.tsx (which begins around line 2800), find the `.audit-disc-header-row` block and add the following CSS **after** the existing `.audit-disc-justification` block (around line 3068):

```css
        /* Discrepancy summary row (collapsible) */
        .audit-disc-summary-row {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 16px;
          background: rgba(241, 245, 249, 0.7);
          border-bottom: 1px solid rgba(148, 163, 184, 0.15);
          flex-wrap: wrap;
        }
        .audit-disc-top-gap {
          font-size: 12px;
          color: #64748b;
          flex: 1;
          min-width: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .audit-disc-toggle {
          font-size: 12px;
          font-weight: 600;
          color: #2563eb;
          background: none;
          border: none;
          cursor: pointer;
          padding: 0;
          white-space: nowrap;
        }
        .audit-disc-expanded {
          display: flex;
          flex-direction: column;
        }

        /* Legal escalation prompt */
        .legal-escalation-prompt {
          background: white;
          border: 1px solid rgba(217, 119, 6, 0.3);
          border-left: 3px solid #d97706;
          border-radius: 10px;
          padding: 18px 20px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .legal-escalation-prompt-content {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .legal-escalation-prompt-title {
          font-size: 15px;
          font-weight: 700;
          color: #0f172a;
        }
        .legal-escalation-prompt-text {
          font-size: 13px;
          color: #475569;
          margin: 0;
          line-height: 1.5;
        }
        .legal-escalation-prompt-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }
        .legal-escalation-btn-primary {
          background: #111827;
          color: white;
          border: none;
          border-radius: 8px;
          padding: 10px 20px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
        }
        .legal-escalation-btn-primary:hover {
          background: #1f2937;
        }
        .legal-escalation-btn-secondary {
          background: none;
          color: #64748b;
          border: 1px solid rgba(148, 163, 184, 0.3);
          border-radius: 8px;
          padding: 10px 20px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
        }

        /* Legal escalation form */
        .legal-escalation-form-wrap {
          background: white;
          border: 1px solid rgba(148, 163, 184, 0.2);
          border-radius: 10px;
          padding: 20px;
        }
        .legal-escalation-form-title {
          font-size: 14px;
          font-weight: 700;
          color: #0f172a;
          margin: 0 0 16px 0;
        }
        .legal-escalation-form {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .legal-escalation-form-actions {
          display: flex;
          gap: 10px;
          justify-content: flex-end;
          padding-top: 4px;
        }

        /* Legal escalation confirmation */
        .legal-escalation-confirmation {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          background: rgba(22, 163, 74, 0.06);
          border: 1px solid rgba(22, 163, 74, 0.2);
          border-radius: 10px;
          padding: 14px 16px;
          font-size: 13px;
          color: #166534;
          line-height: 1.5;
        }

        /* Legal escalation status badge */
        .legal-escalation-status-badge {
          font-size: 12px;
          color: #64748b;
          padding: 6px 12px;
          background: rgba(241, 245, 249, 0.7);
          border-radius: 6px;
          text-transform: capitalize;
        }
```

### Step 8: TypeScript check

```bash
cd "/Users/benjaminlopez/Documents/ClaimCoachAI Code/frontend" && npx tsc --noEmit
```

Expected: no errors. Fix any type errors reported.

### Step 9: Commit

```bash
git add frontend/src/types/claim.ts \
        frontend/src/components/ClaimStepper.tsx
git commit -m "feat(ui): collapse discrepancy list + delta threshold logic (rebuttal vs legal prompt) + escalation form in ClaimStepper"
```

---

## Task 9: Frontend — LegalApprovalPage.tsx

**Files:**
- Create: `frontend/src/pages/LegalApprovalPage.tsx`
- Create: `frontend/src/lib/legalApproval.ts`
- Modify: `frontend/src/App.tsx`

### Step 1: Create the API client

Create `frontend/src/lib/legalApproval.ts`:

```ts
import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080'

export interface ApprovalPageData {
  property_address: string
  loss_type: string
  incident_date: string
  carrier_estimate: number
  industry_estimate: number
  delta: number
  owner_name: string
  legal_partner_name: string
  status: 'pending' | 'approved' | 'declined' | 'expired'
}

export async function fetchApprovalData(token: string): Promise<ApprovalPageData | null> {
  const res = await axios.get(`${API_URL}/api/legal-approval/${token}`)
  return res.data.data as ApprovalPageData
}

export async function respondToApproval(token: string, action: 'approve' | 'decline'): Promise<void> {
  await axios.post(`${API_URL}/api/legal-approval/${token}/respond`, { action })
}
```

### Step 2: Create LegalApprovalPage.tsx

Create `frontend/src/pages/LegalApprovalPage.tsx`:

```tsx
import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { fetchApprovalData, respondToApproval, type ApprovalPageData } from '../lib/legalApproval'

export default function LegalApprovalPage() {
  const { token } = useParams<{ token: string }>()
  const [data, setData] = useState<ApprovalPageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [responded, setResponded] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!token) return
    fetchApprovalData(token)
      .then(d => {
        if (!d) {
          setError('This approval link was not found.')
        } else {
          setData(d)
        }
      })
      .catch(() => setError('Failed to load approval details. Please try again.'))
      .finally(() => setLoading(false))
  }, [token])

  const handleRespond = async (action: 'approve' | 'decline') => {
    if (!token) return
    setSubmitting(true)
    try {
      await respondToApproval(token, action)
      setResponded(true)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const fmt = (n: number) =>
    n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const formatDate = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
    })
  }

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <p style={{ color: '#64748b', textAlign: 'center' }}>Loading...</p>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <p style={{ color: '#64748b', textAlign: 'center' }}>
            {error || 'This approval link is no longer active.'}
          </p>
        </div>
      </div>
    )
  }

  // Non-pending status — already responded or expired
  if (data.status !== 'pending') {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <p style={{ color: '#64748b', textAlign: 'center' }}>
            This link is no longer active.
          </p>
        </div>
      </div>
    )
  }

  // Post-response confirmation
  if (responded) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <p style={{ color: '#0f172a', textAlign: 'center', fontSize: 16 }}>
            Thank you, {data.owner_name.split(' ')[0]}. Your decision has been recorded and your property manager has been notified.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        {/* Section A — What happened */}
        <p style={styles.intro}>
          Your property at <strong>{data.property_address}</strong> sustained{' '}
          {data.loss_type.toLowerCase()} damage on{' '}
          {formatDate(data.incident_date)}.
        </p>

        {/* Section B/C — Financial picture */}
        <div style={styles.financialCard}>
          <div style={styles.financialRow}>
            <span style={styles.financialLabel}>Insurance carrier offered:</span>
            <span style={styles.financialValue}>${fmt(data.carrier_estimate)}</span>
          </div>
          <div style={styles.financialRow}>
            <span style={styles.financialLabel}>Industry standard estimate:</span>
            <span style={styles.financialValue}>${fmt(data.industry_estimate)}</span>
          </div>
          <div style={styles.divider} />
          <div style={styles.financialRow}>
            <span style={{ ...styles.financialLabel, fontWeight: 700, color: '#0f172a' }}>Potential underpayment:</span>
            <span style={{ ...styles.financialValue, color: '#d97706', fontWeight: 700, fontSize: 18 }}>
              ${fmt(data.delta)}
            </span>
          </div>
        </div>

        {/* Section D — What happens if you approve */}
        <div style={styles.explainerSection}>
          <p style={styles.explainerTitle}>What happens if you approve:</p>
          <ol style={styles.explainerList}>
            <li>Your property manager will send your full claim file to a legal partner for review.</li>
            <li>The legal partner will assess whether they believe you have grounds for additional compensation.</li>
            <li>If they take your case, they will negotiate with the insurance carrier on your behalf.</li>
            <li>Legal fees are typically contingency-based — you pay nothing unless you recover additional funds.</li>
          </ol>
        </div>

        {/* CTA Row */}
        <div style={styles.ctaRow}>
          <button
            style={styles.declineBtn}
            onClick={() => handleRespond('decline')}
            disabled={submitting}
          >
            Decline
          </button>
          <button
            style={styles.approveBtn}
            onClick={() => handleRespond('approve')}
            disabled={submitting}
          >
            {submitting ? 'Processing...' : 'Approve — Send to Legal Partner'}
          </button>
        </div>

        {error && (
          <p style={{ color: '#dc2626', fontSize: 13, textAlign: 'center', marginTop: 8 }}>{error}</p>
        )}
      </div>
    </div>
  )
}

// Inline styles — no Tailwind dependency, intentional for a standalone public page
const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#f8fafc',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: '40px 16px 80px',
    fontFamily: 'Arial, sans-serif',
  },
  card: {
    background: 'white',
    borderRadius: 12,
    boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
    padding: '36px 40px',
    maxWidth: 560,
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
  },
  intro: {
    fontSize: 15,
    color: '#0f172a',
    lineHeight: 1.6,
    margin: 0,
  },
  financialCard: {
    background: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: 8,
    padding: '16px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  financialRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  financialLabel: {
    fontSize: 14,
    color: '#475569',
  },
  financialValue: {
    fontSize: 15,
    color: '#0f172a',
    fontWeight: 600,
  },
  divider: {
    height: 1,
    background: '#e2e8f0',
    margin: '4px 0',
  },
  explainerSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  explainerTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: '#0f172a',
    margin: 0,
  },
  explainerList: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 1.7,
    paddingLeft: 20,
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  ctaRow: {
    display: 'flex',
    gap: 12,
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
  },
  declineBtn: {
    background: 'none',
    color: '#64748b',
    border: '1px solid #cbd5e1',
    borderRadius: 8,
    padding: '10px 22px',
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
  },
  approveBtn: {
    background: '#111827',
    color: 'white',
    border: 'none',
    borderRadius: 8,
    padding: '10px 22px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
}
```

### Step 3: Register the route in App.tsx

In `frontend/src/App.tsx`:

Add the import at the top (with the other page imports):
```ts
import LegalApprovalPage from './pages/LegalApprovalPage'
```

Add the route alongside the other public routes (after the `/upload/:token` route):
```tsx
              <Route path="/legal-approval/:token" element={<LegalApprovalPage />} />
```

### Step 4: TypeScript check

```bash
cd "/Users/benjaminlopez/Documents/ClaimCoachAI Code/frontend" && npx tsc --noEmit
```

Expected: no errors.

### Step 5: Commit

```bash
git add frontend/src/pages/LegalApprovalPage.tsx \
        frontend/src/lib/legalApproval.ts \
        frontend/src/App.tsx
git commit -m "feat(ui): add LegalApprovalPage standalone homeowner approval page + route /legal-approval/:token"
```

---

## Task 10: TypeScript Check + End-to-End Verification

### Step 1: Full TypeScript check — frontend

```bash
cd "/Users/benjaminlopez/Documents/ClaimCoachAI Code/frontend" && npx tsc --noEmit
```

Expected: 0 errors.

### Step 2: Full Go build — backend

```bash
cd "/Users/benjaminlopez/Documents/ClaimCoachAI Code/backend" && go build ./...
```

Expected: 0 errors.

### Step 3: Go vet

```bash
cd "/Users/benjaminlopez/Documents/ClaimCoachAI Code/backend" && go vet ./...
```

Expected: no output.

### Step 4: Run existing Go tests to verify no regressions

```bash
cd "/Users/benjaminlopez/Documents/ClaimCoachAI Code/backend" && go test ./... -timeout 60s
```

Expected: all existing tests pass (PASS or no test files). New code has no test files yet — that's acceptable for this iteration.

### Step 5: End-to-end smoke test (manual)

Requires a running backend with a real DB connection and SendGrid configured.

**Test A — Below threshold (delta < $500):** Navigate to a claim in Step 6 with a small delta. Verify neither the rebuttal CTA nor the legal prompt appears.

**Test B — Mid range ($500–$9,999.99):** Verify only the rebuttal letter CTA appears.

**Test C — Legal threshold (>= $10,000):**
1. Verify the amber legal prompt appears (no rebuttal CTA).
2. Click "Pursue Legal Action" — form appears.
3. Fill in legal partner + owner details. Click "Send Approval Request".
4. Verify confirmation message appears: "Approval request sent to {owner}..."
5. Check the homeowner email inbox for the approval request email.
6. Click the link in the email, navigate to `/legal-approval/{token}`.
7. Verify the financial picture is correct (carrier, industry, delta).
8. Click "Approve — Send to Legal Partner".
9. Verify page shows confirmation message.
10. Check the legal partner email inbox for the ZIP attachment.
11. Verify the ZIP contains `discrepancy-report.pdf` and `photos/001_...`, `photos/002_...` etc.
12. Open the PDF — verify it shows the header block, line items table, discrepancy comparison table, and footer.
13. Verify the PM receives a confirmation email.

**Test D — Decline path:**
1. Follow steps 1–6 of Test C.
2. Click "Decline" instead.
3. Verify confirmation message appears.
4. Verify no email sent to lawyer.
5. Verify `legal_approval_requests.status = 'declined'` in DB.

**Test E — Already-used link:**
1. After approving (Test C), try to navigate to the same `/legal-approval/{token}` URL again.
2. Verify page shows "This link is no longer active."

### Step 6: Commit any final fixes

```bash
git add -p  # stage only intentional changes
git commit -m "fix: end-to-end verification fixes"
```

---

## Environment Variables Checklist

The following env vars must be set in production (`.env` / Lambda config) before deployment:

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `LEGAL_ESCALATION_THRESHOLD_DOLLARS` | No | `10000` | Tune without deploy |
| `SENDGRID_API_KEY` | Yes | — | Already required |
| `SENDGRID_FROM_EMAIL` | Yes | `noreply@claimcoach.ai` | Already required |
| `FRONTEND_URL` | Yes | — | Already required; used to build approval link |

No new required env vars — all new config has sensible defaults.

---

## Commit Sequence Summary

| Task | Commit message |
|------|---------------|
| 1 | `feat(db): add legal package migration 000011 — claims columns + legal_approval_requests table` |
| 2 | `feat(models): add LegalApprovalRequest model and legal escalation fields on Claim` |
| 3 | `feat(config): add LEGAL_ESCALATION_THRESHOLD_DOLLARS env var (default 10000)` |
| 4 | `chore(deps): add github.com/go-pdf/fpdf for server-side PDF generation` |
| 5 | `feat(services): add LegalPackageService — PDF generation, ZIP assembly, email orchestration` |
| 6 | `feat(email): add SendOwnerApprovalEmail and SendLegalPartnerEmail to interface and SendGrid impl` |
| 7 | `feat(api): add legal package handler and routes (POST escalation, GET/POST approval)` |
| 8 | `feat(ui): collapse discrepancy list + delta threshold logic (rebuttal vs legal prompt) + escalation form in ClaimStepper` |
| 9 | `feat(ui): add LegalApprovalPage standalone homeowner approval page + route /legal-approval/:token` |
| 10 | `fix: end-to-end verification fixes` |
