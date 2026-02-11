# Contractor Scope Sheet Wizard Guide

## Overview

The Contractor Wizard is a mobile-first, guided 10-step interface that walks contractors through comprehensive property damage assessment. It replaces the previous two-tab interface with a streamlined flow optimized for on-site data collection.

## Features

- **10-Step Guided Flow**: Breaks complex assessment into manageable sections
- **Auto-Save Drafts**: Automatically saves progress after each step
- **Resume Capability**: Contractors can close browser and resume later
- **Conditional Logic**: Skips secondary roof assessment if not needed
- **Mobile-Optimized**: Large touch targets, numeric keyboards, camera integration
- **Photo Upload**: Supports multiple photos with progress tracking
- **Progress Indicator**: Visual progress bar shows completion status

## Wizard Flow

### Step 1: Welcome Screen
- Displays claim context (property, loss type, incident date)
- Personalized greeting with contractor name
- Preparation checklist
- Sets expectations for assessment

### Step 2: Photo Upload
- Camera button for mobile capture
- Drag-and-drop for desktop
- Multiple photo selection
- Upload progress per photo
- Error handling with retry

### Step 3: Main Roof Assessment
- **Roof Type**: Asphalt shingle, metal, tile, etc.
- **Pitch**: Select from standard pitches
- **Fascia**: Linear feet + paint needs
- **Soffit**: Linear feet + paint needs
- **Drip Edge**: Linear feet + paint needs
- **Vents & Accessories**: Pipe jacks, turbine vents, ridge vents
- **Other Items**: Valleys, flashing, skylights
- **Secondary Roof Question**: Yes/No determines if Step 4 shows

### Step 4: Secondary Roof (Conditional)
- Only shows if contractor selected "Yes" in Step 3
- Same structure as Step 3 but for garage, porch, etc.
- Uses `roof_other_*` field naming

### Steps 5-8: Exterior Assessment
- **Step 5**: Front Exterior
- **Step 6**: Right Exterior
- **Step 7**: Back Exterior
- **Step 8**: Left Exterior

Each exterior step captures:
- **Siding 1**: Replace SF + Paint SF
- **Siding 2**: Replace SF + Paint SF
- **Gutters**: Linear feet + paint needs
- **Openings**: Windows, screens, doors (text descriptions)
- **AC Unit**: Replace + comb fins damaged

### Step 9: Dimensions & Notes
- **Porch Paint**: Checkbox
- **Patio Paint**: Checkbox
- **Fence**: Text description
- **Additional Items (Main)**: Textarea for main roof notes
- **Additional Items (Secondary)**: Textarea for secondary roof notes
- **General Notes**: Textarea for overall observations

### Step 10: Review & Submit
- Summary cards for completed sections
- Only shows sections with data
- Visual checkmarks for completion
- Large "Submit Scope Sheet" button
- Success screen with confirmation

## Technical Architecture

### Frontend Components

**Core Components**:
- `ContractorWizard.tsx` - Main orchestrator
- `WizardProgress.tsx` - Progress indicator
- `Step1Welcome.tsx` through `Step10Review.tsx` - Individual steps
- `ExteriorSideForm.tsx` - Reusable component for steps 5-8
- `useWizardState.ts` - State management hook

**State Management**:
```typescript
interface WizardState {
  currentStep: number              // Current step (1-10)
  totalSteps: number               // Total steps (9 or 10 depending on secondary roof)
  hasSecondaryRoof: boolean | null // Conditional step logic
  wizardData: ScopeSheetData       // All form data
  completedSteps: number[]         // Steps with saved data
  photos: UploadedFile[]           // Uploaded photos
  draftStep?: number               // Server-saved draft step
}
```

**Auto-Save Logic**:
- Triggers on every `onNext()` call
- Saves current `wizardData` + `currentStep`
- Uses UPSERT to prevent race conditions
- Returns immediately to keep UX snappy

**Conditional Steps**:
- Step 4 (Secondary Roof) only renders if `hasSecondaryRoof === true`
- `goNext()` from Step 3 → skips to Step 5 if `hasSecondaryRoof === false`
- `totalSteps` adjusts (9 vs 10) based on secondary roof selection

### Backend API Endpoints

**Draft Endpoints**:

`POST /api/magic-links/:token/scope-draft`
- Saves draft with current step
- Request body: `{ draft_step: number, ...scopeData }`
- Uses UPSERT to handle concurrent saves
- Returns saved draft object

`GET /api/magic-links/:token/scope-draft`
- Retrieves saved draft for magic link
- Returns 404 if no draft exists (not an error)
- Returns draft with all fields

**Submission Endpoint**:

`POST /api/magic-links/:token/scope-sheet`
- Final submission (creates non-draft scope sheet)
- Request body: All scope sheet data
- Marks magic link as completed
- Returns success/error

### Database Schema

**Draft Fields** (added to `scope_sheets` table):
- `is_draft BOOLEAN` - Distinguishes draft from final submission
- `draft_step INTEGER` - Current step (1-10)
- `draft_saved_at TIMESTAMP` - Last save time
- `UNIQUE INDEX` on `(claim_id) WHERE is_draft = true` - Ensures one draft per claim

**Draft Lifecycle**:
1. Contractor fills Step 1 → Hits "Next"
2. Frontend saves draft with `draft_step: 2`
3. Contractor fills Step 2 → Hits "Next"
4. Frontend updates draft with `draft_step: 3`
5. ... continues through all steps ...
6. Contractor submits on Step 10
7. Backend creates final scope sheet (`is_draft = false`)
8. Draft is deleted (or marked inactive)

## Testing Locally

### Prerequisites
- Backend running on `localhost:8080`
- Frontend running on `localhost:5173`
- Magic link with `pending` status

### Test Flow

1. **Generate Magic Link**:
   ```bash
   # From admin panel or API
   POST /api/claims/:claimId/magic-links
   {
     "contractor_name": "Test Contractor",
     "contractor_email": "test@example.com"
   }
   ```

2. **Access Wizard**:
   ```
   http://localhost:5173/contractor-upload/:token
   ```

3. **Complete Steps**:
   - Fill in Step 1 → Click "Continue"
   - Verify draft saves (check browser console)
   - Refresh page → Verify resume works
   - Complete all 10 steps
   - Submit on Step 10

4. **Verify Database**:
   ```sql
   -- Check drafts
   SELECT * FROM scope_sheets WHERE is_draft = true;

   -- Check final submission
   SELECT * FROM scope_sheets WHERE claim_id = 'your-claim-id' AND is_draft = false;
   ```

### Edge Cases to Test

- **Expired magic link**: Should show error screen
- **Already completed link**: Should show error screen
- **Network error during draft save**: Should show error, allow retry
- **Browser refresh mid-wizard**: Should resume at last saved step
- **Secondary roof selection**: Test both "Yes" (10 steps) and "No" (9 steps)
- **Empty fields**: All fields are optional except photos
- **Multiple photos**: Upload 5+ photos, verify all succeed

## Design System

**Colors**:
- Primary: Teal (`#14B8A6`)
- Secondary: Navy (`#1E3A8A`)
- Background: Slate/Gray gradient
- Success: Green (`#10B981`)
- Error: Red (`#EF4444`)

**Components**:
- `.glass-card` - Glassmorphism card effect
- `.btn-primary` - Teal gradient button
- `.btn-secondary` - Outline button
- `.glass-input` - Subtle input styling

**Animations**:
- `fade-in` - Gentle fade on page load
- `slide-up` - Cards slide up with stagger
- `check-pop` - Checkmark pop on completion
- `scale-in` - Success screen scale

## Troubleshooting

### Draft Not Saving
- Check browser console for API errors
- Verify magic link token is valid
- Check backend logs for UPSERT errors
- Ensure database migration ran (`000009_add_scope_sheet_draft_fields.up.sql`)

### Resume Not Working
- Verify `GET /api/magic-links/:token/scope-draft` returns 200
- Check that `draft_step` is being saved correctly
- Ensure frontend `loadDraft()` is called on mount

### Photos Not Uploading
- Check Supabase storage configuration
- Verify `upload_url` generation works
- Test 3-step upload flow (request URL → S3 → confirm)
- Check file size limits

### Conditional Step Not Working
- Verify `hasSecondaryRoof` state is set correctly in Step 3
- Check `goNext()` logic for step skipping
- Ensure `totalSteps` adjusts based on secondary roof

## Future Enhancements

- [ ] Video upload support
- [ ] Offline-first PWA with IndexedDB caching
- [ ] OCR for extracting measurements from photos
- [ ] GPS tagging for photos
- [ ] Sketch tool for damage diagrams
- [ ] Voice-to-text for notes
- [ ] Multi-language support

## API Reference

### Save Draft

```http
POST /api/magic-links/:token/scope-draft
Content-Type: application/json

{
  "draft_step": 3,
  "roof_type": "asphalt_shingle",
  "fascia_lf": 120,
  "fascia_paint": true,
  // ... other fields
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "claim_id": "uuid",
    "draft_step": 3,
    "draft_saved_at": "2026-02-11T23:00:00Z",
    "roof_type": "asphalt_shingle",
    // ... all saved fields
  }
}
```

### Load Draft

```http
GET /api/magic-links/:token/scope-draft
```

**Response** (draft exists):
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "claim_id": "uuid",
    "draft_step": 3,
    "draft_saved_at": "2026-02-11T23:00:00Z",
    // ... all saved fields
  }
}
```

**Response** (no draft):
```json
{
  "success": false,
  "error": "Draft not found"
}
```
Status: 404

### Submit Scope Sheet

```http
POST /api/magic-links/:token/scope-sheet
Content-Type: application/json

{
  "roof_type": "asphalt_shingle",
  "fascia_lf": 120,
  // ... all scope sheet fields
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "claim_id": "uuid",
    "created_at": "2026-02-11T23:00:00Z",
    // ... all fields
  }
}
```

## Code Style Guide

**TypeScript**:
- Strict type checking enabled
- No `any` types (use `unknown` if type is truly unknown)
- Explicit return types on functions
- Interface over type for object shapes

**React**:
- Functional components only
- Hooks for state management
- PropTypes via TypeScript interfaces
- Controlled components for forms

**Naming Conventions**:
- Components: PascalCase (`Step1Welcome.tsx`)
- Hooks: camelCase with `use` prefix (`useWizardState.ts`)
- Utilities: camelCase (`saveDraft`)
- Constants: SCREAMING_SNAKE_CASE (`API_URL`)

**File Organization**:
```
frontend/src/components/contractor-wizard/
├── ContractorWizard.tsx       # Main orchestrator
├── WizardProgress.tsx          # Progress indicator
├── Step1Welcome.tsx            # Step 1
├── Step2Photos.tsx             # Step 2
├── Step3MainRoof.tsx           # Step 3
├── Step4SecondaryRoof.tsx      # Step 4
├── Step5678Exterior.tsx        # Steps 5-8 wrappers
├── ExteriorSideForm.tsx        # Reusable exterior form
├── Step9Dimensions.tsx         # Step 9
├── Step10Review.tsx            # Step 10
├── useWizardState.ts           # State hook
├── types.ts                    # TypeScript interfaces
└── index.ts                    # Barrel exports
```
