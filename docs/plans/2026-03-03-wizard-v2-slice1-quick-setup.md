# Contractor Wizard V2 — Slice 1: Quick Setup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the first vertical slice of the new guided contractor wizard — a Quick Setup screen where the contractor confirms property type, stories, and which areas (roof/exterior/interior/porch) were damaged — backed by new isolated DB tables and API endpoints.

**Architecture:** New `/contractor/v2/:token` frontend route + `contractor-wizard-v2/` component folder + two new Postgres tables (`inspection_v2`, `inspection_area_selection`) + two new Go endpoints under `/api/magic-links/:token/v2/`. Zero changes to existing wizard or scope_sheet tables.

**Tech Stack:** Go 1.21 (Gin, database/sql, lib/pq), PostgreSQL, React 18 + TypeScript, Axios, Vite

---

## Task 1: Database Migration

**Files:**
- Create: `backend/internal/database/migrations/000017_add_inspection_v2.up.sql`
- Create: `backend/internal/database/migrations/000017_add_inspection_v2.down.sql`

**Step 1: Create the up migration**

```sql
-- 000017_add_inspection_v2.up.sql

CREATE TABLE inspection_v2 (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id       UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  magic_link_id  UUID NOT NULL REFERENCES magic_links(id) ON DELETE CASCADE,
  property_type  TEXT CHECK (property_type IN ('sfh','duplex','small_mf','mf','commercial_light')),
  stories        INT CHECK (stories BETWEEN 1 AND 5),
  status         TEXT NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft','in_progress','submitted')),
  current_step   INT NOT NULL DEFAULT 1,
  submitted_at   TIMESTAMP,
  created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_inspection_v2_claim_id ON inspection_v2(claim_id);
CREATE INDEX idx_inspection_v2_magic_link_id ON inspection_v2(magic_link_id);

CREATE TABLE inspection_area_selection (
  inspection_id    UUID PRIMARY KEY REFERENCES inspection_v2(id) ON DELETE CASCADE,
  include_roof     BOOL NOT NULL DEFAULT false,
  include_exterior BOOL NOT NULL DEFAULT false,
  include_interior BOOL NOT NULL DEFAULT false,
  include_porch    BOOL NOT NULL DEFAULT false
);
```

**Step 2: Create the down migration**

```sql
-- 000017_add_inspection_v2.down.sql
DROP TABLE IF EXISTS inspection_area_selection;
DROP TABLE IF EXISTS inspection_v2;
```

**Step 3: Apply the migration**

```bash
cd backend
migrate -path internal/database/migrations -database "$DATABASE_URL" up
```

Expected: `000017/u add_inspection_v2 ok`

**Step 4: Verify tables exist**

```bash
psql $DATABASE_URL -c "\d inspection_v2"
psql $DATABASE_URL -c "\d inspection_area_selection"
```

Expected: Both tables shown with correct columns.

**Step 5: Commit**

```bash
git add backend/internal/database/migrations/000017_add_inspection_v2.up.sql
git add backend/internal/database/migrations/000017_add_inspection_v2.down.sql
git commit -m "feat: add inspection_v2 and inspection_area_selection tables (migration 000017)"
```

---

## Task 2: Go Model

**Files:**
- Create: `backend/internal/models/inspection.go`

**Step 1: Write the model**

```go
// backend/internal/models/inspection.go
package models

import "time"

type InspectionV2 struct {
	ID            string                   `json:"id" db:"id"`
	ClaimID       string                   `json:"claim_id" db:"claim_id"`
	MagicLinkID   string                   `json:"magic_link_id" db:"magic_link_id"`
	PropertyType  *string                  `json:"property_type" db:"property_type"`
	Stories       *int                     `json:"stories" db:"stories"`
	Status        string                   `json:"status" db:"status"`
	CurrentStep   int                      `json:"current_step" db:"current_step"`
	SubmittedAt   *time.Time               `json:"submitted_at" db:"submitted_at"`
	CreatedAt     time.Time                `json:"created_at" db:"created_at"`
	UpdatedAt     time.Time                `json:"updated_at" db:"updated_at"`
	AreaSelection *InspectionAreaSelection `json:"area_selection,omitempty"`
}

type InspectionAreaSelection struct {
	InspectionID    string `json:"inspection_id" db:"inspection_id"`
	IncludeRoof     bool   `json:"include_roof" db:"include_roof"`
	IncludeExterior bool   `json:"include_exterior" db:"include_exterior"`
	IncludeInterior bool   `json:"include_interior" db:"include_interior"`
	IncludePorch    bool   `json:"include_porch" db:"include_porch"`
}
```

**Step 2: Verify it compiles**

```bash
cd backend
go build ./internal/models/...
```

Expected: No output (clean build).

**Step 3: Commit**

```bash
git add backend/internal/models/inspection.go
git commit -m "feat: add InspectionV2 and InspectionAreaSelection Go models"
```

---

## Task 3: Go Service

**Files:**
- Create: `backend/internal/services/inspection_service.go`

**Step 1: Write the service**

```go
// backend/internal/services/inspection_service.go
package services

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/claimcoach/backend/internal/models"
	"github.com/google/uuid"
)

type InspectionService struct {
	db           *sql.DB
	magicLinkSvc *MagicLinkService
}

func NewInspectionService(db *sql.DB, magicLinkSvc *MagicLinkService) *InspectionService {
	return &InspectionService{db: db, magicLinkSvc: magicLinkSvc}
}

type SaveSetupInput struct {
	PropertyType  *string                          `json:"property_type"`
	Stories       *int                             `json:"stories"`
	AreaSelection models.InspectionAreaSelection   `json:"area_selection"`
}

// GetOrCreateByToken returns the existing draft inspection for this magic link,
// or returns nil (no error) if none exists yet. Also returns the claim's property
// address for pre-filling the UI.
type GetSetupResponse struct {
	Inspection      *models.InspectionV2 `json:"inspection"`
	PropertyAddress string               `json:"property_address"`
	ContractorName  string               `json:"contractor_name"`
}

func (s *InspectionService) GetByToken(token string) (*GetSetupResponse, error) {
	// Validate token and get magic link + claim
	result, err := s.magicLinkSvc.ValidateToken(token)
	if err != nil {
		return nil, fmt.Errorf("validate token: %w", err)
	}
	if !result.Valid {
		return nil, fmt.Errorf("invalid or expired token: %s", result.Status)
	}

	resp := &GetSetupResponse{
		PropertyAddress: result.Claim.PropertyAddress,
		ContractorName:  result.MagicLink.ContractorName,
	}

	// Look for an existing draft
	var insp models.InspectionV2
	err = s.db.QueryRow(`
		SELECT id, claim_id, magic_link_id, property_type, stories,
		       status, current_step, submitted_at, created_at, updated_at
		FROM inspection_v2
		WHERE magic_link_id = $1
		LIMIT 1
	`, result.MagicLink.ID).Scan(
		&insp.ID, &insp.ClaimID, &insp.MagicLinkID,
		&insp.PropertyType, &insp.Stories,
		&insp.Status, &insp.CurrentStep, &insp.SubmittedAt,
		&insp.CreatedAt, &insp.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return resp, nil // No draft yet — UI shows empty form
	}
	if err != nil {
		return nil, fmt.Errorf("query inspection: %w", err)
	}

	// Load area selection
	var area models.InspectionAreaSelection
	err = s.db.QueryRow(`
		SELECT inspection_id, include_roof, include_exterior,
		       include_interior, include_porch
		FROM inspection_area_selection
		WHERE inspection_id = $1
	`, insp.ID).Scan(
		&area.InspectionID, &area.IncludeRoof, &area.IncludeExterior,
		&area.IncludeInterior, &area.IncludePorch,
	)
	if err != nil && err != sql.ErrNoRows {
		return nil, fmt.Errorf("query area selection: %w", err)
	}
	if err == nil {
		insp.AreaSelection = &area
	}

	resp.Inspection = &insp
	return resp, nil
}

// SaveSetup upserts the inspection and area selection for Quick Setup (step 1).
// Creates a new inspection if none exists for this magic link; updates if one does.
func (s *InspectionService) SaveSetup(token string, input SaveSetupInput) (*models.InspectionV2, error) {
	result, err := s.magicLinkSvc.ValidateToken(token)
	if err != nil {
		return nil, fmt.Errorf("validate token: %w", err)
	}
	if !result.Valid {
		return nil, fmt.Errorf("invalid or expired token: %s", result.Status)
	}

	claimID := result.Claim.ID
	magicLinkID := result.MagicLink.ID
	now := time.Now()

	// Upsert inspection_v2
	var inspID string
	err = s.db.QueryRow(`
		SELECT id FROM inspection_v2 WHERE magic_link_id = $1 LIMIT 1
	`, magicLinkID).Scan(&inspID)

	if err == sql.ErrNoRows {
		// Insert new
		inspID = uuid.New().String()
		_, err = s.db.Exec(`
			INSERT INTO inspection_v2
			  (id, claim_id, magic_link_id, property_type, stories, status, current_step, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, 'in_progress', 2, $6, $6)
		`, inspID, claimID, magicLinkID, input.PropertyType, input.Stories, now)
	} else if err == nil {
		// Update existing
		_, err = s.db.Exec(`
			UPDATE inspection_v2
			SET property_type = $1, stories = $2, current_step = GREATEST(current_step, 2), updated_at = $3
			WHERE id = $4
		`, input.PropertyType, input.Stories, now, inspID)
	}
	if err != nil {
		return nil, fmt.Errorf("upsert inspection: %w", err)
	}

	// Upsert area selection
	_, err = s.db.Exec(`
		INSERT INTO inspection_area_selection
		  (inspection_id, include_roof, include_exterior, include_interior, include_porch)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (inspection_id) DO UPDATE SET
		  include_roof     = EXCLUDED.include_roof,
		  include_exterior = EXCLUDED.include_exterior,
		  include_interior = EXCLUDED.include_interior,
		  include_porch    = EXCLUDED.include_porch
	`, inspID,
		input.AreaSelection.IncludeRoof,
		input.AreaSelection.IncludeExterior,
		input.AreaSelection.IncludeInterior,
		input.AreaSelection.IncludePorch,
	)
	if err != nil {
		return nil, fmt.Errorf("upsert area selection: %w", err)
	}

	area := input.AreaSelection
	area.InspectionID = inspID
	return &models.InspectionV2{
		ID:            inspID,
		ClaimID:       claimID,
		MagicLinkID:   magicLinkID,
		PropertyType:  input.PropertyType,
		Stories:       input.Stories,
		Status:        "in_progress",
		CurrentStep:   2,
		UpdatedAt:     now,
		AreaSelection: &area,
	}, nil
}
```

**Step 2: Verify it compiles**

```bash
cd backend
go build ./internal/services/...
```

Expected: No output.

**Step 3: Commit**

```bash
git add backend/internal/services/inspection_service.go
git commit -m "feat: add InspectionService with GetByToken and SaveSetup"
```

---

## Task 4: Go Handler + Test

**Files:**
- Create: `backend/internal/handlers/inspection_handler.go`
- Create: `backend/internal/handlers/inspection_handler_test.go`

**Step 1: Write the failing test first**

```go
// backend/internal/handlers/inspection_handler_test.go
package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

// mockInspectionService lets us test the handler without a real DB
type mockInspectionService struct {
	getByTokenFn func(token string) (*getSetupResponse, error)
	saveSetupFn  func(token string, input saveSetupInput) (*inspectionV2Response, error)
}

func (m *mockInspectionService) GetByToken(token string) (*getSetupResponse, error) {
	return m.getByTokenFn(token)
}

func (m *mockInspectionService) SaveSetup(token string, input saveSetupInput) (*inspectionV2Response, error) {
	return m.saveSetupFn(token, input)
}

func TestInspectionHandler_GetSetup_ReturnsAddressWhenNoDraft(t *testing.T) {
	gin.SetMode(gin.TestMode)

	mock := &mockInspectionService{
		getByTokenFn: func(token string) (*getSetupResponse, error) {
			return &getSetupResponse{
				PropertyAddress: "123 Elm St, Anytown, FL",
				ContractorName:  "Bob",
				Inspection:      nil,
			}, nil
		},
	}

	handler := NewInspectionHandler(mock)
	r := gin.New()
	r.GET("/api/magic-links/:token/v2/inspection", handler.GetSetup)

	req, _ := http.NewRequest("GET", "/api/magic-links/test-token/v2/inspection", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	var body map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &body)
	data := body["data"].(map[string]interface{})
	assert.Equal(t, "123 Elm St, Anytown, FL", data["property_address"])
	assert.Nil(t, data["inspection"])
}

func TestInspectionHandler_SaveSetup_ReturnsBadRequestWhenNoAreaSelected(t *testing.T) {
	gin.SetMode(gin.TestMode)

	handler := NewInspectionHandler(&mockInspectionService{})
	r := gin.New()
	r.POST("/api/magic-links/:token/v2/inspection", handler.SaveSetup)

	payload := map[string]interface{}{
		"property_type": "sfh",
		"stories":       2,
		"area_selection": map[string]bool{
			"include_roof":     false,
			"include_exterior": false,
			"include_interior": false,
			"include_porch":    false,
		},
	}
	body, _ := json.Marshal(payload)
	req, _ := http.NewRequest("POST", "/api/magic-links/test-token/v2/inspection", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestInspectionHandler_SaveSetup_Returns201WhenValid(t *testing.T) {
	gin.SetMode(gin.TestMode)

	propType := "sfh"
	stories := 2
	mock := &mockInspectionService{
		saveSetupFn: func(token string, input saveSetupInput) (*inspectionV2Response, error) {
			return &inspectionV2Response{
				ID:           "uuid-123",
				PropertyType: &propType,
				Stories:      &stories,
				CurrentStep:  2,
			}, nil
		},
	}

	handler := NewInspectionHandler(mock)
	r := gin.New()
	r.POST("/api/magic-links/:token/v2/inspection", handler.SaveSetup)

	payload := map[string]interface{}{
		"property_type": "sfh",
		"stories":       2,
		"area_selection": map[string]bool{
			"include_roof":     true,
			"include_exterior": false,
			"include_interior": false,
			"include_porch":    false,
		},
	}
	body, _ := json.Marshal(payload)
	req, _ := http.NewRequest("POST", "/api/magic-links/test-token/v2/inspection", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusCreated, w.Code)
}
```

**Step 2: Run tests — expect compile failure (handler doesn't exist yet)**

```bash
cd backend
go test ./internal/handlers/... -run TestInspectionHandler -v
```

Expected: Compile error — `NewInspectionHandler undefined`

**Step 3: Write the handler**

```go
// backend/internal/handlers/inspection_handler.go
package handlers

import (
	"fmt"
	"net/http"

	"github.com/claimcoach/backend/internal/models"
	"github.com/claimcoach/backend/internal/services"
	"github.com/gin-gonic/gin"
)

// inspectionServiceInterface allows mocking in tests
type inspectionServiceInterface interface {
	GetByToken(token string) (*getSetupResponse, error)
	SaveSetup(token string, input saveSetupInput) (*inspectionV2Response, error)
}

// Local types that mirror service types (keeps handler self-contained)
type getSetupResponse = services.GetSetupResponse
type saveSetupInput = services.SaveSetupInput
type inspectionV2Response = models.InspectionV2

type InspectionHandler struct {
	service inspectionServiceInterface
}

func NewInspectionHandler(service inspectionServiceInterface) *InspectionHandler {
	return &InspectionHandler{service: service}
}

// GET /api/magic-links/:token/v2/inspection
func (h *InspectionHandler) GetSetup(c *gin.Context) {
	token := c.Param("token")

	resp, err := h.service.GetByToken(token)
	if err != nil {
		if isTokenError(err) {
			c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Invalid or expired magic link"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": resp})
}

// POST /api/magic-links/:token/v2/inspection
func (h *InspectionHandler) SaveSetup(c *gin.Context) {
	token := c.Param("token")

	var input services.SaveSetupInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid request: " + err.Error()})
		return
	}

	// Require at least one area selected
	a := input.AreaSelection
	if !a.IncludeRoof && !a.IncludeExterior && !a.IncludeInterior && !a.IncludePorch {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Select at least one area to inspect"})
		return
	}

	insp, err := h.service.SaveSetup(token, input)
	if err != nil {
		if isTokenError(err) {
			c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Invalid or expired magic link"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"success": true, "data": insp})
}

func isTokenError(err error) bool {
	msg := err.Error()
	return msg == fmt.Sprintf("invalid or expired token: %s", "expired") ||
		msg == fmt.Sprintf("invalid or expired token: %s", "not_found") ||
		msg == fmt.Sprintf("invalid or expired token: %s", "completed")
}
```

**Step 4: Run tests — expect pass**

```bash
cd backend
go test ./internal/handlers/... -run TestInspectionHandler -v
```

Expected:
```
--- PASS: TestInspectionHandler_GetSetup_ReturnsAddressWhenNoDraft
--- PASS: TestInspectionHandler_SaveSetup_ReturnsBadRequestWhenNoAreaSelected
--- PASS: TestInspectionHandler_SaveSetup_Returns201WhenValid
PASS
```

**Step 5: Commit**

```bash
git add backend/internal/handlers/inspection_handler.go
git add backend/internal/handlers/inspection_handler_test.go
git commit -m "feat: add InspectionHandler with GET/POST setup endpoints (tested)"
```

---

## Task 5: Wire Handler into Router

**Files:**
- Modify: `backend/internal/api/router.go`

**Step 1: Find the magic link public routes block**

Open `backend/internal/api/router.go`. Find this block (around line 115):
```go
r.GET("/api/magic-links/:token/validate", magicLinkHandler.ValidateToken)
// ... other magic link routes ...
r.GET("/api/magic-links/:token/scope-sheet/draft", scopeSheetHandler.GetDraft)
```

**Step 2: Add inspection service + handler construction**

In the same area where `magicLinkService` and `scopeSheetHandler` are constructed, add:
```go
inspectionService := services.NewInspectionService(db, magicLinkService)
inspectionHandler := handlers.NewInspectionHandler(inspectionService)
```

**Step 3: Add the two new routes right after the existing magic link routes**

```go
// Inspection V2 routes (public - no auth required)
r.GET("/api/magic-links/:token/v2/inspection", inspectionHandler.GetSetup)
r.POST("/api/magic-links/:token/v2/inspection", inspectionHandler.SaveSetup)
```

**Step 4: Build and verify no compile errors**

```bash
cd backend
go build ./...
```

Expected: No output.

**Step 5: Smoke test the endpoint**

```bash
# Start the server
go run cmd/server/main.go &

# Test with an invalid token (should get 401)
curl -s -X GET http://localhost:8080/api/magic-links/fake-token/v2/inspection | jq .
```

Expected: `{"success": false, "error": "Invalid or expired magic link"}`

**Step 6: Commit**

```bash
git add backend/internal/api/router.go
git commit -m "feat: register inspection v2 routes in router"
```

---

## Task 6: Frontend Types

**Files:**
- Create: `frontend/src/components/contractor-wizard-v2/types.ts`

**Step 1: Write the types**

```typescript
// frontend/src/components/contractor-wizard-v2/types.ts

export type PropertyType = 'sfh' | 'duplex' | 'small_mf' | 'mf' | 'commercial_light'

export interface AreaSelection {
  include_roof: boolean
  include_exterior: boolean
  include_interior: boolean
  include_porch: boolean
}

export interface InspectionV2 {
  id: string
  claim_id: string
  magic_link_id: string
  property_type: PropertyType | null
  stories: number | null
  status: 'draft' | 'in_progress' | 'submitted'
  current_step: number
  area_selection: AreaSelection | null
}

export interface QuickSetupData {
  property_type: PropertyType | null
  stories: number | null
  area_selection: AreaSelection
}

export interface GetSetupResponse {
  inspection: InspectionV2 | null
  property_address: string
  contractor_name: string
}

// Wizard step IDs — drives which screen is shown
export type WizardStep = 1 | 2 | 3 | 4 | 5
```

**Step 2: Verify TypeScript compiles**

```bash
cd frontend
npx tsc --noEmit
```

Expected: No errors.

**Step 3: Commit**

```bash
git add frontend/src/components/contractor-wizard-v2/types.ts
git commit -m "feat: add TypeScript types for contractor wizard v2"
```

---

## Task 7: Wizard State Hook

**Files:**
- Create: `frontend/src/components/contractor-wizard-v2/useWizardV2State.ts`

**Step 1: Write the hook**

```typescript
// frontend/src/components/contractor-wizard-v2/useWizardV2State.ts
import { useState, useEffect } from 'react'
import axios from 'axios'
import type {
  WizardStep,
  QuickSetupData,
  GetSetupResponse,
  InspectionV2,
} from './types'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8080'

export interface WizardV2State {
  // Meta
  token: string
  currentStep: WizardStep
  inspectionId: string | null
  propertyAddress: string
  contractorName: string
  loading: boolean
  error: string | null

  // Step 1 data
  quickSetup: QuickSetupData

  // Actions
  setCurrentStep: (step: WizardStep) => void
  setQuickSetup: (data: QuickSetupData) => void
  submitQuickSetup: () => Promise<void>
}

const defaultAreaSelection = {
  include_roof: false,
  include_exterior: false,
  include_interior: false,
  include_porch: false,
}

export function useWizardV2State(token: string): WizardV2State {
  const [currentStep, setCurrentStep] = useState<WizardStep>(1)
  const [inspectionId, setInspectionId] = useState<string | null>(null)
  const [propertyAddress, setPropertyAddress] = useState('')
  const [contractorName, setContractorName] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [quickSetup, setQuickSetup] = useState<QuickSetupData>({
    property_type: null,
    stories: null,
    area_selection: { ...defaultAreaSelection },
  })

  // Load existing draft on mount
  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await axios.get<{ success: boolean; data: GetSetupResponse }>(
          `${API}/api/magic-links/${token}/v2/inspection`
        )
        const resp = data.data
        setPropertyAddress(resp.property_address)
        setContractorName(resp.contractor_name)

        if (resp.inspection) {
          const insp: InspectionV2 = resp.inspection
          setInspectionId(insp.id)
          setCurrentStep(insp.current_step as WizardStep)
          setQuickSetup({
            property_type: insp.property_type,
            stories: insp.stories,
            area_selection: insp.area_selection ?? { ...defaultAreaSelection },
          })
        }
      } catch (e: any) {
        setError(e?.response?.data?.error ?? 'Failed to load inspection')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [token])

  const submitQuickSetup = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await axios.post<{ success: boolean; data: InspectionV2 }>(
        `${API}/api/magic-links/${token}/v2/inspection`,
        {
          property_type: quickSetup.property_type,
          stories: quickSetup.stories,
          area_selection: quickSetup.area_selection,
        }
      )
      setInspectionId(data.data.id)
      setCurrentStep(2)
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Failed to save setup')
    } finally {
      setLoading(false)
    }
  }

  return {
    token,
    currentStep,
    inspectionId,
    propertyAddress,
    contractorName,
    loading,
    error,
    quickSetup,
    setCurrentStep,
    setQuickSetup,
    submitQuickSetup,
  }
}
```

**Step 2: Verify TypeScript compiles**

```bash
cd frontend
npx tsc --noEmit
```

Expected: No errors.

**Step 3: Commit**

```bash
git add frontend/src/components/contractor-wizard-v2/useWizardV2State.ts
git commit -m "feat: add useWizardV2State hook with draft load and quick setup submit"
```

---

## Task 8: QuickSetupStep UI Component

**Files:**
- Create: `frontend/src/components/contractor-wizard-v2/steps/QuickSetupStep.tsx`

> Use the `frontend-design` skill for the visual implementation of this component.
> The component must match the mockup: icon property-type cards, stories number row,
> area checkboxes, orange "Continue →" CTA (disabled until at least one area checked).

**Step 1: Create the component**

```typescript
// frontend/src/components/contractor-wizard-v2/steps/QuickSetupStep.tsx
import type { QuickSetupData, PropertyType } from '../types'

interface QuickSetupStepProps {
  propertyAddress: string
  data: QuickSetupData
  onChange: (data: QuickSetupData) => void
  onContinue: () => void
  loading: boolean
  error: string | null
}

export default function QuickSetupStep({
  propertyAddress,
  data,
  onChange,
  onContinue,
  loading,
  error,
}: QuickSetupStepProps)
```

The component renders:
1. **Address bar** — read-only, shows `propertyAddress`
2. **Property type cards** — SFH / Duplex / Small MF / MF / Commercial with icons, tap to select
3. **Stories row** — buttons 1–5, tap to select
4. **Area checkboxes** — Roof / Exterior / Interior / Porch·Patio·Fence
5. **Error message** — shown if `error` is not null
6. **Continue → button** — orange, calls `onContinue`, disabled when `loading` or no area is checked

> Note to implementer: Invoke `frontend-design:frontend-design` skill to get polished, production-quality styles for this component. Match the mobile-first card layout from the mockup.

**Step 2: Verify TypeScript compiles**

```bash
cd frontend
npx tsc --noEmit
```

Expected: No errors.

**Step 3: Commit**

```bash
git add frontend/src/components/contractor-wizard-v2/steps/QuickSetupStep.tsx
git commit -m "feat: add QuickSetupStep UI component"
```

---

## Task 9: Wizard Shell + Progress Bar

**Files:**
- Create: `frontend/src/components/contractor-wizard-v2/WizardV2Progress.tsx`
- Create: `frontend/src/components/contractor-wizard-v2/ContractorWizardV2.tsx`
- Create: `frontend/src/components/contractor-wizard-v2/index.ts`

**Step 1: Progress bar**

```tsx
// frontend/src/components/contractor-wizard-v2/WizardV2Progress.tsx
interface WizardV2ProgressProps {
  currentStep: number
  totalSteps?: number
}

const STEP_LABELS = ['Quick Setup', 'Elevations', 'Roof', 'Rooms', 'Review']

export default function WizardV2Progress({ currentStep, totalSteps = 5 }: WizardV2ProgressProps) {
  const pct = Math.round(((currentStep - 1) / (totalSteps - 1)) * 100)
  return (
    <div style={{ padding: '12px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: '#6b7280' }}>
          Step {currentStep} of {totalSteps}: {STEP_LABELS[currentStep - 1]}
        </span>
        <span style={{ fontSize: 12, color: '#6b7280' }}>{pct}%</span>
      </div>
      <div style={{ height: 4, background: '#e5e7eb', borderRadius: 2 }}>
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background: '#0d9488',
            borderRadius: 2,
            transition: 'width 0.3s ease',
          }}
        />
      </div>
    </div>
  )
}
```

**Step 2: Wizard shell**

```tsx
// frontend/src/components/contractor-wizard-v2/ContractorWizardV2.tsx
import WizardV2Progress from './WizardV2Progress'
import { useWizardV2State } from './useWizardV2State'
import QuickSetupStep from './steps/QuickSetupStep'

interface ContractorWizardV2Props {
  token: string
}

export default function ContractorWizardV2({ token }: ContractorWizardV2Props) {
  const state = useWizardV2State(token)

  if (state.loading && !state.inspectionId) {
    return <div style={{ padding: 32, textAlign: 'center' }}>Loading...</div>
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', minHeight: '100vh', background: '#fff' }}>
      <WizardV2Progress currentStep={state.currentStep} />

      {state.currentStep === 1 && (
        <QuickSetupStep
          propertyAddress={state.propertyAddress}
          data={state.quickSetup}
          onChange={state.setQuickSetup}
          onContinue={state.submitQuickSetup}
          loading={state.loading}
          error={state.error}
        />
      )}

      {/* Steps 2–5 will be added in future slices */}
      {state.currentStep > 1 && (
        <div style={{ padding: 32, textAlign: 'center', color: '#6b7280' }}>
          Step {state.currentStep} coming soon...
        </div>
      )}
    </div>
  )
}
```

**Step 3: Barrel export**

```typescript
// frontend/src/components/contractor-wizard-v2/index.ts
export { default as ContractorWizardV2 } from './ContractorWizardV2'
```

**Step 4: Verify TypeScript compiles**

```bash
cd frontend
npx tsc --noEmit
```

Expected: No errors.

**Step 5: Commit**

```bash
git add frontend/src/components/contractor-wizard-v2/
git commit -m "feat: add ContractorWizardV2 shell and WizardV2Progress bar"
```

---

## Task 10: New Page + Route

**Files:**
- Create: `frontend/src/pages/ContractorUploadV2.tsx`
- Modify: `frontend/src/App.tsx` (add one route)

**Step 1: Create the page**

```tsx
// frontend/src/pages/ContractorUploadV2.tsx
import { useParams, Navigate } from 'react-router-dom'
import { ContractorWizardV2 } from '../components/contractor-wizard-v2'

export default function ContractorUploadV2() {
  const { token } = useParams<{ token: string }>()

  if (!token) return <Navigate to="/" replace />

  return <ContractorWizardV2 token={token} />
}
```

**Step 2: Add route to App.tsx**

Find the existing contractor route in `frontend/src/App.tsx`:
```tsx
<Route path="/contractor/:token" element={<ContractorUpload />} />
```

Add the new route directly below it:
```tsx
<Route path="/contractor/v2/:token" element={<ContractorUploadV2 />} />
```

Also add the import at the top of the file:
```tsx
import ContractorUploadV2 from './pages/ContractorUploadV2'
```

**Step 3: Verify TypeScript compiles**

```bash
cd frontend
npx tsc --noEmit
```

Expected: No errors.

**Step 4: Start dev server and manually test**

```bash
cd frontend
npm run dev
```

Open `http://localhost:5173/contractor/v2/test-token` in browser.

Expected: Wizard loads, shows "Loading..." briefly, then displays Quick Setup screen (or "Invalid or expired magic link" if token is fake — that's correct behavior).

To test with a real token: generate a magic link from the dashboard and replace `/contractor/` with `/contractor/v2/` in the URL.

**Step 5: Commit**

```bash
git add frontend/src/pages/ContractorUploadV2.tsx frontend/src/App.tsx
git commit -m "feat: add ContractorUploadV2 page and /contractor/v2/:token route"
```

---

## Task 11: End-to-End Smoke Test

**Step 1: Generate a real magic link**

1. Log in to the dashboard
2. Open a claim → Step 2 → send magic link to a test email
3. Copy the magic link URL (e.g., `https://yourapp.com/contractor/abc-token`)

**Step 2: Test the new wizard**

Change the URL from `/contractor/abc-token` to `/contractor/v2/abc-token` and open it.

Expected flow:
1. Page loads with property address pre-filled
2. Select "SFH", "2 stories", check "Roof" and "Exterior"
3. Click "Continue →"
4. POST fires to `/api/magic-links/abc-token/v2/inspection` — check Network tab: 201 response
5. Page advances to "Step 2 coming soon..."

**Step 3: Verify draft reloads**

Refresh the page at step 2. Expected: GET fires, returns existing inspection, page shows "Step 2 coming soon..." again (not back at step 1).

**Step 4: Verify DB record**

```bash
psql $DATABASE_URL -c "SELECT * FROM inspection_v2 ORDER BY created_at DESC LIMIT 1;"
psql $DATABASE_URL -c "SELECT * FROM inspection_area_selection ORDER BY inspection_id DESC LIMIT 1;"
```

Expected: One row in each table with correct values.

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat: contractor wizard v2 slice 1 (quick setup) - complete"
```

---

## What's Next (Slice 2 Preview)

Slice 2 adds `ElevationsStep.tsx` — the contractor taps through Front / Right / Back / Left, toggling siding damage and entering gutters, windows, doors per side. New migration `000018` adds `inspection_elevation` table. New endpoints: `POST /api/magic-links/:token/v2/inspection/elevations`.
