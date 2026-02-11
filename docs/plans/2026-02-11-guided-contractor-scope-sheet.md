# Guided Contractor Scope Sheet Design

**Date:** 2026-02-11
**Goal:** Replace current two-tab contractor upload with guided wizard that walks contractors step-by-step through property damage assessment.

**Priority:** Scope sheet completion is the critical path. Photo upload is secondary.

---

## Overview

Transform the contractor upload experience from an overwhelming tabbed form into a mobile-first wizard that guides contractors through property assessment one section at a time.

**Current Problems:**
- ScopeSheetForm has 4 tabs with dozens of fields (overwhelming on mobile)
- Contractors don't know what to fill out or where to start
- No clear progress indication
- Estimate PDF upload unnecessary (contractors email estimates later)

**Solution:**
- Multi-step wizard with clear progress indication
- One focused section per step
- Auto-save drafts so contractors can return later
- Mobile-first design with large touch targets

---

## Wizard Flow

### Steps (10 total, step 4 conditional)

1. **Welcome & Instructions**
2. **Photo Upload** (general damage photos)
3. **Main Roof Assessment**
4. **Secondary Roof** (conditional - only if indicated)
5. **Front Exterior**
6. **Right Exterior**
7. **Back Exterior**
8. **Left Exterior**
9. **Dimensions & Additional Items**
10. **Review & Submit**

### Progress Indicator
- Sticky header: "Step 3 of 10" with visual progress bar
- Section title displayed prominently
- Green checkmarks on completed steps
- Back/Next navigation at bottom (sticky)

### Navigation Rules
- Can go Back to any previous section
- Can't skip ahead (but no hard validation - warnings only)
- Auto-save on each Next click
- Draft saved to backend, resumes if contractor returns to link

---

## Step-by-Step Content

### Step 1: Welcome & Instructions

**Purpose:** Set expectations and provide context

**Content:**
- Greeting: "Hi [Contractor Name]!"
- Claim context card (property, address, loss type, incident date)
- Explanation: "We'll guide you through assessing the property damage. This should take 10-15 minutes."
- What to prepare: "Have a measuring tape, photos of damage, and notepad handy"
- CTA: "Let's Get Started" button

**Design Notes:**
- Friendly, encouraging tone
- Claim context card uses existing validation data
- Clear time estimate to set expectations

---

### Step 2: Photo Upload

**Purpose:** Collect visual documentation of property damage

**Content:**
- Heading: "Upload Damage Photos"
- Instructions: "Take photos of all visible damage. We recommend:"
  - Overall property views (4 sides)
  - Close-ups of specific damage
  - Roof damage (if accessible/safe)
- Mobile camera button: `<input type="file" accept="image/*" capture="environment" multiple />`
- Thumbnail grid showing uploaded photos with remove buttons
- Minimum: 1 photo required to proceed
- CTA: "Continue to Assessment" button

**Technical:**
- Reuse existing 3-step upload flow:
  1. POST `/api/magic-links/:token/documents/upload-url`
  2. PUT to S3 presigned URL
  3. POST `/api/magic-links/:token/documents/:id/confirm`
- Tag photos as `document_type: "contractor_photo"`
- Optional: Add `metadata: {"section": "overview"}` for organization

**Design Notes:**
- Large camera icon/button for easy mobile capture
- Show file names + thumbnails
- Upload progress indicators
- Allow removing photos before proceeding

---

### Step 3: Main Roof Assessment

**Purpose:** Collect detailed roof damage measurements

**Content Sections (all on same scrollable step):**

**Basic Info:**
- Roof Type (text input: "e.g., Composition Shingle")
- Roof Pitch (text input: "e.g., 4/12")
- Square Footage (number input)

**Fascia:**
- Linear Feet (number input)
- Needs Paint (checkbox)

**Soffit:**
- Linear Feet (number input)
- Needs Paint (checkbox)

**Drip Edge:**
- Linear Feet (number input)
- Needs Paint (checkbox)

**Vents & Accessories:**
- Pipe Jacks: Count + Paint checkbox
- Ex Vents: Count + Paint checkbox
- Turbines: Count + Paint checkbox
- Furnaces: Count + Paint checkbox
- Power Vents: Count + Paint checkbox

**Other Items:**
- Ridge (LF)
- Satellites (count)
- Step Flashing (LF)
- Chimney Flashing (checkbox)
- Rain Diverter (LF)
- Skylights: Count + Damaged checkbox

**Conditional Question (at end):**
"Is there a secondary roof structure (garage, porch, etc.)?"
- Yes → Shows Step 4 (Secondary Roof)
- No → Skips Step 4, adjusts total step count

**Design Notes:**
- Group related fields in visual cards/containers
- Use background shading to separate sections
- Help text with examples for confusing fields
- All fields optional (not all damage types require all measurements)

---

### Step 4: Secondary Roof (Conditional)

**Purpose:** Assess secondary roof structure if exists

**Content:**
Same structure as Step 3, but for secondary roof:
- Roof Type, Pitch
- Fascia, Soffit, Drip Edge
- Vents & Accessories
- Other Items

**Design Notes:**
- Only shown if user answered "Yes" to secondary structure question
- Explain context: "Assess the secondary structure (garage, porch, etc.)"

---

### Steps 5-8: Exterior Assessments (Front, Right, Back, Left)

**Purpose:** Assess each side of property for siding, gutters, windows, AC damage

**Content Pattern (repeated for each side):**

**Heading:** "[Front/Right/Back/Left] Exterior Assessment"

**Siding:**
- Siding 1 Replace (SF)
- Siding 1 Paint (SF)
- Siding 2 Replace (SF)
- Siding 2 Paint (SF)

**Gutters:**
- Linear Feet
- Needs Paint (checkbox)

**Openings:**
- Windows (text: "e.g., 2 damaged")
- Screens (text: "e.g., 1 torn")
- Doors (text: "e.g., front door dented")

**AC Unit:**
- Replace (checkbox)
- Comb Fins (checkbox)

**Optional Photo Prompt:**
- "📷 Tap to add photo of this side" (optional)
- If photo uploaded, tag with `metadata: {"section": "front_exterior"}`

**Design Notes:**
- Identical layout for all 4 sides (consistency)
- Visual card groupings for siding, gutters, openings, AC
- Help text: "Enter measurements and describe any damage"
- All fields optional (damage may not exist on all sides)

---

### Step 9: Dimensions & Additional Items

**Purpose:** Capture miscellaneous damage and notes

**Content:**

**Dimensions:**
- Porch Needs Paint (checkbox)
- Patio Needs Paint (checkbox)
- Fence (text input: "Describe fence damage if applicable")

**Additional Items:**
- Additional Items (Main Roof) - textarea
- Additional Items (Other Roof) - textarea
- General Notes - textarea (large)

**Design Notes:**
- Larger textareas for notes (6 rows)
- Placeholder text with examples
- Encourage detail: "Any additional observations about the property damage"

---

### Step 10: Review & Submit

**Purpose:** Review all entered data before final submission

**Content:**
- Summary cards for each section
- Display only filled-in fields (hide empty sections)
- "Edit [Section Name]" button on each card to jump back
- Final CTA: "Submit Assessment" button (large, prominent)

**Summary Card Structure:**
```
┌─────────────────────────────────┐
│ Main Roof Assessment       Edit │
├─────────────────────────────────┤
│ Roof Type: Composition Shingle  │
│ Square Footage: 2400 SF         │
│ Fascia: 180 LF (needs paint)    │
│ ...                             │
└─────────────────────────────────┘
```

**After Submit:**
- Success screen: "Thank you! Your assessment has been submitted."
- Confirmation message: "The property manager will review your submission shortly."
- Magic link now disabled (status: completed)

**Design Notes:**
- Make it easy to review and edit before final submit
- Clear visual hierarchy for each section
- Large, confident submit button
- Success screen provides closure

---

## Technical Implementation

### State Management

**Component State:**
```typescript
const [wizardData, setWizardData] = useState<ScopeSheetData>({
  // All scope sheet fields initialized
})
const [currentStep, setCurrentStep] = useState(1)
const [totalSteps, setTotalSteps] = useState(10) // Adjusts if secondary roof skipped
const [completedSteps, setCompletedSteps] = useState<number[]>([])
const [hasSecondaryRoof, setHasSecondaryRoof] = useState<boolean | null>(null)
const [photos, setPhotos] = useState<UploadedFile[]>([])
```

### Backend Integration

**Draft Saving:**
- **New endpoint:** `POST /api/magic-links/:token/scope-sheet/draft`
- Saves partial scope sheet data
- Called on every "Next" click
- Returns saved draft data

**Final Submission:**
- **Existing endpoint:** `POST /api/magic-links/:token/scope-sheet`
- Submits complete scope sheet
- Marks magic link as completed
- Creates activity log

**Resume Capability:**
- When contractor accesses magic link, check for existing draft
- **New endpoint:** `GET /api/magic-links/:token/scope-sheet/draft`
- If draft exists, show "Continue where you left off" with resume button
- Load draft data into wizardData state, set currentStep to last completed step + 1

### Photo Upload Flow

**Existing 3-step process (keep as-is):**
1. `POST /api/magic-links/:token/documents/upload-url`
   - Request presigned upload URL from backend
   - Returns: `{upload_url, document_id, file_path}`

2. `PUT [upload_url]` (to Supabase Storage)
   - Upload file directly to storage
   - Content-Type: image/*

3. `POST /api/magic-links/:token/documents/:document_id/confirm`
   - Confirm upload, update document status to "confirmed"
   - Creates activity log entry

**Document Type:**
- All photos tagged as `document_type: "contractor_photo"`
- Optional: Add `metadata` JSON with section info: `{"section": "overview"}` or `{"section": "front_exterior"}`

### Validation

**Per-Step Validation:**
- Step 2 (Photos): Minimum 1 photo required (hard requirement)
- All other steps: No hard requirements
- Show warning if section completely empty: "This section is empty. Skip if no damage exists here."
- Next button always enabled (allow skipping sections with no damage)

**Final Submit Validation:**
- At least 1 photo uploaded (validated in Step 2)
- At least 1 section of scope sheet filled out (warning if all empty)

---

## Mobile UX Details

### Design Principles

**Mobile-First:**
- Full-screen wizard (no distracting navigation)
- Large touch targets (minimum 44px tap targets)
- Sticky progress bar (doesn't scroll away)
- Sticky bottom navigation (Back/Next always visible)
- Number inputs trigger numeric keyboard
- Checkboxes large enough for finger taps

**Visual Hierarchy:**
- Progress bar: Visual fill bar + "Step X of Y" text
- Large section headings with icons
- Field groups in light background cards/containers
- Icons for sections (🏠 roof, 🪟 windows, 📏 dimensions)
- Green checkmarks on completed steps

**Performance:**
- Lazy load steps (don't render all 10 steps at once)
- Debounce auto-save (don't save on every keystroke)
- Optimize photo uploads (compress before upload on mobile)

### Error Handling

**Network Errors:**
- Draft save fails: Queue save for retry, show offline indicator
- Photo upload fails: Retry button + clear error message
- API timeout: "Connection slow. Please wait..." with spinner

**Magic Link Errors:**
- Expired: Friendly message with property manager contact info
- Already completed: "This assessment has already been submitted. Contact property manager if you need to make changes."
- Invalid token: "This link is invalid. Please check your email for the correct link."

**User Errors:**
- No photos uploaded: Warning dialog "Are you sure? We recommend uploading at least 1 photo"
- Empty section: Soft warning "This section is empty. Skip if no damage exists here."
- Required field (none currently): Red border + inline error message

### Edge Cases

**Browser Refresh:**
- Draft auto-saved, resume from last step
- Show message: "Resuming from Step X..."

**Close & Return:**
- Show "Continue where you left off" button
- Display last saved timestamp
- CTA: "Continue Assessment" vs "Start Over"

**Multiple Sessions:**
- Allow contractor to update draft until final submit
- After final submit, lock magic link (status: completed)
- Show "Already submitted" message if they return

**Offline Behavior:**
- Show offline indicator if network lost
- Queue draft saves for when connection returns
- Disable photo upload (requires network)
- Allow form filling (saves to localStorage temporarily)

---

## Design Assets Needed

### Icons
- 📸 Camera (photo upload)
- 🏠 House/Roof (roof sections)
- 🪟 Window (exterior sections)
- 📏 Ruler (dimensions)
- ✏️ Pencil (additional notes)
- ✓ Checkmark (completed steps)

### UI Components
- Progress bar with fill
- Step indicator (numbered circles)
- Photo thumbnail grid
- Field group cards/containers
- Large touch-friendly buttons
- Warning/info callouts
- Success confirmation screen

---

## Success Metrics

**User Experience:**
- Time to complete scope sheet < 15 minutes
- Completion rate > 80% (start → final submit)
- Mobile usability score > 90% (large touch targets, easy navigation)

**Data Quality:**
- Average fields filled per submission > 50% of total fields
- Photo upload rate > 95% (at least 1 photo)
- Scope sheet completion rate > 90% (at least 1 section filled)

**Technical:**
- Draft save success rate > 99%
- Resume from draft rate (contractors who return) > 60%
- Photo upload success rate > 95%

---

## Future Enhancements (Out of Scope)

- Video upload capability
- Guided photo prompts per section (Turo-style: "Take photo of front siding")
- Voice-to-text for notes sections
- OCR for automatic measurement extraction from photos
- Offline-first PWA with full offline support
- Push notifications when contractor submits assessment
