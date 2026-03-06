# Slice 5 (Data Check / Submission) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add the final wizard step — a read-only summary checklist of all collected data with soft warnings for missing photos, a "Submit Inspection" button that flips status to `submitted`, and a full-screen success state.

**Architecture:** Same 5-layer stack as previous slices. Backend: one new `SubmitInspection` service method + handler + route (no migration — `status` and `submitted_at` already exist on `inspection_v2`). Frontend: extend the state hook with `submitInspection` + `submittedAt`, add `DataCheckStep.tsx` (pure display component — reads props, computes warnings, renders checklist or success screen), wire into `ContractorWizardV2.tsx`.

**Tech Stack:** Go 1.21 + Gin + `database/sql`, React 18 + TypeScript (inline styles only).

---

## Context for implementers

- Repo root: `/Users/benjaminlopez/Documents/ClaimCoachAI Code`
- Backend: `backend/`  Go module `github.com/claimcoach/backend`
- Frontend: `frontend/src/components/contractor-wizard-v2/`
- Build check: `cd backend && go build ./...`
- Frontend build check: `cd frontend && npx tsc --noEmit && npx vite build`
- All styles as `React.CSSProperties` — no CSS modules, no Tailwind
- The `inspectionServiceInterface` in `handlers/inspection_handler.go` must be extended for every new service method
- The `mockInspectionService` in `handlers/inspection_handler_test.go` must have a `Fn` field + method implementation for every interface method
- `inspection_v2` already has: `status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_progress','submitted'))` and `submitted_at TIMESTAMP` (nullable). No migration needed.
- Submit is **idempotent**: if `status` is already `'submitted'`, the UPDATE is a no-op and the existing `submitted_at` is preserved. The endpoint always returns 200 with the current inspection.

---

### Task 1: Go Service — SubmitInspection

**Files:**
- Modify: `backend/internal/services/inspection_service.go`

**Background:** Append one method after `DeleteRoomPhoto`. The method must:
1. Validate the token
2. Run an idempotent UPDATE that sets `status='submitted'` and `submitted_at = CASE WHEN submitted_at IS NULL THEN NOW() ELSE submitted_at END` — this preserves the original timestamp on repeated calls
3. RETURNING all scalar columns of `inspection_v2` so we can populate the model
4. Return `sql.ErrNoRows` wrapped if no inspection exists for this magic link

Note: `InspectionV2` has no `AreaSelection` field in the DB row itself — `AreaSelection` is loaded separately. For this endpoint we only return the scalar fields.

**Step 1: Append `SubmitInspection` to `inspection_service.go`**

```go
// SubmitInspection marks the inspection as submitted.
// It is idempotent: if already submitted, the original submitted_at is preserved
// and the current inspection is returned without error.
func (s *InspectionService) SubmitInspection(token string) (*models.InspectionV2, error) {
	validation, err := s.magicLinkSvc.ValidateToken(token)
	if err != nil {
		return nil, fmt.Errorf("failed to validate token: %w", err)
	}
	if !validation.Valid {
		return nil, fmt.Errorf("invalid or expired token: %s", validation.Reason)
	}

	var insp models.InspectionV2
	err = s.db.QueryRow(`
		UPDATE inspection_v2
		SET    status       = 'submitted',
		       submitted_at = CASE WHEN submitted_at IS NULL THEN NOW() ELSE submitted_at END,
		       updated_at   = NOW()
		WHERE  magic_link_id = $1
		RETURNING id, claim_id, magic_link_id, property_type, stories,
		          status, current_step, submitted_at, created_at, updated_at
	`, validation.MagicLinkID).Scan(
		&insp.ID, &insp.ClaimID, &insp.MagicLinkID,
		&insp.PropertyType, &insp.Stories,
		&insp.Status, &insp.CurrentStep,
		&insp.SubmittedAt, &insp.CreatedAt, &insp.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("inspection not found: %w", err)
	}
	if err != nil {
		return nil, fmt.Errorf("failed to submit inspection: %w", err)
	}
	return &insp, nil
}
```

**Step 2: Build check**

```bash
cd backend && go build ./...
```
Expected: clean.

**Step 3: Commit**

```bash
git add backend/internal/services/inspection_service.go
git commit -m "feat: service method — SubmitInspection (idempotent)"
```

---

### Task 2: Go Handler + Tests

**Files:**
- Modify: `backend/internal/handlers/inspection_handler.go`
- Modify: `backend/internal/handlers/inspection_handler_test.go`

**Background:** Follow the existing pattern exactly.
- Type alias block is lines 15–31
- `inspectionServiceInterface` is lines 35–50
- Handler methods begin after line 58

**Step 1: Add type alias to `inspection_handler.go`**

After the existing alias block (after line 31), add:
```go
type submitInspectionResponse = models.InspectionV2
```

**Step 2: Add interface method to `inspectionServiceInterface`**

After `DeleteRoomPhoto(token string, photoID string) error`, add:
```go
SubmitInspection(token string) (*submitInspectionResponse, error)
```

**Step 3: Add handler method to `inspection_handler.go`**

Append after `DeleteRoomPhoto`:
```go
// SubmitInspection handles POST /api/magic-links/:token/v2/inspection/submit.
// Returns 200 with the updated inspection (idempotent — safe to call multiple times).
func (h *InspectionHandler) SubmitInspection(c *gin.Context) {
	token := c.Param("token")

	insp, err := h.service.SubmitInspection(token)
	if err != nil {
		if isTokenError(err) {
			c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Invalid or expired magic link"})
			return
		}
		if errors.Is(err, sql.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Inspection not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to submit inspection: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": insp})
}
```

**Step 4: Update `inspection_handler_test.go`**

Add `Fn` field to `mockInspectionService`:
```go
submitInspectionFn func(token string) (*submitInspectionResponse, error)
```

Add mock method implementation (after `DeleteRoomPhoto`):
```go
func (m *mockInspectionService) SubmitInspection(token string) (*submitInspectionResponse, error) {
	return m.submitInspectionFn(token)
}
```

Add 3 test functions:

```go
func TestInspectionHandler_SubmitInspection_Returns200OnSuccess(t *testing.T) {
	now := time.Now()
	mock := &mockInspectionService{
		submitInspectionFn: func(token string) (*submitInspectionResponse, error) {
			return &submitInspectionResponse{
				ID:          "insp-uuid-001",
				Status:      "submitted",
				SubmittedAt: &now,
			}, nil
		},
	}
	handler := NewInspectionHandler(mock)
	r := gin.New()
	r.POST("/api/magic-links/:token/v2/inspection/submit", handler.SubmitInspection)
	req, _ := http.NewRequest("POST", "/api/magic-links/test-token/v2/inspection/submit", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusOK, w.Code)
	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	assert.Equal(t, true, resp["success"])
	data := resp["data"].(map[string]interface{})
	assert.Equal(t, "submitted", data["status"])
}

func TestInspectionHandler_SubmitInspection_Returns401ForInvalidToken(t *testing.T) {
	mock := &mockInspectionService{
		submitInspectionFn: func(token string) (*submitInspectionResponse, error) {
			return nil, fmt.Errorf("invalid or expired token: %s", token)
		},
	}
	handler := NewInspectionHandler(mock)
	r := gin.New()
	r.POST("/api/magic-links/:token/v2/inspection/submit", handler.SubmitInspection)
	req, _ := http.NewRequest("POST", "/api/magic-links/bad-token/v2/inspection/submit", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

func TestInspectionHandler_SubmitInspection_Returns404WhenNoInspection(t *testing.T) {
	mock := &mockInspectionService{
		submitInspectionFn: func(token string) (*submitInspectionResponse, error) {
			return nil, fmt.Errorf("inspection not found: %w", sql.ErrNoRows)
		},
	}
	handler := NewInspectionHandler(mock)
	r := gin.New()
	r.POST("/api/magic-links/:token/v2/inspection/submit", handler.SubmitInspection)
	req, _ := http.NewRequest("POST", "/api/magic-links/test-token/v2/inspection/submit", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusNotFound, w.Code)
	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	assert.Contains(t, resp["error"], "not found")
}
```

**Step 5: Run tests**

```bash
cd backend && go test ./internal/handlers/... -v -run TestInspectionHandler_Submit
```
Expected: 3 tests pass.

**Step 6: Build check**

```bash
cd backend && go build ./...
```
Expected: clean.

**Step 7: Commit**

```bash
git add backend/internal/handlers/inspection_handler.go \
        backend/internal/handlers/inspection_handler_test.go
git commit -m "feat: handler + tests — SubmitInspection"
```

---

### Task 3: Router — 1 submit route

**Files:**
- Modify: `backend/internal/api/router.go`

**Background:** The room routes end at line 143. Add the submit route immediately after.

**Step 1: Add submit route after line 143**

```go
// Submit
r.POST("/api/magic-links/:token/v2/inspection/submit", inspectionHandler.SubmitInspection)
```

**Step 2: Build check**

```bash
cd backend && go build ./...
```
Expected: clean.

**Step 3: Commit**

```bash
git add backend/internal/api/router.go
git commit -m "feat: route — POST /inspection/submit"
```

---

### Task 4 (frontend Task 10): TypeScript types + State Hook

**Files:**
- Modify: `frontend/src/components/contractor-wizard-v2/types.ts`
- Modify: `frontend/src/components/contractor-wizard-v2/useWizardV2State.ts`

**Background:** `InspectionV2` in `types.ts` is missing `submitted_at`. Add it. Then extend the state hook with `submittedAt` state + `submitInspection` callback, and update the `useEffect` to refresh all section data when `currentStep === 5`.

**Step 1: Add `submitted_at` to `InspectionV2` in `types.ts`**

The current `InspectionV2` interface (lines 10–19) ends after `area_selection`. Add one field:

```typescript
export interface InspectionV2 {
  id: string
  claim_id: string
  magic_link_id: string
  property_type: PropertyType | null
  stories: number | null
  status: 'draft' | 'in_progress' | 'submitted'
  current_step: number
  area_selection: AreaSelection | null
  submitted_at: string | null   // ← add this
}
```

**Step 2: Add 2 fields to `WizardV2State` interface in `useWizardV2State.ts`**

After `deleteRoomPhoto`, add:
```typescript
submittedAt: string | null
submitInspection: () => Promise<boolean>
```

**Step 3: Add `submittedAt` state inside the hook body**

After the `rooms` / `roomsLoading` state declarations, add:
```typescript
const [submittedAt, setSubmittedAt] = useState<string | null>(null)
```

**Step 4: Initialise `submittedAt` from the setup response**

In the existing `useEffect` initial load (the one with `axios.get .../v2/inspection`), inside the `if (resp.inspection)` block, add after the `setQuickSetup(...)` call:
```typescript
if (insp.submitted_at) setSubmittedAt(insp.submitted_at)
```

**Step 5: Update `useEffect` for step data loading**

The current effect:
```typescript
useEffect(() => {
  if (currentStep === 2) loadElevations()
  if (currentStep === 3) loadRoof()
  if (currentStep === 4) loadRooms()
}, [currentStep, loadElevations, loadRoof, loadRooms])
```

Add step 5 (load everything so DataCheckStep has fresh data):
```typescript
useEffect(() => {
  if (currentStep === 2) loadElevations()
  if (currentStep === 3) loadRoof()
  if (currentStep === 4) loadRooms()
  if (currentStep === 5) {
    loadElevations()
    loadRoof()
    loadRooms()
  }
}, [currentStep, loadElevations, loadRoof, loadRooms])
```

**Step 6: Add `submitInspection` callback**

```typescript
const submitInspection = useCallback(async (): Promise<boolean> => {
  try {
    const { data } = await axios.post<{ success: boolean; data: InspectionV2 }>(
      `${API}/api/magic-links/${token}/v2/inspection/submit`
    )
    if (data.data.submitted_at) setSubmittedAt(data.data.submitted_at)
    return true
  } catch {
    return false
  }
}, [token])
```

**Step 7: Add `submittedAt` and `submitInspection` to the return object**

After `deleteRoomPhoto` in the return, add:
```typescript
submittedAt,
submitInspection,
```

**Step 8: Build check**

```bash
cd frontend && npx tsc --noEmit
```
Expected: no errors.

**Step 9: Commit**

```bash
git add frontend/src/components/contractor-wizard-v2/types.ts \
        frontend/src/components/contractor-wizard-v2/useWizardV2State.ts
git commit -m "feat: state hook — submitInspection, submittedAt, step-5 data refresh"
```

---

### Task 5 (frontend Task 11): DataCheckStep.tsx component

**Files:**
- Create: `frontend/src/components/contractor-wizard-v2/steps/DataCheckStep.tsx`

**Design summary:**
- Props receive all the already-loaded state (no extra fetching)
- Component computes a `warnings` list (elevations with no photo, rooms with no photos)
- If `submittedAt` is truthy → render **success screen** (full-screen, no Back)
- Otherwise → render **checklist + footer** with Back / Submit buttons
- A warning banner appears directly above the Submit button when `warnings.length > 0`
- Submit button shows "Submitting…" while in-flight and is disabled during that time
- Only sections selected in `area_selection` are shown

**Step 1: Create `DataCheckStep.tsx`**

```tsx
import React, { useState } from 'react'
import type {
  QuickSetupData,
  ElevationData,
  ElevationSide,
  RoofData,
  RoofDamageSpot,
  InspectionRoom,
} from '../types'

// ── Types ─────────────────────────────────────────────────────────────────────

interface DataCheckStepProps {
  quickSetup: QuickSetupData
  elevations: ElevationData[]
  roof: RoofData | null
  roofDamageSpots: RoofDamageSpot[]
  rooms: InspectionRoom[]
  elevationLoading: boolean
  roofLoading: boolean
  roomsLoading: boolean
  submittedAt: string | null
  onSubmit: () => Promise<boolean>
  onBack: () => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const SIDE_LABELS: Record<ElevationSide, string> = {
  front: 'Front',
  right: 'Right',
  back: 'Back',
  left: 'Left',
}

function formatSubmittedAt(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    + ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

// ── SuccessScreen ─────────────────────────────────────────────────────────────

function SuccessScreen({ submittedAt }: { submittedAt: string }) {
  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    backgroundColor: '#f9fafb',
    padding: '32px 24px',
    textAlign: 'center',
  }

  return (
    <div style={containerStyle}>
      <div style={{ fontSize: '64px', marginBottom: '24px' }}>✅</div>
      <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#111827', margin: '0 0 12px' }}>
        Inspection Submitted
      </h1>
      <p style={{ fontSize: '15px', color: '#6b7280', lineHeight: 1.6, maxWidth: '280px', margin: '0 0 24px' }}>
        Your inspection report has been submitted successfully. The claims team will review it and be in touch soon.
      </p>
      <p style={{ fontSize: '13px', color: '#9ca3af' }}>
        Submitted {formatSubmittedAt(submittedAt)}
      </p>
    </div>
  )
}

// ── SectionCard ───────────────────────────────────────────────────────────────

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      backgroundColor: '#ffffff',
      border: '1px solid #e5e7eb',
      borderRadius: '12px',
      padding: '16px',
    }}>
      <p style={{ fontSize: '13px', fontWeight: 600, color: '#6b7280', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {title}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {children}
      </div>
    </div>
  )
}

function Row({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: '14px', color: '#374151' }}>
        {warn && <span style={{ marginRight: '6px' }}>⚠</span>}
        {label}
      </span>
      <span style={{ fontSize: '13px', color: warn ? '#d97706' : '#6b7280' }}>{value}</span>
    </div>
  )
}

// ── DataCheckStep ─────────────────────────────────────────────────────────────

export default function DataCheckStep({
  quickSetup,
  elevations,
  roof,
  roofDamageSpots,
  rooms,
  elevationLoading,
  roofLoading,
  roomsLoading,
  submittedAt,
  onSubmit,
  onBack,
}: DataCheckStepProps) {
  const [submitting, setSubmitting] = useState(false)

  // Already submitted — show success screen immediately.
  if (submittedAt) return <SuccessScreen submittedAt={submittedAt} />

  const { include_exterior, include_roof, include_interior } = quickSetup.area_selection

  // Compute warnings (soft — never blocks submit).
  const warnings: string[] = []
  if (include_exterior) {
    const ALL_SIDES: ElevationSide[] = ['front', 'right', 'back', 'left']
    ALL_SIDES.forEach(side => {
      const elev = elevations.find(e => e.side === side)
      if (!elev || !elev.photo_document_id) warnings.push(`${SIDE_LABELS[side]} elevation has no photo`)
    })
  }
  if (include_interior) {
    rooms.forEach(room => {
      if (room.photos.length === 0) warnings.push(`"${room.name}" has no photos`)
    })
  }

  const anyLoading = elevationLoading || roofLoading || roomsLoading

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      await onSubmit()
    } finally {
      setSubmitting(false)
    }
  }

  // ── Styles ──────────────────────────────────────────────────────────────────

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100vh',
    backgroundColor: '#f9fafb',
  }

  const headerStyle: React.CSSProperties = {
    padding: '20px 16px 12px',
    backgroundColor: '#ffffff',
    borderBottom: '1px solid #e5e7eb',
  }

  const bodyStyle: React.CSSProperties = {
    flex: 1,
    overflowY: 'auto',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  }

  const footerStyle: React.CSSProperties = {
    padding: '16px',
    backgroundColor: '#ffffff',
    borderTop: '1px solid #e5e7eb',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  }

  const warningBannerStyle: React.CSSProperties = {
    padding: '10px 14px',
    borderRadius: '8px',
    backgroundColor: '#fffbeb',
    border: '1px solid #fcd34d',
    fontSize: '13px',
    color: '#92400e',
    lineHeight: 1.5,
  }

  const backBtnStyle: React.CSSProperties = {
    flex: 1,
    padding: '14px',
    borderRadius: '10px',
    border: '1px solid #d1d5db',
    backgroundColor: '#ffffff',
    fontSize: '15px',
    cursor: 'pointer',
  }

  const submitBtnStyle: React.CSSProperties = {
    flex: 2,
    padding: '14px',
    borderRadius: '10px',
    border: 'none',
    backgroundColor: submitting ? '#9ca3af' : '#2563eb',
    color: '#ffffff',
    fontSize: '15px',
    fontWeight: 600,
    cursor: submitting ? 'not-allowed' : 'pointer',
  }

  const btnRowStyle: React.CSSProperties = {
    display: 'flex',
    gap: '12px',
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>Step 5 of 5</p>
        <h2 style={{ fontSize: '20px', fontWeight: 700, margin: '4px 0 0', color: '#111827' }}>
          Review &amp; Submit
        </h2>
      </div>

      {/* Body */}
      <div style={bodyStyle}>
        {anyLoading && (
          <p style={{ color: '#6b7280', fontSize: '14px', textAlign: 'center' }}>Loading summary…</p>
        )}

        {/* Property */}
        <SectionCard title="Property">
          <Row
            label={quickSetup.property_type ?? 'Unknown type'}
            value={quickSetup.stories ? `${quickSetup.stories} ${quickSetup.stories === 1 ? 'story' : 'stories'}` : '—'}
          />
        </SectionCard>

        {/* Exterior */}
        {include_exterior && (
          <SectionCard title="Exterior">
            {(['front', 'right', 'back', 'left'] as ElevationSide[]).map(side => {
              const elev = elevations.find(e => e.side === side)
              const hasPhoto = !!elev?.photo_document_id
              const hasDamage = elev?.has_damage ?? false
              return (
                <Row
                  key={side}
                  label={SIDE_LABELS[side]}
                  value={hasPhoto ? (hasDamage ? '1 photo · damage' : '1 photo') : 'no photo'}
                  warn={!hasPhoto}
                />
              )
            })}
          </SectionCard>
        )}

        {/* Roof */}
        {include_roof && (
          <SectionCard title="Roof">
            {roof ? (
              <>
                <Row
                  label={roof.shingle_type ?? 'Unknown shingle'}
                  value={roof.squares ? `${roof.squares} sq` : '—'}
                />
                <Row
                  label="Photos"
                  value={[
                    roof.overview_photo_id && 'overview',
                    roof.slope_photo_id && 'slope',
                    roof.shingles_photo_id && 'shingles',
                    roof.ridge_photo_id && 'ridge',
                  ].filter(Boolean).join(', ') || 'none'}
                />
                {roofDamageSpots.length > 0 && (
                  <Row label="Damage spots" value={`${roofDamageSpots.length}`} />
                )}
              </>
            ) : (
              <Row label="No roof data" value="—" warn />
            )}
          </SectionCard>
        )}

        {/* Interior */}
        {include_interior && (
          <SectionCard title={`Rooms / Interior (${rooms.length})`}>
            {rooms.length === 0 ? (
              <Row label="No rooms added" value="—" warn />
            ) : (
              rooms.map(room => {
                const photoCount = room.photos.length
                return (
                  <Row
                    key={room.id}
                    label={room.name}
                    value={photoCount === 0 ? 'no photos' : `${photoCount} ${photoCount === 1 ? 'photo' : 'photos'}`}
                    warn={photoCount === 0}
                  />
                )
              })
            )}
          </SectionCard>
        )}
      </div>

      {/* Footer */}
      <div style={footerStyle}>
        {warnings.length > 0 && (
          <div style={warningBannerStyle}>
            ⚠ Some areas are missing photos. You can submit anyway, or go back to add them.
          </div>
        )}
        <div style={btnRowStyle}>
          <button type="button" style={backBtnStyle} onClick={onBack} disabled={submitting}>
            ← Back
          </button>
          <button
            type="button"
            style={submitBtnStyle}
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? 'Submitting…' : 'Submit Inspection →'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

**Step 2: Build check**

```bash
cd frontend && npx tsc --noEmit
```
Expected: no errors.

**Step 3: Commit**

```bash
git add frontend/src/components/contractor-wizard-v2/steps/DataCheckStep.tsx
git commit -m "feat: DataCheckStep — summary checklist, warning banner, success screen"
```

---

### Task 6 (frontend Task 12): Wire DataCheckStep into ContractorWizardV2

**Files:**
- Modify: `frontend/src/components/contractor-wizard-v2/ContractorWizardV2.tsx`

**Background:** Read the file before editing. Currently:
- `currentStep === 4` renders `<RoomsStep>`
- `currentStep > 4` renders the "Step 5 coming soon" placeholder (lines 90–94)

The edit: import `DataCheckStep`, replace the `currentStep > 4` placeholder.

**Step 1: Add DataCheckStep import**

```typescript
import DataCheckStep from './steps/DataCheckStep'
```

**Step 2: Replace `currentStep > 4` placeholder**

Find:
```tsx
{state.currentStep > 4 && (
  <div style={{ padding: '32px 16px', textAlign: 'center' }}>
    <h2 style={{ fontSize: '20px', fontWeight: 700 }}>Step 5 coming soon</h2>
  </div>
)}
```

Replace with:
```tsx
{state.currentStep === 5 && (
  <DataCheckStep
    quickSetup={state.quickSetup}
    elevations={state.elevations}
    roof={state.roof}
    roofDamageSpots={state.roofDamageSpots}
    rooms={state.rooms}
    elevationLoading={state.elevationLoading}
    roofLoading={state.roofLoading}
    roomsLoading={state.roomsLoading}
    submittedAt={state.submittedAt}
    onSubmit={state.submitInspection}
    onBack={() => state.setCurrentStep(state.computePrevStep(5))}
  />
)}
```

**Step 3: Full build check**

```bash
cd frontend && npx tsc --noEmit && npx vite build
```
Expected: zero errors.

**Step 4: Commit**

```bash
git add frontend/src/components/contractor-wizard-v2/ContractorWizardV2.tsx
git commit -m "feat: wire DataCheckStep into wizard — Slice 5 complete"
```
