# Guided Contractor Scope Sheet Wizard - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development OR superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace two-tab contractor upload with 10-step guided wizard for property damage assessment.

**Architecture:** Wizard state machine with auto-save drafts, photo upload integration, and mobile-first UI. Backend draft persistence enables resume capability.

**Tech Stack:** React 18 + TypeScript, TanStack Query, Tailwind CSS, Go (Gin), PostgreSQL

---

## Task 1: Backend - Draft Save Endpoint

**Files:**
- Modify: `backend/internal/handlers/magic_link_handler.go`
- Modify: `backend/internal/services/magic_link_service.go`
- Modify: `backend/internal/models/scope_sheet.go`
- Modify: `backend/internal/api/router.go`

**Step 1: Add draft storage to ScopeSheet model**

In `backend/internal/models/scope_sheet.go`, add fields:

```go
type ScopeSheet struct {
    // ... existing fields ...

    // Draft tracking
    IsDraft      bool       `json:"is_draft" db:"is_draft"`
    DraftStep    *int       `json:"draft_step,omitempty" db:"draft_step"` // Which step they were on
    DraftSavedAt *time.Time `json:"draft_saved_at,omitempty" db:"draft_saved_at"`
}
```

**Step 2: Create SaveDraft method**

In `backend/internal/services/magic_link_service.go`, add method:

```go
func (s *MagicLinkService) SaveScopeDraft(token string, draftData *models.ScopeSheet, currentStep int) error {
    // Validate token
    validation, err := s.ValidateToken(token)
    if err != nil || !validation.Valid {
        return fmt.Errorf("invalid token")
    }

    claimID := validation.Claim.ID
    now := time.Now()

    // Check if draft already exists
    var existingID string
    checkQuery := `SELECT id FROM scope_sheets WHERE claim_id = $1 AND is_draft = true LIMIT 1`
    err = s.db.QueryRow(checkQuery, claimID).Scan(&existingID)

    if err == sql.ErrNoRows {
        // Insert new draft
        draftData.ID = uuid.New().String()
        draftData.ClaimID = claimID
        draftData.IsDraft = true
        draftData.DraftStep = &currentStep
        draftData.DraftSavedAt = &now

        // INSERT query with all scope_sheet fields + is_draft, draft_step, draft_saved_at
        // ... (full insert implementation)
    } else if err == nil {
        // Update existing draft
        draftData.ID = existingID
        draftData.DraftStep = &currentStep
        draftData.DraftSavedAt = &now

        // UPDATE query
        // ... (full update implementation)
    } else {
        return fmt.Errorf("failed to check for existing draft: %w", err)
    }

    return nil
}
```

**Step 3: Create GetDraft method**

In `backend/internal/services/magic_link_service.go`, add method:

```go
func (s *MagicLinkService) GetScopeDraft(token string) (*models.ScopeSheet, error) {
    // Validate token
    validation, err := s.ValidateToken(token)
    if err != nil || !validation.Valid {
        return nil, fmt.Errorf("invalid token")
    }

    claimID := validation.Claim.ID

    query := `SELECT * FROM scope_sheets WHERE claim_id = $1 AND is_draft = true LIMIT 1`

    var draft models.ScopeSheet
    err = s.db.QueryRow(query, claimID).Scan(/* all fields */)

    if err == sql.ErrNoRows {
        return nil, nil // No draft exists
    }
    if err != nil {
        return nil, fmt.Errorf("failed to get draft: %w", err)
    }

    return &draft, nil
}
```

**Step 4: Add handler methods**

In `backend/internal/handlers/magic_link_handler.go`, add:

```go
func (h *MagicLinkHandler) SaveScopeDraft(c *gin.Context) {
    token := c.Param("token")

    var input struct {
        ScopeData   *models.ScopeSheet `json:"scope_data"`
        CurrentStep int                `json:"current_step"`
    }

    if err := c.ShouldBindJSON(&input); err != nil {
        c.JSON(400, gin.H{"error": "Invalid request"})
        return
    }

    err := h.magicLinkService.SaveScopeDraft(token, input.ScopeData, input.CurrentStep)
    if err != nil {
        c.JSON(500, gin.H{"error": err.Error()})
        return
    }

    c.JSON(200, gin.H{"message": "Draft saved"})
}

func (h *MagicLinkHandler) GetScopeDraft(c *gin.Context) {
    token := c.Param("token")

    draft, err := h.magicLinkService.GetScopeDraft(token)
    if err != nil {
        c.JSON(500, gin.H{"error": err.Error()})
        return
    }

    if draft == nil {
        c.JSON(404, gin.H{"error": "No draft found"})
        return
    }

    c.JSON(200, gin.H{"data": draft})
}
```

**Step 5: Register routes**

In `backend/internal/api/router.go`, add:

```go
magicLink.POST("/:token/scope-sheet/draft", magicLinkHandler.SaveScopeDraft)
magicLink.GET("/:token/scope-sheet/draft", magicLinkHandler.GetScopeDraft)
```

**Step 6: Update database schema**

Create migration file `backend/migrations/YYYYMMDDHHMMSS_add_scope_draft_fields.sql`:

```sql
ALTER TABLE scope_sheets
ADD COLUMN is_draft BOOLEAN DEFAULT false,
ADD COLUMN draft_step INTEGER,
ADD COLUMN draft_saved_at TIMESTAMP;

CREATE INDEX idx_scope_sheets_claim_draft ON scope_sheets(claim_id, is_draft) WHERE is_draft = true;
```

**Step 7: Run migration**

```bash
cd backend
# Apply migration using your migration tool
# Verify schema changes
```

**Step 8: Test backend**

```bash
# Start backend server
cd backend
go run cmd/server/main.go

# Test draft save (use curl or Postman)
# Test draft retrieve
# Verify database has draft records
```

**Step 9: Commit backend changes**

```bash
git add backend/
git commit -m "feat(backend): add scope sheet draft save/retrieve endpoints

- Add is_draft, draft_step, draft_saved_at fields to scope_sheets table
- Implement SaveScopeDraft and GetScopeDraft service methods
- Add POST/GET /api/magic-links/:token/scope-sheet/draft endpoints
- Enable contractors to save progress and resume later

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 2: Frontend - Shared Types & State

**Files:**
- Create: `frontend/src/components/contractor-wizard/types.ts`
- Create: `frontend/src/components/contractor-wizard/useWizardState.ts`

**Step 1: Create wizard types**

Create `frontend/src/components/contractor-wizard/types.ts`:

```typescript
import { ScopeSheetData } from '../ScopeSheetForm'

export interface WizardState {
  currentStep: number
  totalSteps: number
  hasSecondaryRoof: boolean | null
  wizardData: ScopeSheetData
  completedSteps: number[]
  photos: UploadedFile[]
}

export interface UploadedFile {
  file: File
  documentId?: string
  uploading: boolean
  uploaded: boolean
  error?: string
}

export interface StepProps {
  wizardState: WizardState
  onNext: (data?: Partial<ScopeSheetData>) => Promise<void>
  onBack: () => void
  onUpdateData: (data: Partial<ScopeSheetData>) => void
  submitting: boolean
}
```

**Step 2: Create wizard state hook**

Create `frontend/src/components/contractor-wizard/useWizardState.ts`:

```typescript
import { useState, useCallback } from 'react'
import { WizardState } from './types'
import { ScopeSheetData } from '../ScopeSheetForm'
import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080'

export function useWizardState(token: string) {
  const [wizardState, setWizardState] = useState<WizardState>({
    currentStep: 1,
    totalSteps: 10,
    hasSecondaryRoof: null,
    wizardData: {} as ScopeSheetData,
    completedSteps: [],
    photos: [],
  })

  const [saving, setSaving] = useState(false)

  // Load draft from backend
  const loadDraft = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/api/magic-links/${token}/scope-sheet/draft`)
      const draft = response.data.data

      setWizardState(prev => ({
        ...prev,
        currentStep: draft.draft_step || 1,
        wizardData: draft,
        hasSecondaryRoof: !!draft.roof_other_type, // Infer from data
      }))

      return draft
    } catch (err) {
      // No draft found, that's okay
      return null
    }
  }, [token])

  // Save draft to backend
  const saveDraft = useCallback(async (currentStep: number) => {
    setSaving(true)
    try {
      await axios.post(`${API_URL}/api/magic-links/${token}/scope-sheet/draft`, {
        scope_data: wizardState.wizardData,
        current_step: currentStep,
      })
    } catch (err) {
      console.error('Failed to save draft:', err)
      throw err
    } finally {
      setSaving(false)
    }
  }, [token, wizardState.wizardData])

  // Navigate to next step
  const goNext = useCallback(async (stepData?: Partial<ScopeSheetData>) => {
    // Update wizard data if provided
    if (stepData) {
      setWizardState(prev => ({
        ...prev,
        wizardData: { ...prev.wizardData, ...stepData },
      }))
    }

    // Mark current step as completed
    const newCompletedSteps = [...wizardState.completedSteps]
    if (!newCompletedSteps.includes(wizardState.currentStep)) {
      newCompletedSteps.push(wizardState.currentStep)
    }

    // Calculate next step (accounting for conditional secondary roof)
    let nextStep = wizardState.currentStep + 1
    if (wizardState.currentStep === 3 && wizardState.hasSecondaryRoof === false) {
      nextStep = 5 // Skip step 4 (secondary roof)
    }

    // Save draft before moving to next step
    await saveDraft(nextStep)

    setWizardState(prev => ({
      ...prev,
      currentStep: nextStep,
      completedSteps: newCompletedSteps,
    }))
  }, [wizardState, saveDraft])

  // Navigate to previous step
  const goBack = useCallback(() => {
    let prevStep = wizardState.currentStep - 1
    if (wizardState.currentStep === 5 && wizardState.hasSecondaryRoof === false) {
      prevStep = 3 // Skip step 4 (secondary roof)
    }

    setWizardState(prev => ({
      ...prev,
      currentStep: Math.max(1, prevStep),
    }))
  }, [wizardState])

  // Update wizard data
  const updateData = useCallback((data: Partial<ScopeSheetData>) => {
    setWizardState(prev => ({
      ...prev,
      wizardData: { ...prev.wizardData, ...data },
    }))
  }, [])

  // Set whether secondary roof exists
  const setHasSecondaryRoof = useCallback((has: boolean) => {
    setWizardState(prev => ({
      ...prev,
      hasSecondaryRoof: has,
      totalSteps: has ? 10 : 9, // Adjust total if skipping step 4
    }))
  }, [])

  return {
    wizardState,
    setWizardState,
    loadDraft,
    saveDraft,
    goNext,
    goBack,
    updateData,
    setHasSecondaryRoof,
    saving,
  }
}
```

**Step 3: Commit shared state**

```bash
git add frontend/src/components/contractor-wizard/
git commit -m "feat(frontend): add wizard state management

- Create wizard types and state interface
- Implement useWizardState hook with draft save/load
- Handle step navigation with secondary roof conditional logic

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 3: Frontend - Progress Component

**Files:**
- Create: `frontend/src/components/contractor-wizard/WizardProgress.tsx`

**Step 1: Use frontend-design skill**

Invoke `@frontend-design` skill with prompt:

```
Create a mobile-first wizard progress component:
- Sticky at top of screen
- Shows "Step X of Y" text
- Horizontal progress bar with fill (teal gradient)
- Checkmarks on completed steps
- Clean, modern design matching teal/navy color scheme
- Large tap targets for mobile
```

Expected output: Complete React component with Tailwind styling

**Step 2: Save component**

Save output from frontend-design skill to:
`frontend/src/components/contractor-wizard/WizardProgress.tsx`

**Step 3: Test component**

Create test file to verify:
- Progress bar renders correctly
- Completed steps show checkmarks
- Responsive on mobile

**Step 4: Commit**

```bash
git add frontend/src/components/contractor-wizard/WizardProgress.tsx
git commit -m "feat(frontend): add wizard progress indicator

- Sticky progress bar with step counter
- Visual fill based on current step
- Checkmarks for completed steps
- Mobile-optimized with large touch targets

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 4: Frontend - Step 1 Welcome

**Files:**
- Create: `frontend/src/components/contractor-wizard/Step1Welcome.tsx`

**Step 1: Use frontend-design skill**

Invoke `@frontend-design` skill with prompt:

```
Create Step 1 Welcome screen for contractor wizard:
- Greeting: "Hi [Contractor Name]!"
- Claim context card showing property, address, loss type, incident date
- Explanation: "We'll guide you through assessing the property damage. This should take 10-15 minutes."
- What to prepare: "Have a measuring tape, photos of damage, and notepad handy"
- Large "Let's Get Started" CTA button
- Friendly, encouraging tone with modern glassmorphism design
- Teal/navy color scheme
```

Expected output: Complete React component

**Step 2: Integrate with wizard state**

Modify generated component to accept `StepProps` and use claim data from validation result.

**Step 3: Test**

- Verify claim context card displays correctly
- Verify "Let's Get Started" calls `onNext()`
- Check mobile responsiveness

**Step 4: Commit**

```bash
git add frontend/src/components/contractor-wizard/Step1Welcome.tsx
git commit -m "feat(frontend): add wizard step 1 welcome screen

- Personalized greeting with contractor name
- Claim context card with property details
- Clear instructions and time estimate
- Encouraging tone for contractor experience

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 5: Frontend - Step 2 Photo Upload

**Files:**
- Create: `frontend/src/components/contractor-wizard/Step2Photos.tsx`
- Reuse: Photo upload logic from existing `ContractorUpload.tsx`

**Step 1: Extract photo upload logic**

From `frontend/src/pages/ContractorUpload.tsx`, extract:
- `handlePhotoSelect` function
- `removePhoto` function
- `uploadFile` function
- `UploadedFile` interface (already in types.ts)

**Step 2: Use frontend-design skill**

Invoke `@frontend-design` skill with prompt:

```
Create Step 2 Photos screen for contractor wizard:
- Heading: "Upload Damage Photos"
- Instructions with bullet points (overall views, close-ups, roof damage)
- Large camera button for mobile photo capture (accept="image/*" capture="environment" multiple)
- Thumbnail grid showing uploaded photos with file names
- Remove button (X) on each thumbnail
- Upload progress indicators
- Minimum 1 photo required message
- "Continue to Assessment" button (enabled only if at least 1 photo uploaded)
- Clean, card-based layout with teal accent colors
```

**Step 3: Integrate upload logic**

Wire up upload functions:
- Photo selection → add to wizardState.photos
- Upload to backend via 3-step flow
- Show progress during upload
- Enable Next button when photos.length >= 1

**Step 4: Test**

- Select photos → verify thumbnails appear
- Upload photos → verify progress indicators
- Remove photo → verify thumbnail removed
- Next button → only enabled with photos

**Step 5: Commit**

```bash
git add frontend/src/components/contractor-wizard/Step2Photos.tsx
git commit -m "feat(frontend): add wizard step 2 photo upload

- Mobile-optimized camera capture
- Thumbnail grid with remove functionality
- Upload progress indicators
- Minimum 1 photo validation

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 6: Frontend - Step 3 Main Roof

**Files:**
- Create: `frontend/src/components/contractor-wizard/Step3MainRoof.tsx`

**Step 1: Use frontend-design skill**

Invoke `@frontend-design` skill with prompt:

```
Create Step 3 Main Roof Assessment form:

Sections (all on same scrollable step):
1. Basic Info: Roof Type (text), Roof Pitch (text), Square Footage (number)
2. Fascia: Linear Feet (number) + Needs Paint (checkbox)
3. Soffit: Linear Feet (number) + Needs Paint (checkbox)
4. Drip Edge: Linear Feet (number) + Needs Paint (checkbox)
5. Vents & Accessories: Pipe Jacks, Ex Vents, Turbines, Furnaces, Power Vents (each: count + paint checkbox)
6. Other Items: Ridge, Satellites, Step Flashing, Chimney Flashing, Rain Diverter, Skylights
7. Conditional question at end: "Is there a secondary roof structure?" Yes/No buttons

Design requirements:
- Group related fields in light background cards
- Help text placeholders (e.g., "e.g., Composition Shingle")
- Large input fields for mobile
- Visual separation between sections
- All fields optional
- Teal/navy color scheme
```

**Step 2: Wire up conditional logic**

When user selects "Yes" for secondary roof:
- Call `setHasSecondaryRoof(true)`
- This adjusts totalSteps to 10

When "No":
- Call `setHasSecondaryRoof(false)`
- Adjusts totalSteps to 9 (skips step 4)

**Step 3: Save data on Next**

Call `onNext(roofData)` to save all roof fields to wizard state.

**Step 4: Test**

- Fill out form → verify all fields accept input
- Select "Yes" secondary roof → verify state updated
- Select "No" → verify step 4 will be skipped
- Next button → saves data

**Step 5: Commit**

```bash
git add frontend/src/components/contractor-wizard/Step3MainRoof.tsx
git commit -m "feat(frontend): add wizard step 3 main roof assessment

- Comprehensive roof damage form with grouped sections
- Conditional secondary roof question
- Mobile-optimized input fields with help text
- All fields optional for flexibility

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 7: Frontend - Step 4 Secondary Roof

**Files:**
- Create: `frontend/src/components/contractor-wizard/Step4SecondaryRoof.tsx`

**Step 1: Reuse Step 3 component structure**

Copy Step 3 component and modify:
- Change heading to "Secondary Roof Assessment"
- Add explanatory text: "Assess the secondary structure (garage, porch, etc.)"
- Use `roof_other_*` field names instead of `roof_*`
- Remove conditional question (not needed here)

**Step 2: Use frontend-design skill (optional)**

If needed, invoke `@frontend-design` to create a variant with secondary roof styling.

**Step 3: Save data on Next**

Call `onNext(secondaryRoofData)` with all `roof_other_*` fields.

**Step 4: Test**

- Fill out form → verify saves to wizard state
- Verify this step only shows when hasSecondaryRoof === true

**Step 5: Commit**

```bash
git add frontend/src/components/contractor-wizard/Step4SecondaryRoof.tsx
git commit -m "feat(frontend): add wizard step 4 secondary roof assessment

- Conditional step (only shown if secondary structure exists)
- Same structure as main roof for consistency
- Uses roof_other_* fields for backend compatibility

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 8: Frontend - Exterior Assessment Shared Component

**Files:**
- Create: `frontend/src/components/contractor-wizard/ExteriorSideForm.tsx`
- Create: `frontend/src/components/contractor-wizard/Step5678Exterior.tsx`

**Step 1: Create reusable side component**

Create `ExteriorSideForm.tsx`:

```typescript
interface ExteriorSideFormProps {
  side: 'front' | 'right' | 'back' | 'left'
  data: Partial<ScopeSheetData>
  onChange: (data: Partial<ScopeSheetData>) => void
}

export function ExteriorSideForm({ side, data, onChange }: ExteriorSideFormProps) {
  // Field name prefix based on side (e.g., "front_siding_1_replace_sf")
  const prefix = side

  // Render form sections:
  // - Siding (1 & 2): Replace SF, Paint SF
  // - Gutters: LF + Paint checkbox
  // - Openings: Windows, Screens, Doors (text inputs)
  // - AC Unit: Replace checkbox, Comb Fins checkbox

  // Use frontend-design skill to create beautiful card-based layout
}
```

**Step 2: Use frontend-design skill**

Invoke `@frontend-design` skill with prompt:

```
Create ExteriorSideForm component for property side assessment:

Heading: "[Front/Right/Back/Left] Exterior Assessment"

Sections:
1. Siding: Siding 1 Replace SF, Siding 1 Paint SF, Siding 2 Replace SF, Siding 2 Paint SF
2. Gutters: Linear Feet + Needs Paint checkbox
3. Openings: Windows (text), Screens (text), Doors (text) with placeholder examples
4. AC Unit: Replace checkbox, Comb Fins checkbox

Design:
- Grouped in visual cards with light backgrounds
- Mobile-optimized number inputs (numeric keyboard)
- Help text placeholders
- All fields optional
- Teal/navy color scheme
```

**Step 3: Create wrapper steps**

Create `Step5678Exterior.tsx`:

```typescript
export function Step5FrontExterior({ wizardState, onNext, onBack, onUpdateData }: StepProps) {
  return (
    <ExteriorSideForm
      side="front"
      data={wizardState.wizardData}
      onChange={onUpdateData}
    />
    // Include Back/Next buttons
  )
}

// Repeat for Step6RightExterior, Step7BackExterior, Step8LeftExterior
```

**Step 4: Test**

- Each step uses correct field prefix (front_, right_, back_, left_)
- Form data saves correctly to wizard state
- Mobile inputs work properly

**Step 5: Commit**

```bash
git add frontend/src/components/contractor-wizard/ExteriorSideForm.tsx
git add frontend/src/components/contractor-wizard/Step5678Exterior.tsx
git commit -m "feat(frontend): add wizard steps 5-8 exterior assessments

- Reusable ExteriorSideForm component for DRY code
- Identical layout for front, right, back, left sides
- Siding, gutters, openings, AC damage fields
- Mobile-optimized with grouped visual cards

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 9: Frontend - Step 9 Dimensions

**Files:**
- Create: `frontend/src/components/contractor-wizard/Step9Dimensions.tsx`

**Step 1: Use frontend-design skill**

Invoke `@frontend-design` skill with prompt:

```
Create Step 9 Dimensions & Additional Items form:

Sections:
1. Dimensions:
   - Porch Needs Paint (checkbox)
   - Patio Needs Paint (checkbox)
   - Fence (text input with placeholder "Describe fence damage if applicable")

2. Additional Items:
   - Additional Items (Main Roof) - textarea (4 rows)
   - Additional Items (Other Roof) - textarea (4 rows)
   - General Notes - textarea (6 rows)

Design:
- Large textareas for mobile typing
- Helpful placeholder text with examples
- Encourage detail: "Any additional observations about the property damage"
- Light card backgrounds
- Teal/navy color scheme
```

**Step 2: Wire up data**

Save data on Next:
```typescript
onNext({
  porch_paint: porchPaint,
  patio_paint: patioPaint,
  fence: fenceDescription,
  additional_items_main: additionalMain,
  additional_items_other: additionalOther,
  notes: generalNotes,
})
```

**Step 3: Test**

- Fill textareas → verify saves to wizard state
- All fields optional → can proceed with empty fields

**Step 4: Commit**

```bash
git add frontend/src/components/contractor-wizard/Step9Dimensions.tsx
git commit -m "feat(frontend): add wizard step 9 dimensions and notes

- Porch, patio, fence damage fields
- Large textareas for additional items and general notes
- Encourages detailed observations from contractor

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 10: Frontend - Step 10 Review & Submit

**Files:**
- Create: `frontend/src/components/contractor-wizard/Step10Review.tsx`

**Step 1: Use frontend-design skill**

Invoke `@frontend-design` skill with prompt:

```
Create Step 10 Review & Submit screen:

Layout:
- Summary cards for each completed section (only show sections with data)
- Each card shows:
  - Section heading (e.g., "Main Roof Assessment")
  - List of filled-in fields with values
  - "Edit" button to jump back to that step
- Large "Submit Assessment" CTA button at bottom
- Success screen after submit:
  - Green checkmark icon
  - "Thank you! Your assessment has been submitted."
  - "The property manager will review your submission shortly."

Design:
- Card-based layout with clear hierarchy
- Only display non-empty fields
- Prominent submit button
- Clean success screen with closure
- Teal/navy color scheme
```

**Step 2: Implement edit functionality**

When user clicks "Edit [Section]":
```typescript
const handleEdit = (stepNumber: number) => {
  setWizardState(prev => ({ ...prev, currentStep: stepNumber }))
}
```

**Step 3: Implement submit**

Call final submission endpoint:
```typescript
const handleSubmit = async () => {
  try {
    await axios.post(`${API_URL}/api/magic-links/${token}/scope-sheet`, wizardState.wizardData)
    setSubmitted(true)
  } catch (err) {
    // Show error
  }
}
```

**Step 4: Test**

- Review screen shows all entered data
- Edit button navigates back to correct step
- Submit button calls API and shows success screen
- Success screen provides closure

**Step 5: Commit**

```bash
git add frontend/src/components/contractor-wizard/Step10Review.tsx
git commit -m "feat(frontend): add wizard step 10 review and submit

- Summary cards for all completed sections
- Edit functionality to jump back and modify
- Final submit with success confirmation
- Clean closure for contractor experience

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 11: Frontend - Main Wizard Orchestrator

**Files:**
- Create: `frontend/src/components/contractor-wizard/ContractorWizard.tsx`
- Modify: `frontend/src/pages/ContractorUpload.tsx`

**Step 1: Create main wizard component**

Create `ContractorWizard.tsx`:

```typescript
import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useWizardState } from './useWizardState'
import WizardProgress from './WizardProgress'
import Step1Welcome from './Step1Welcome'
import Step2Photos from './Step2Photos'
import Step3MainRoof from './Step3MainRoof'
import Step4SecondaryRoof from './Step4SecondaryRoof'
import { Step5FrontExterior, Step6RightExterior, Step7BackExterior, Step8LeftExterior } from './Step5678Exterior'
import Step9Dimensions from './Step9Dimensions'
import Step10Review from './Step10Review'

interface ContractorWizardProps {
  token: string
  validationResult: ValidationResult
}

export default function ContractorWizard({ token, validationResult }: ContractorWizardProps) {
  const {
    wizardState,
    loadDraft,
    goNext,
    goBack,
    updateData,
    setHasSecondaryRoof,
    saving,
  } = useWizardState(token)

  // Load draft on mount
  useEffect(() => {
    loadDraft()
  }, [loadDraft])

  // Render current step
  const renderStep = () => {
    const stepProps = {
      wizardState,
      onNext: goNext,
      onBack: goBack,
      onUpdateData: updateData,
      submitting: saving,
    }

    switch (wizardState.currentStep) {
      case 1:
        return <Step1Welcome {...stepProps} validationResult={validationResult} />
      case 2:
        return <Step2Photos {...stepProps} token={token} />
      case 3:
        return <Step3MainRoof {...stepProps} onSetSecondaryRoof={setHasSecondaryRoof} />
      case 4:
        return <Step4SecondaryRoof {...stepProps} />
      case 5:
        return <Step5FrontExterior {...stepProps} />
      case 6:
        return <Step6RightExterior {...stepProps} />
      case 7:
        return <Step7BackExterior {...stepProps} />
      case 8:
        return <Step8LeftExterior {...stepProps} />
      case 9:
        return <Step9Dimensions {...stepProps} />
      case 10:
        return <Step10Review {...stepProps} token={token} />
      default:
        return <Step1Welcome {...stepProps} validationResult={validationResult} />
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <WizardProgress
        currentStep={wizardState.currentStep}
        totalSteps={wizardState.totalSteps}
        completedSteps={wizardState.completedSteps}
      />

      <div className="pb-24">
        {renderStep()}
      </div>
    </div>
  )
}
```

**Step 2: Modify ContractorUpload.tsx**

Replace the existing two-tab interface with the wizard:

```typescript
// In ContractorUpload.tsx, replace the main interface section with:

if (!error && validationResult && validationResult.valid) {
  return <ContractorWizard token={token!} validationResult={validationResult} />
}
```

Keep the loading, error, and validation logic.

**Step 3: Remove old components**

Remove or comment out the old:
- Step tabs (Photos/Scope Sheet)
- ScopeSheetForm usage
- Estimate PDF upload section

**Step 4: Test full wizard flow**

Test entire flow:
1. Token validation → Welcome screen
2. Welcome → Photo upload
3. Photos → Main roof
4. Main roof (Yes secondary) → Secondary roof → Front exterior
5. Main roof (No secondary) → Front exterior (skips step 4)
6. All exterior sides → Dimensions → Review
7. Review → Submit → Success screen

Verify:
- Navigation works (Back/Next)
- Data persists across steps
- Draft auto-saves
- Resume works (refresh page)
- Submit creates final scope sheet

**Step 5: Commit**

```bash
git add frontend/src/components/contractor-wizard/ContractorWizard.tsx
git add frontend/src/pages/ContractorUpload.tsx
git commit -m "feat(frontend): integrate wizard into contractor upload flow

- Main ContractorWizard orchestrator component
- Replace two-tab interface with 10-step wizard
- Draft auto-save on each step
- Resume capability after page refresh
- Complete end-to-end guided experience

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 12: Testing & Polish

**Files:**
- Test all wizard steps
- Verify mobile responsiveness
- Check error handling

**Step 1: Manual testing checklist**

Test on desktop and mobile:
- [ ] Token validation (valid, expired, invalid)
- [ ] Welcome screen displays claim context
- [ ] Photo upload (select, remove, upload progress)
- [ ] Main roof form (all fields, conditional secondary roof)
- [ ] Secondary roof (only shows when selected)
- [ ] All 4 exterior sides (front, right, back, left)
- [ ] Dimensions and notes
- [ ] Review screen (shows all data, edit buttons work)
- [ ] Submit (creates scope sheet, shows success)
- [ ] Draft save/load (refresh page, resume works)
- [ ] Back navigation
- [ ] Progress bar accuracy

**Step 2: Fix any bugs found**

Document and fix issues discovered during testing.

**Step 3: Mobile testing**

Test on actual mobile device or emulator:
- Touch targets large enough (44px minimum)
- Numeric keyboard appears for number inputs
- Camera capture works
- Scroll behavior smooth
- Progress bar stays sticky

**Step 4: Accessibility check**

- Proper labels on form fields
- Keyboard navigation works
- Color contrast meets WCAG standards

**Step 5: Commit any fixes**

```bash
git add .
git commit -m "fix(frontend): polish wizard UX and fix bugs

- Fix touch target sizes for mobile
- Improve error messages
- Fix scroll behavior
- Enhance accessibility

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 13: Remove Estimate PDF Upload

**Files:**
- Modify: `frontend/src/pages/ContractorUpload.tsx` (if not already done)
- Modify: `frontend/src/components/contractor-wizard/Step2Photos.tsx`

**Step 1: Remove estimate upload logic**

Ensure no references to estimate PDF remain:
- Remove estimate file input
- Remove estimate upload functions
- Remove estimate from state

**Step 2: Update instructions**

In Step 2 Photos, remove any mention of estimate PDF.

**Step 3: Commit**

```bash
git add .
git commit -m "feat: remove estimate PDF upload from contractor flow

Contractors will email estimates separately when ready.
Focus wizard on photos and scope sheet only.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 14: Documentation

**Files:**
- Create: `docs/contractor-wizard-guide.md`
- Update: `README.md`

**Step 1: Create contractor wizard guide**

Document:
- How the wizard works
- Step-by-step flow
- Draft save mechanism
- Backend API endpoints
- How to test locally

**Step 2: Update README**

Add section about contractor wizard feature.

**Step 3: Commit**

```bash
git add docs/ README.md
git commit -m "docs: add contractor wizard documentation

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 15: Final Integration Testing

**Step 1: End-to-end test**

Complete full flow:
1. Generate magic link from admin panel
2. Access link as contractor
3. Complete entire wizard
4. Verify scope sheet saved in database
5. Verify admin can view submitted scope sheet

**Step 2: Edge case testing**

- Expired magic link
- Already completed magic link
- Network errors during draft save
- Browser refresh at each step
- Multiple contractors (concurrent sessions)

**Step 3: Performance check**

- Page load time < 2 seconds
- Photo upload time reasonable
- Draft save < 500ms

**Step 4: Final commit**

```bash
git add .
git commit -m "test: complete end-to-end wizard testing

All tests passing. Ready for production.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Execution Notes

**Required Skills:**
- Use `@frontend-design` skill for ALL UI component creation
- Mobile-first approach for all designs
- Teal/navy color scheme throughout

**Testing Strategy:**
- Test after each task
- Commit frequently
- Keep commits small and focused

**DRY Principle:**
- Reuse ExteriorSideForm for steps 5-8
- Extract common UI patterns
- Share types across components

**YAGNI:**
- No video upload (future enhancement)
- No offline-first PWA (future enhancement)
- No OCR (future enhancement)
- Focus on core wizard functionality only

---

## Success Criteria

- [ ] Wizard has 10 steps (9 if no secondary roof)
- [ ] Progress bar shows current step accurately
- [ ] Draft auto-saves on each Next click
- [ ] Resume works after page refresh
- [ ] All form fields map to ScopeSheetData interface
- [ ] Photo upload works with existing 3-step flow
- [ ] Review screen shows all entered data
- [ ] Submit creates final scope sheet in database
- [ ] Success screen provides closure
- [ ] Mobile-optimized (large touch targets, numeric keyboards)
- [ ] Backend endpoints handle drafts correctly
- [ ] No TypeScript errors
- [ ] Build succeeds

---

**Ready to implement!** Use superpowers:subagent-driven-development or superpowers:executing-plans to execute this plan task-by-task.
