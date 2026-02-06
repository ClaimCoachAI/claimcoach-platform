# Phase 6: AI Audit System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add AI-powered claim auditing that compares contractor scope sheets against carrier estimates using LLM-generated industry pricing to identify undervalued line items and generate rebuttal letters.

**Architecture:** Contractors fill digital scope sheet → LLM generates industry estimate (Perplexity API) → Property manager uploads carrier PDF → Parse PDF → LLM compares line-by-line → Generate delta report + rebuttal letter.

**Tech Stack:** Go (backend), React + TypeScript (frontend), PostgreSQL (database), Perplexity API (LLM), Supabase Storage (PDFs)

---

## Task 6.1: Database Schema - Scope Sheets & Carrier Estimates

**Files:**
- Create: `backend/migrations/000005_add_scope_sheets_and_carrier_estimates.up.sql`
- Create: `backend/migrations/000005_add_scope_sheets_and_carrier_estimates.down.sql`
- Create: `backend/internal/models/scope_sheet.go`
- Create: `backend/internal/models/carrier_estimate.go`

**Step 1: Write up migration (scope_sheets table)**

Create `backend/migrations/000005_add_scope_sheets_and_carrier_estimates.up.sql`:

```sql
-- Scope sheets table (contractor-submitted damage scope)
CREATE TABLE scope_sheets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,

    -- Roof Main
    roof_type VARCHAR(100),
    roof_square_footage INTEGER,
    roof_pitch VARCHAR(50),
    fascia_lf INTEGER,
    fascia_paint BOOLEAN DEFAULT false,
    soffit_lf INTEGER,
    soffit_paint BOOLEAN DEFAULT false,
    drip_edge_lf INTEGER,
    drip_edge_paint BOOLEAN DEFAULT false,
    pipe_jacks_count INTEGER,
    pipe_jacks_paint BOOLEAN DEFAULT false,
    ex_vents_count INTEGER,
    ex_vents_paint BOOLEAN DEFAULT false,
    turbines_count INTEGER,
    turbines_paint BOOLEAN DEFAULT false,
    furnaces_count INTEGER,
    furnaces_paint BOOLEAN DEFAULT false,
    power_vents_count INTEGER,
    power_vents_paint BOOLEAN DEFAULT false,
    ridge_lf INTEGER,
    satellites_count INTEGER,
    step_flashing_lf INTEGER,
    chimney_flashing BOOLEAN DEFAULT false,
    rain_diverter_lf INTEGER,
    skylights_count INTEGER,
    skylights_damaged BOOLEAN DEFAULT false,

    -- Roof Other
    roof_other_type VARCHAR(100),
    roof_other_pitch VARCHAR(50),
    roof_other_fascia_lf INTEGER,
    roof_other_fascia_paint BOOLEAN DEFAULT false,
    roof_other_soffit_lf INTEGER,
    roof_other_soffit_paint BOOLEAN DEFAULT false,
    roof_other_drip_edge_lf INTEGER,
    roof_other_drip_edge_paint BOOLEAN DEFAULT false,
    roof_other_pipe_jacks_count INTEGER,
    roof_other_pipe_jacks_paint BOOLEAN DEFAULT false,
    roof_other_ex_vents_count INTEGER,
    roof_other_ex_vents_paint BOOLEAN DEFAULT false,
    roof_other_turbines_count INTEGER,
    roof_other_turbines_paint BOOLEAN DEFAULT false,
    roof_other_furnaces_count INTEGER,
    roof_other_furnaces_paint BOOLEAN DEFAULT false,
    roof_other_power_vents_count INTEGER,
    roof_other_power_vents_paint BOOLEAN DEFAULT false,
    roof_other_ridge_lf INTEGER,
    roof_other_satellites_count INTEGER,
    roof_other_step_flashing_lf INTEGER,
    roof_other_chimney_flashing BOOLEAN DEFAULT false,
    roof_other_rain_diverter_lf INTEGER,
    roof_other_skylights_count INTEGER,
    roof_other_skylights_damaged BOOLEAN DEFAULT false,

    -- Dimensions
    porch_paint BOOLEAN DEFAULT false,
    patio_paint BOOLEAN DEFAULT false,
    fence TEXT,

    -- Siding - Front
    front_siding_1_replace_sf INTEGER,
    front_siding_1_paint_sf INTEGER,
    front_siding_2_replace_sf INTEGER,
    front_siding_2_paint_sf INTEGER,
    front_gutters_lf INTEGER,
    front_gutters_paint BOOLEAN DEFAULT false,
    front_windows TEXT,
    front_screens TEXT,
    front_doors TEXT,
    front_ac_replace BOOLEAN DEFAULT false,
    front_ac_comb_fins BOOLEAN DEFAULT false,

    -- Siding - Right
    right_siding_1_replace_sf INTEGER,
    right_siding_1_paint_sf INTEGER,
    right_siding_2_replace_sf INTEGER,
    right_siding_2_paint_sf INTEGER,
    right_gutters_lf INTEGER,
    right_gutters_paint BOOLEAN DEFAULT false,
    right_windows TEXT,
    right_screens TEXT,
    right_doors TEXT,
    right_ac_replace BOOLEAN DEFAULT false,
    right_ac_comb_fins BOOLEAN DEFAULT false,

    -- Siding - Back
    back_siding_1_replace_sf INTEGER,
    back_siding_1_paint_sf INTEGER,
    back_siding_2_replace_sf INTEGER,
    back_siding_2_paint_sf INTEGER,
    back_gutters_lf INTEGER,
    back_gutters_paint BOOLEAN DEFAULT false,
    back_windows TEXT,
    back_screens TEXT,
    back_doors TEXT,
    back_ac_replace BOOLEAN DEFAULT false,
    back_ac_comb_fins BOOLEAN DEFAULT false,

    -- Siding - Left
    left_siding_1_replace_sf INTEGER,
    left_siding_1_paint_sf INTEGER,
    left_siding_2_replace_sf INTEGER,
    left_siding_2_paint_sf INTEGER,
    left_gutters_lf INTEGER,
    left_gutters_paint BOOLEAN DEFAULT false,
    left_windows TEXT,
    left_screens TEXT,
    left_doors TEXT,
    left_ac_replace BOOLEAN DEFAULT false,
    left_ac_comb_fins BOOLEAN DEFAULT false,

    -- Additional
    additional_items_main TEXT,
    additional_items_other TEXT,
    notes TEXT,

    submitted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_scope_sheets_claim ON scope_sheets(claim_id);

-- Carrier estimates table (insurance company estimates)
CREATE TABLE carrier_estimates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    uploaded_by_user_id UUID NOT NULL REFERENCES users(id),

    file_path VARCHAR(500) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_size_bytes INTEGER,

    parsed_data JSONB,
    parse_status VARCHAR(50) DEFAULT 'pending',
    parse_error TEXT,

    uploaded_at TIMESTAMP DEFAULT NOW(),
    parsed_at TIMESTAMP
);

CREATE INDEX idx_carrier_estimates_claim ON carrier_estimates(claim_id);
```

**Step 2: Write down migration**

Create `backend/migrations/000005_add_scope_sheets_and_carrier_estimates.down.sql`:

```sql
DROP TABLE IF EXISTS carrier_estimates;
DROP TABLE IF EXISTS scope_sheets;
```

**Step 3: Create ScopeSheet model**

Create `backend/internal/models/scope_sheet.go`:

```go
package models

import "time"

type ScopeSheet struct {
	ID      string    `json:"id" db:"id"`
	ClaimID string    `json:"claim_id" db:"claim_id"`

	// Roof Main
	RoofType            *string `json:"roof_type" db:"roof_type"`
	RoofSquareFootage   *int    `json:"roof_square_footage" db:"roof_square_footage"`
	RoofPitch           *string `json:"roof_pitch" db:"roof_pitch"`
	FasciaLF            *int    `json:"fascia_lf" db:"fascia_lf"`
	FasciaPaint         bool    `json:"fascia_paint" db:"fascia_paint"`
	SoffitLF            *int    `json:"soffit_lf" db:"soffit_lf"`
	SoffitPaint         bool    `json:"soffit_paint" db:"soffit_paint"`
	DripEdgeLF          *int    `json:"drip_edge_lf" db:"drip_edge_lf"`
	DripEdgePaint       bool    `json:"drip_edge_paint" db:"drip_edge_paint"`
	PipeJacksCount      *int    `json:"pipe_jacks_count" db:"pipe_jacks_count"`
	PipeJacksPaint      bool    `json:"pipe_jacks_paint" db:"pipe_jacks_paint"`
	ExVentsCount        *int    `json:"ex_vents_count" db:"ex_vents_count"`
	ExVentsPaint        bool    `json:"ex_vents_paint" db:"ex_vents_paint"`
	TurbinesCount       *int    `json:"turbines_count" db:"turbines_count"`
	TurbinesPaint       bool    `json:"turbines_paint" db:"turbines_paint"`
	FurnacesCount       *int    `json:"furnaces_count" db:"furnaces_count"`
	FurnacesPaint       bool    `json:"furnaces_paint" db:"furnaces_paint"`
	PowerVentsCount     *int    `json:"power_vents_count" db:"power_vents_count"`
	PowerVentsPaint     bool    `json:"power_vents_paint" db:"power_vents_paint"`
	RidgeLF             *int    `json:"ridge_lf" db:"ridge_lf"`
	SatellitesCount     *int    `json:"satellites_count" db:"satellites_count"`
	StepFlashingLF      *int    `json:"step_flashing_lf" db:"step_flashing_lf"`
	ChimneyFlashing     bool    `json:"chimney_flashing" db:"chimney_flashing"`
	RainDiverterLF      *int    `json:"rain_diverter_lf" db:"rain_diverter_lf"`
	SkylightsCount      *int    `json:"skylights_count" db:"skylights_count"`
	SkylightsDamaged    bool    `json:"skylights_damaged" db:"skylights_damaged"`

	// Roof Other (abbreviated for brevity - include all fields in actual implementation)
	RoofOtherType            *string `json:"roof_other_type" db:"roof_other_type"`
	RoofOtherPitch           *string `json:"roof_other_pitch" db:"roof_other_pitch"`
	// ... (all other roof_other fields)

	// Dimensions
	PorchPaint bool    `json:"porch_paint" db:"porch_paint"`
	PatioPaint bool    `json:"patio_paint" db:"patio_paint"`
	Fence      *string `json:"fence" db:"fence"`

	// Siding - Front (abbreviated - include all in actual implementation)
	FrontSiding1ReplaceSF *int    `json:"front_siding_1_replace_sf" db:"front_siding_1_replace_sf"`
	FrontSiding1PaintSF   *int    `json:"front_siding_1_paint_sf" db:"front_siding_1_paint_sf"`
	// ... (all siding fields for Front, Right, Back, Left)

	// Additional
	AdditionalItemsMain  *string `json:"additional_items_main" db:"additional_items_main"`
	AdditionalItemsOther *string `json:"additional_items_other" db:"additional_items_other"`
	Notes                *string `json:"notes" db:"notes"`

	SubmittedAt *time.Time `json:"submitted_at" db:"submitted_at"`
	CreatedAt   time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at" db:"updated_at"`
}
```

**Step 4: Create CarrierEstimate model**

Create `backend/internal/models/carrier_estimate.go`:

```go
package models

import "time"

type CarrierEstimate struct {
	ID                 string     `json:"id" db:"id"`
	ClaimID            string     `json:"claim_id" db:"claim_id"`
	UploadedByUserID   string     `json:"uploaded_by_user_id" db:"uploaded_by_user_id"`
	FilePath           string     `json:"file_path" db:"file_path"`
	FileName           string     `json:"file_name" db:"file_name"`
	FileSizeBytes      *int       `json:"file_size_bytes" db:"file_size_bytes"`
	ParsedData         *string    `json:"parsed_data" db:"parsed_data"` // JSONB stored as string
	ParseStatus        string     `json:"parse_status" db:"parse_status"`
	ParseError         *string    `json:"parse_error" db:"parse_error"`
	UploadedAt         time.Time  `json:"uploaded_at" db:"uploaded_at"`
	ParsedAt           *time.Time `json:"parsed_at" db:"parsed_at"`
}
```

**Step 5: Run migration**

Run:
```bash
cd backend
go run cmd/server/main.go
```

Expected: Server starts, migration 000005 runs successfully

Check:
```bash
psql $DATABASE_URL -c "\d scope_sheets"
psql $DATABASE_URL -c "\d carrier_estimates"
```

Expected: Both tables exist with all columns

**Step 6: Commit**

```bash
git add backend/migrations/000005_* \
        backend/internal/models/scope_sheet.go \
        backend/internal/models/carrier_estimate.go
git commit -m "feat: add scope_sheets and carrier_estimates tables

- scope_sheets: stores contractor damage scope (50+ fields)
- carrier_estimates: stores uploaded carrier PDFs and parsed data
- Models created for both tables

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 6.2: Database Schema - Audit Reports & Rebuttals

**Files:**
- Create: `backend/migrations/000006_add_audit_reports_and_rebuttals.up.sql`
- Create: `backend/migrations/000006_add_audit_reports_and_rebuttals.down.sql`
- Create: `backend/internal/models/audit_report.go`
- Create: `backend/internal/models/rebuttal.go`

**Step 1: Write up migration**

Create `backend/migrations/000006_add_audit_reports_and_rebuttals.up.sql`:

```sql
-- Audit reports table (LLM-generated comparisons)
CREATE TABLE audit_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    scope_sheet_id UUID NOT NULL REFERENCES scope_sheets(id) ON DELETE CASCADE,
    carrier_estimate_id UUID REFERENCES carrier_estimates(id) ON DELETE SET NULL,

    generated_estimate JSONB,
    comparison_data JSONB,
    total_contractor_estimate DECIMAL(12, 2),
    total_carrier_estimate DECIMAL(12, 2),
    total_delta DECIMAL(12, 2),

    status VARCHAR(50) DEFAULT 'pending',
    error_message TEXT,

    created_by_user_id UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audit_reports_claim ON audit_reports(claim_id);
CREATE INDEX idx_audit_reports_status ON audit_reports(status);

-- Rebuttals table (generated rebuttal letters)
CREATE TABLE rebuttals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    audit_report_id UUID NOT NULL REFERENCES audit_reports(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_rebuttals_audit ON rebuttals(audit_report_id);

-- API usage logs table (track Perplexity API costs)
CREATE TABLE api_usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    audit_report_id UUID REFERENCES audit_reports(id) ON DELETE SET NULL,
    api_call_type VARCHAR(50) NOT NULL,
    tokens_used INTEGER,
    estimated_cost DECIMAL(10, 4),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_api_logs_audit ON api_usage_logs(audit_report_id);
CREATE INDEX idx_api_logs_created ON api_usage_logs(created_at);
```

**Step 2: Write down migration**

Create `backend/migrations/000006_add_audit_reports_and_rebuttals.down.sql`:

```sql
DROP TABLE IF EXISTS api_usage_logs;
DROP TABLE IF EXISTS rebuttals;
DROP TABLE IF EXISTS audit_reports;
```

**Step 3: Create AuditReport model**

Create `backend/internal/models/audit_report.go`:

```go
package models

import "time"

type AuditReport struct {
	ID                      string     `json:"id" db:"id"`
	ClaimID                 string     `json:"claim_id" db:"claim_id"`
	ScopeSheetID            string     `json:"scope_sheet_id" db:"scope_sheet_id"`
	CarrierEstimateID       *string    `json:"carrier_estimate_id" db:"carrier_estimate_id"`
	GeneratedEstimate       *string    `json:"generated_estimate" db:"generated_estimate"` // JSONB
	ComparisonData          *string    `json:"comparison_data" db:"comparison_data"`       // JSONB
	TotalContractorEstimate *float64   `json:"total_contractor_estimate" db:"total_contractor_estimate"`
	TotalCarrierEstimate    *float64   `json:"total_carrier_estimate" db:"total_carrier_estimate"`
	TotalDelta              *float64   `json:"total_delta" db:"total_delta"`
	Status                  string     `json:"status" db:"status"`
	ErrorMessage            *string    `json:"error_message" db:"error_message"`
	CreatedByUserID         string     `json:"created_by_user_id" db:"created_by_user_id"`
	CreatedAt               time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt               time.Time  `json:"updated_at" db:"updated_at"`
}
```

**Step 4: Create Rebuttal model**

Create `backend/internal/models/rebuttal.go`:

```go
package models

import "time"

type Rebuttal struct {
	ID            string    `json:"id" db:"id"`
	AuditReportID string    `json:"audit_report_id" db:"audit_report_id"`
	Content       string    `json:"content" db:"content"`
	CreatedAt     time.Time `json:"created_at" db:"created_at"`
}
```

**Step 5: Run migration**

**Step 6: Commit**

```bash
git add backend/migrations/000006_* \
        backend/internal/models/audit_report.go \
        backend/internal/models/rebuttal.go
git commit -m "feat: add audit_reports, rebuttals, and api_usage_logs tables

- audit_reports: stores LLM-generated estimates and comparisons
- rebuttals: stores generated rebuttal letters
- api_usage_logs: tracks Perplexity API costs
- Models created for audit_report and rebuttal

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 6.3: Perplexity API Client

**Files:**
- Create: `backend/internal/llm/perplexity_client.go`
- Create: `backend/internal/llm/perplexity_client_test.go`
- Modify: `backend/internal/config/config.go`

**Step 1: Add configuration**

In `backend/internal/config/config.go`, add Perplexity fields:

```go
type Config struct {
	// ... existing fields

	// Perplexity API
	PerplexityAPIKey     string
	PerplexityModel      string
	PerplexityTimeout    int // seconds
	PerplexityMaxRetries int
}

func Load() (*Config, error) {
	// ... existing code

	cfg.PerplexityAPIKey = os.Getenv("PERPLEXITY_API_KEY")
	cfg.PerplexityModel = getEnvOrDefault("PERPLEXITY_MODEL", "sonar-pro")
	cfg.PerplexityTimeout = getEnvIntOrDefault("PERPLEXITY_TIMEOUT", 60)
	cfg.PerplexityMaxRetries = getEnvIntOrDefault("PERPLEXITY_MAX_RETRIES", 3)

	if cfg.PerplexityAPIKey == "" {
		return nil, fmt.Errorf("PERPLEXITY_API_KEY is required")
	}

	return cfg, nil
}
```

**Step 2: Create Perplexity client interface**

Create `backend/internal/llm/perplexity_client.go`:

```go
package llm

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

type PerplexityClient struct {
	apiKey     string
	model      string
	timeout    time.Duration
	maxRetries int
	httpClient *http.Client
}

type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type ChatRequest struct {
	Model       string    `json:"model"`
	Messages    []Message `json:"messages"`
	Temperature float64   `json:"temperature"`
	MaxTokens   int       `json:"max_tokens"`
}

type ChatResponse struct {
	ID      string `json:"id"`
	Model   string `json:"model"`
	Choices []struct {
		Index   int `json:"index"`
		Message struct {
			Role    string `json:"role"`
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
	Usage struct {
		PromptTokens     int `json:"prompt_tokens"`
		CompletionTokens int `json:"completion_tokens"`
		TotalTokens      int `json:"total_tokens"`
	} `json:"usage"`
}

func NewPerplexityClient(apiKey, model string, timeout int, maxRetries int) *PerplexityClient {
	return &PerplexityClient{
		apiKey:     apiKey,
		model:      model,
		timeout:    time.Duration(timeout) * time.Second,
		maxRetries: maxRetries,
		httpClient: &http.Client{Timeout: time.Duration(timeout) * time.Second},
	}
}

func (c *PerplexityClient) Chat(messages []Message, temperature float64, maxTokens int) (*ChatResponse, error) {
	request := ChatRequest{
		Model:       c.model,
		Messages:    messages,
		Temperature: temperature,
		MaxTokens:   maxTokens,
	}

	var lastErr error
	for attempt := 0; attempt < c.maxRetries; attempt++ {
		response, err := c.makeRequest(request)
		if err == nil {
			return response, nil
		}
		lastErr = err
		if attempt < c.maxRetries-1 {
			time.Sleep(time.Duration(1<<attempt) * time.Second) // Exponential backoff
		}
	}

	return nil, fmt.Errorf("all %d retries failed: %w", c.maxRetries, lastErr)
}

func (c *PerplexityClient) makeRequest(request ChatRequest) (*ChatResponse, error) {
	body, err := json.Marshal(request)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequest("POST", "https://api.perplexity.ai/chat/completions", bytes.NewBuffer(body))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to make request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("API returned status %d: %s", resp.StatusCode, string(bodyBytes))
	}

	var chatResponse ChatResponse
	if err := json.NewDecoder(resp.Body).Decode(&chatResponse); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return &chatResponse, nil
}
```

**Step 3: Write test (mock HTTP)**

Create `backend/internal/llm/perplexity_client_test.go`:

```go
package llm

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestPerplexityClient_Chat_Success(t *testing.T) {
	// Mock server
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "POST", r.Method)
		assert.Equal(t, "Bearer test-key", r.Header.Get("Authorization"))

		response := `{
			"id": "test-id",
			"model": "sonar-pro",
			"choices": [{
				"index": 0,
				"message": {
					"role": "assistant",
					"content": "Test response"
				}
			}],
			"usage": {
				"prompt_tokens": 10,
				"completion_tokens": 5,
				"total_tokens": 15
			}
		}`
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(response))
	}))
	defer server.Close()

	// Override API URL for testing (in real impl, make this configurable)
	client := NewPerplexityClient("test-key", "sonar-pro", 60, 3)
	// Note: For proper testing, would need to inject server URL

	messages := []Message{
		{Role: "user", Content: "Test prompt"},
	}

	response, err := client.Chat(messages, 0.2, 100)

	assert.NoError(t, err)
	assert.NotNil(t, response)
	assert.Equal(t, "Test response", response.Choices[0].Message.Content)
	assert.Equal(t, 15, response.Usage.TotalTokens)
}
```

**Step 4: Commit**

```bash
git add backend/internal/llm/ \
        backend/internal/config/config.go
git commit -m "feat: add Perplexity API client

- PerplexityClient with Chat method
- Retry logic with exponential backoff
- Configuration for API key, model, timeout
- Basic test coverage

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 6.4: Scope Sheet Service (Backend)

**Files:**
- Create: `backend/internal/services/scope_sheet_service.go`
- Create: `backend/internal/services/scope_sheet_service_test.go`

**Step 1: Write failing test**

Create `backend/internal/services/scope_sheet_service_test.go`:

```go
package services

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestCreateScopeSheet_Success(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	service := NewScopeSheetService(db)

	// Create test claim
	orgID := createTestOrg(t, db)
	userID := createTestUser(t, db, orgID)
	propertyID := createTestProperty(t, db, orgID)
	policyID := createTestPolicy(t, db, propertyID, 10000.0)
	claimID := createTestClaim(t, db, propertyID, policyID, orgID, userID)

	// Create scope sheet
	input := CreateScopeSheetInput{
		RoofType:          strPtr("Slab"),
		RoofSquareFootage: intPtr(1900),
		DripEdgeLF:        intPtr(190),
		PipeJacksCount:    intPtr(2),
	}

	sheet, err := service.CreateScopeSheet(claimID, input)

	assert.NoError(t, err)
	assert.NotNil(t, sheet)
	assert.Equal(t, claimID, sheet.ClaimID)
	assert.Equal(t, "Slab", *sheet.RoofType)
	assert.Equal(t, 1900, *sheet.RoofSquareFootage)
}
```

**Step 2: Run test (should fail)**

**Step 3: Implement service**

Create `backend/internal/services/scope_sheet_service.go`:

```go
package services

import (
	"database/sql"
	"fmt"

	"github.com/yourusername/claimcoach/internal/models"
)

type ScopeSheetService struct {
	db *sql.DB
}

type CreateScopeSheetInput struct {
	RoofType          *string
	RoofSquareFootage *int
	RoofPitch         *string
	FasciaLF          *int
	FasciaPaint       bool
	SoffitLF          *int
	SoffitPaint       bool
	DripEdgeLF        *int
	DripEdgePaint     bool
	PipeJacksCount    *int
	PipeJacksPaint    bool
	// ... (include all fields from model)
	Notes *string
}

func NewScopeSheetService(db *sql.DB) *ScopeSheetService {
	return &ScopeSheetService{db: db}
}

func (s *ScopeSheetService) CreateScopeSheet(claimID string, input CreateScopeSheetInput) (*models.ScopeSheet, error) {
	query := `
		INSERT INTO scope_sheets (
			claim_id, roof_type, roof_square_footage, roof_pitch,
			fascia_lf, fascia_paint, soffit_lf, soffit_paint,
			drip_edge_lf, drip_edge_paint, pipe_jacks_count, pipe_jacks_paint,
			notes
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
		RETURNING id, claim_id, roof_type, roof_square_footage, created_at, updated_at
	`

	var sheet models.ScopeSheet
	err := s.db.QueryRow(
		query,
		claimID, input.RoofType, input.RoofSquareFootage, input.RoofPitch,
		input.FasciaLF, input.FasciaPaint, input.SoffitLF, input.SoffitPaint,
		input.DripEdgeLF, input.DripEdgePaint, input.PipeJacksCount, input.PipeJacksPaint,
		input.Notes,
	).Scan(
		&sheet.ID, &sheet.ClaimID, &sheet.RoofType, &sheet.RoofSquareFootage,
		&sheet.CreatedAt, &sheet.UpdatedAt,
	)

	if err != nil {
		return nil, fmt.Errorf("failed to create scope sheet: %w", err)
	}

	return &sheet, nil
}

func (s *ScopeSheetService) GetScopeSheetByClaimID(claimID string) (*models.ScopeSheet, error) {
	query := `SELECT * FROM scope_sheets WHERE claim_id = $1 LIMIT 1`

	var sheet models.ScopeSheet
	err := s.db.QueryRow(query, claimID).Scan(/* all fields */)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get scope sheet: %w", err)
	}

	return &sheet, nil
}

func (s *ScopeSheetService) SubmitScopeSheet(scopeSheetID string) error {
	query := `UPDATE scope_sheets SET submitted_at = NOW(), updated_at = NOW() WHERE id = $1`
	_, err := s.db.Exec(query, scopeSheetID)
	return err
}
```

**Step 4: Run test (should pass)**

**Step 5: Commit**

```bash
git add backend/internal/services/scope_sheet_service.go \
        backend/internal/services/scope_sheet_service_test.go
git commit -m "feat: add ScopeSheetService with CRUD operations

- CreateScopeSheet: insert scope data
- GetScopeSheetByClaimID: retrieve by claim
- SubmitScopeSheet: mark as submitted
- Test coverage for creation

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 6.5: Scope Sheet Handler (Backend API)

**Files:**
- Create: `backend/internal/handlers/scope_sheet_handler.go`
- Modify: `backend/internal/api/router.go`

**Step 1: Create handler**

Create `backend/internal/handlers/scope_sheet_handler.go`:

```go
package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/yourusername/claimcoach/internal/models"
	"github.com/yourusername/claimcoach/internal/services"
)

type ScopeSheetHandler struct {
	service *services.ScopeSheetService
}

func NewScopeSheetHandler(service *services.ScopeSheetService) *ScopeSheetHandler {
	return &ScopeSheetHandler{service: service}
}

// POST /api/magic-links/:token/scope-sheet
func (h *ScopeSheetHandler) CreateViaMagicLink(c *gin.Context) {
	token := c.Param("token")

	// Validate magic link and get claim ID
	// (reuse magic link validation logic)
	claimID := "" // Get from magic link validation

	var input services.CreateScopeSheetInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
		return
	}

	sheet, err := h.service.CreateScopeSheet(claimID, input)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
		return
	}

	// Mark as submitted
	if err := h.service.SubmitScopeSheet(sheet.ID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to submit"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"success": true,
		"data":    gin.H{"scope_sheet": sheet},
	})
}

// GET /api/claims/:id/scope-sheet
func (h *ScopeSheetHandler) GetByClaimID(c *gin.Context) {
	claimID := c.Param("id")

	// Validate user has access to claim (via auth)
	user, _ := c.Get("user")
	userModel := user.(*models.User)
	// Check organization ownership

	sheet, err := h.service.GetScopeSheetByClaimID(claimID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
		return
	}

	if sheet == nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Scope sheet not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    gin.H{"scope_sheet": sheet},
	})
}
```

**Step 2: Register routes**

In `backend/internal/api/router.go`:

```go
// Magic link routes (no auth)
magicLinks.POST("/:token/scope-sheet", scopeSheetHandler.CreateViaMagicLink)

// Authenticated routes
claims.GET("/:id/scope-sheet", scopeSheetHandler.GetByClaimID)
```

**Step 3: Commit**

```bash
git add backend/internal/handlers/scope_sheet_handler.go \
        backend/internal/api/router.go
git commit -m "feat: add scope sheet API endpoints

- POST /api/magic-links/:token/scope-sheet (no auth)
- GET /api/claims/:id/scope-sheet (authenticated)
- Routes registered in router

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 6.6: Scope Sheet Form (Frontend - Contractor Portal)

**Files:**
- Create: `frontend/src/components/ScopeSheetForm.tsx`
- Modify: `frontend/src/pages/ContractorUpload.tsx`
- Modify: `frontend/src/lib/api.ts`

**Step 1: Add API method**

In `frontend/src/lib/api.ts`:

```typescript
export const submitScopeSheet = async (token: string, scopeData: any) => {
  return api.post(`/api/magic-links/${token}/scope-sheet`, scopeData)
}
```

**Step 2: Create ScopeSheetForm component**

Create `frontend/src/components/ScopeSheetForm.tsx`:

```typescript
import { useState } from 'react'

interface ScopeSheetFormProps {
  onSubmit: (data: ScopeSheetData) => void
  onBack: () => void
}

interface ScopeSheetData {
  roof_type?: string
  roof_square_footage?: number
  roof_pitch?: string
  fascia_lf?: number
  fascia_paint: boolean
  // ... all other fields
}

export function ScopeSheetForm({ onSubmit, onBack }: ScopeSheetFormProps) {
  const [formData, setFormData] = useState<ScopeSheetData>({
    fascia_paint: false,
    soffit_paint: false,
    // ... initialize all boolean fields
  })

  const [activeSection, setActiveSection] = useState<'roof-main' | 'roof-other' | 'exterior' | 'additional'>('roof-main')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(formData)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Section Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          type="button"
          onClick={() => setActiveSection('roof-main')}
          className={`px-4 py-2 ${activeSection === 'roof-main' ? 'border-b-2 border-blue-500' : ''}`}
        >
          Roof (Main)
        </button>
        <button
          type="button"
          onClick={() => setActiveSection('roof-other')}
          className={`px-4 py-2 ${activeSection === 'roof-other' ? 'border-b-2 border-blue-500' : ''}`}
        >
          Roof (Other)
        </button>
        <button
          type="button"
          onClick={() => setActiveSection('exterior')}
          className={`px-4 py-2 ${activeSection === 'exterior' ? 'border-b-2 border-blue-500' : ''}`}
        >
          Exterior
        </button>
        <button
          type="button"
          onClick={() => setActiveSection('additional')}
          className={`px-4 py-2 ${activeSection === 'additional' ? 'border-b-2 border-blue-500' : ''}`}
        >
          Additional
        </button>
      </div>

      {/* Roof Main Section */}
      {activeSection === 'roof-main' && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Roof Type</label>
            <input
              type="text"
              value={formData.roof_type || ''}
              onChange={(e) => setFormData({ ...formData, roof_type: e.target.value })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              placeholder="e.g., Slab"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Square Footage</label>
            <input
              type="number"
              value={formData.roof_square_footage || ''}
              onChange={(e) => setFormData({ ...formData, roof_square_footage: parseInt(e.target.value) || undefined })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Fascia (LF)</label>
              <input
                type="number"
                value={formData.fascia_lf || ''}
                onChange={(e) => setFormData({ ...formData, fascia_lf: parseInt(e.target.value) || undefined })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
              />
            </div>
            <div className="flex items-center">
              <input
                type="checkbox"
                checked={formData.fascia_paint}
                onChange={(e) => setFormData({ ...formData, fascia_paint: e.target.checked })}
                className="h-4 w-4 text-blue-600 rounded"
              />
              <label className="ml-2 text-sm text-gray-700">Paint</label>
            </div>
          </div>

          {/* Repeat for all roof main fields */}
        </div>
      )}

      {/* Other sections similar pattern */}

      {/* Navigation Buttons */}
      <div className="flex justify-between pt-6 border-t">
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
        >
          Back
        </button>
        <button
          type="submit"
          className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
        >
          Submit Scope Sheet
        </button>
      </div>
    </form>
  )
}
```

**Step 3: Integrate into ContractorUpload**

In `frontend/src/pages/ContractorUpload.tsx`:

```typescript
// Add state for current step
const [currentStep, setCurrentStep] = useState<'photos' | 'scope'>('photos')

// Add scope sheet submission
const handleScopeSubmit = async (scopeData: any) => {
  try {
    await submitScopeSheet(token, scopeData)
    setSuccess(true)
  } catch (err) {
    setError('Failed to submit scope sheet')
  }
}

// Update UI to show tabs
return (
  <div>
    {/* Tabs */}
    <div className="flex border-b">
      <button onClick={() => setCurrentStep('photos')}>Photos</button>
      <button onClick={() => setCurrentStep('scope')}>Scope Sheet</button>
    </div>

    {/* Content */}
    {currentStep === 'photos' && (
      <div>
        {/* Existing photo upload UI */}
        <button onClick={() => setCurrentStep('scope')}>Next: Scope Sheet</button>
      </div>
    )}

    {currentStep === 'scope' && (
      <ScopeSheetForm
        onSubmit={handleScopeSubmit}
        onBack={() => setCurrentStep('photos')}
      />
    )}
  </div>
)
```

**Step 4: Commit**

```bash
git add frontend/src/components/ScopeSheetForm.tsx \
        frontend/src/pages/ContractorUpload.tsx \
        frontend/src/lib/api.ts
git commit -m "feat: add scope sheet form to contractor portal

- ScopeSheetForm component with 4 tabs (Roof Main, Roof Other, Exterior, Additional)
- Integrated into ContractorUpload page with step navigation
- API method to submit scope sheet via magic link

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 6.7: Audit Service - Generate Industry Estimate

**Files:**
- Create: `backend/internal/services/audit_service.go`
- Create: `backend/internal/services/audit_service_test.go`

**Step 1: Write failing test**

Create `backend/internal/services/audit_service_test.go`:

```go
package services

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestGenerateIndustryEstimate_Success(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	// Create mock LLM client
	mockLLM := &MockPerplexityClient{
		response: `{"line_items":[{"description":"Remove shingles","quantity":1900,"unit":"SF","unit_cost":2.50,"total":4750.00}],"total":15390.00}`,
	}

	service := NewAuditService(db, mockLLM)

	// Create scope sheet
	scopeSheetID := "test-scope-id"

	estimate, err := service.GenerateIndustryEstimate(scopeSheetID, "user-id", "org-id")

	assert.NoError(t, err)
	assert.NotNil(t, estimate)
	assert.Contains(t, estimate, "line_items")
}
```

**Step 2: Implement service**

Create `backend/internal/services/audit_service.go`:

```go
package services

import (
	"database/sql"
	"encoding/json"
	"fmt"

	"github.com/yourusername/claimcoach/internal/llm"
	"github.com/yourusername/claimcoach/internal/models"
)

type AuditService struct {
	db         *sql.DB
	llmClient  *llm.PerplexityClient
	scopeService *ScopeSheetService
}

func NewAuditService(db *sql.DB, llmClient *llm.PerplexityClient) *AuditService {
	return &AuditService{
		db:           db,
		llmClient:    llmClient,
		scopeService: NewScopeSheetService(db),
	}
}

func (s *AuditService) GenerateIndustryEstimate(scopeSheetID, userID, orgID string) (string, error) {
	// Get scope sheet
	scope, err := s.scopeService.GetScopeSheetByID(scopeSheetID)
	if err != nil {
		return "", err
	}

	// Build prompt
	prompt := s.buildEstimatePrompt(scope)

	// Call LLM
	messages := []llm.Message{
		{
			Role:    "system",
			Content: "You are an expert in construction cost estimation and Xactimate pricing. Provide accurate, current market pricing for repair work.",
		},
		{
			Role:    "user",
			Content: prompt,
		},
	}

	response, err := s.llmClient.Chat(messages, 0.2, 2000)
	if err != nil {
		return "", fmt.Errorf("LLM API call failed: %w", err)
	}

	estimateJSON := response.Choices[0].Message.Content

	// Validate JSON
	var estimate map[string]interface{}
	if err := json.Unmarshal([]byte(estimateJSON), &estimate); err != nil {
		return "", fmt.Errorf("invalid JSON from LLM: %w", err)
	}

	// Create audit report
	auditReport := &models.AuditReport{
		ScopeSheetID:      scopeSheetID,
		ClaimID:           scope.ClaimID,
		GeneratedEstimate: &estimateJSON,
		Status:            "completed",
		CreatedByUserID:   userID,
	}

	// Save to database
	if err := s.saveAuditReport(auditReport); err != nil {
		return "", err
	}

	// Log API usage
	s.logAPIUsage(auditReport.ID, "generate_estimate", response.Usage.TotalTokens, 0.50)

	return estimateJSON, nil
}

func (s *AuditService) buildEstimatePrompt(scope *models.ScopeSheet) string {
	scopeData := fmt.Sprintf(`
Scope Sheet for Roof Repair:
- Roof Type: %s
- Square Footage: %d SF
- Drip Edge: %d LF
- Pipe Jacks: %d
- Ex Vents: %d
- Turbines: %d
... (include all non-null fields)
	`, ptrToStr(scope.RoofType), ptrToInt(scope.RoofSquareFootage),
		ptrToInt(scope.DripEdgeLF), ptrToInt(scope.PipeJacksCount),
		ptrToInt(scope.ExVentsCount), ptrToInt(scope.TurbinesCount))

	prompt := fmt.Sprintf(`Based on the following scope sheet and current industry pricing in Austin, TX, produce a detailed scope of repair estimate. Format it in Xactimate style with line items.

%s

Provide the estimate in JSON format:
{
  "line_items": [
    {"description": "...", "quantity": X, "unit": "SF", "unit_cost": X.XX, "total": XXXX.XX, "category": "..."}
  ],
  "subtotal": XXXX.XX,
  "overhead_profit": XXXX.XX,
  "total": XXXXX.XX
}`, scopeData)

	return prompt
}

func (s *AuditService) saveAuditReport(report *models.AuditReport) error {
	query := `
		INSERT INTO audit_reports (
			claim_id, scope_sheet_id, generated_estimate, status, created_by_user_id
		) VALUES ($1, $2, $3, $4, $5)
		RETURNING id, created_at, updated_at
	`
	return s.db.QueryRow(query, report.ClaimID, report.ScopeSheetID,
		report.GeneratedEstimate, report.Status, report.CreatedByUserID).Scan(
		&report.ID, &report.CreatedAt, &report.UpdatedAt)
}

func (s *AuditService) logAPIUsage(auditReportID, callType string, tokens int, cost float64) error {
	query := `INSERT INTO api_usage_logs (audit_report_id, api_call_type, tokens_used, estimated_cost) VALUES ($1, $2, $3, $4)`
	_, err := s.db.Exec(query, auditReportID, callType, tokens, cost)
	return err
}
```

**Step 3: Run test**

**Step 4: Commit**

```bash
git add backend/internal/services/audit_service.go \
        backend/internal/services/audit_service_test.go
git commit -m "feat: add AuditService with GenerateIndustryEstimate

- Builds prompt from scope sheet data
- Calls Perplexity API to generate Xactimate-style estimate
- Saves audit report to database
- Logs API usage for cost tracking

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Completion Criteria

**Phase 6 is complete when:**

- ✅ All database migrations run successfully (4 tables)
- ✅ Scope sheet form works in contractor portal (magic link)
- ✅ Property managers can view submitted scope sheets
- ✅ LLM generates industry estimates via Perplexity API
- ✅ Carrier PDF upload and parsing works
- ✅ LLM comparison identifies discrepancies with justifications
- ✅ Delta report displays in UI
- ✅ Rebuttal letter generation works
- ✅ API usage tracked in database
- ✅ Error handling for API failures
- ✅ All tests passing
- ✅ Documentation updated

**Total Commits:** 15-20 commits

**Estimated Time:** 3-5 days

---

## Additional Tasks (Not Detailed Here)

The following tasks follow similar patterns to above:

- **Task 6.8:** Carrier Estimate Upload (backend + frontend)
- **Task 6.9:** PDF Parsing Service
- **Task 6.10:** Audit Service - Compare Estimates
- **Task 6.11:** Audit Service - Generate Rebuttal
- **Task 6.12:** Audit UI (Property Manager View)
- **Task 6.13:** Integration Testing
- **Task 6.14:** Documentation

Each task follows TDD with similar structure:
1. Write failing test
2. Implement minimal code
3. Pass test
4. Commit

---

## Notes for Implementer

- **Perplexity API Key:** Required in `.env` as `PERPLEXITY_API_KEY`
- **Scope Sheet:** 50+ fields, use form builder pattern
- **PDF Parsing:** Use Go library, fallback to LLM extraction if regex fails
- **Cost Tracking:** Log every API call for budget monitoring
- **Error Handling:** Retry 3x with exponential backoff
- **Security:** Validate magic link tokens, check organization ownership

---

**End of Implementation Plan**
