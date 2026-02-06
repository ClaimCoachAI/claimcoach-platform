# Phase 6: AI Audit System - Design Document

**Date:** 2026-02-06
**Status:** Approved for Implementation
**Complexity:** ⭐⭐⭐⭐ Hard
**Time Estimate:** 3-5 days

---

## Goal

Add AI-powered claim auditing that compares contractor scope against carrier estimates using LLM-generated industry pricing to identify undervalued line items and generate rebuttal letters.

## Value Proposition

**VERY HIGH** - Core product differentiator that saves thousands per claim. Property managers can challenge lowball insurance estimates with data-backed rebuttals using current industry pricing.

---

## Architecture Overview

### Core Flow

1. **Contractor fills digital scope sheet** → Structured data stored in database
2. **LLM generates industry estimate** from scope using Perplexity API (web-grounded pricing)
3. **Property manager uploads carrier estimate PDF** from insurance company
4. **System parses carrier PDF** to extract line items
5. **LLM compares both estimates** line-by-line with justifications
6. **Generate delta report + rebuttal template** for property manager to use

### Key Components

- **Scope Sheet Form** (contractor portal) - Digital version of paper scope sheet
- **Scope Sheet Storage** (database) - Structured scope data matching form fields
- **LLM Service** (Perplexity API) - Generate estimates, compare, create rebuttals
- **PDF Parser** (Go library) - Extract carrier estimate line items from PDF
- **Audit Engine** (backend service) - Orchestrate the comparison process
- **Report Generator** (backend/frontend) - Display delta report and rebuttal letter

### Tech Stack

- **LLM:** Perplexity API (web-grounded, current pricing data)
- **PDF Parsing:** Go library (`pdfcpu` or `unipdf`)
- **Backend:** Go (existing services + new audit service)
- **Frontend:** React + TypeScript (new scope form + audit UI)
- **Storage:** PostgreSQL (scope data, audit reports) + Supabase Storage (PDFs)

---

## Database Schema

### 1. `scope_sheets` Table

Stores structured scope data from contractors.

```sql
CREATE TABLE scope_sheets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id UUID NOT NULL REFERENCES claims(id),

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

    -- Roof Other (secondary roof area)
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
```

### 2. `carrier_estimates` Table

Stores uploaded carrier estimate PDFs and parsed data.

```sql
CREATE TABLE carrier_estimates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id UUID NOT NULL REFERENCES claims(id),
    uploaded_by_user_id UUID NOT NULL REFERENCES users(id),

    file_path VARCHAR(500) NOT NULL, -- Supabase Storage path
    file_name VARCHAR(255) NOT NULL,
    file_size_bytes INTEGER,

    parsed_data JSONB, -- Extracted line items from PDF
    parse_status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'parsed', 'failed'
    parse_error TEXT,

    uploaded_at TIMESTAMP DEFAULT NOW(),
    parsed_at TIMESTAMP
);

CREATE INDEX idx_carrier_estimates_claim ON carrier_estimates(claim_id);
```

**parsed_data JSONB Structure:**
```json
{
  "line_items": [
    {
      "description": "Remove existing shingles",
      "quantity": 1900,
      "unit": "SF",
      "unit_cost": 2.00,
      "total": 3800.00
    },
    {
      "description": "Install 30-year architectural shingles",
      "quantity": 1900,
      "unit": "SF",
      "unit_cost": 3.50,
      "total": 6650.00
    }
  ],
  "subtotal": 10450.00,
  "tax": 836.00,
  "total": 11286.00
}
```

### 3. `audit_reports` Table

Stores AI-generated estimates, comparisons, and analysis.

```sql
CREATE TABLE audit_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id UUID NOT NULL REFERENCES claims(id),
    scope_sheet_id UUID NOT NULL REFERENCES scope_sheets(id),
    carrier_estimate_id UUID REFERENCES carrier_estimates(id),

    generated_estimate JSONB, -- LLM-generated Xactimate-style estimate
    comparison_data JSONB,    -- Line-by-line comparison
    total_contractor_estimate DECIMAL(12,2), -- Sum of generated estimate
    total_carrier_estimate DECIMAL(12,2),    -- Sum of carrier estimate
    total_delta DECIMAL(12,2),               -- Difference (positive = undervalued)

    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'generating_estimate', 'parsing_carrier', 'comparing', 'completed', 'failed'
    error_message TEXT,

    created_by_user_id UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audit_reports_claim ON audit_reports(claim_id);
```

**generated_estimate JSONB Structure:**
```json
{
  "line_items": [
    {
      "description": "Remove existing shingles",
      "quantity": 1900,
      "unit": "SF",
      "unit_cost": 2.50,
      "total": 4750.00,
      "category": "Roofing - Tear Off"
    },
    {
      "description": "Install GAF Timberline HDZ shingles",
      "quantity": 1900,
      "unit": "SF",
      "unit_cost": 4.25,
      "total": 8075.00,
      "category": "Roofing - Installation"
    }
  ],
  "subtotal": 12825.00,
  "overhead_profit": 2565.00,
  "total": 15390.00,
  "pricing_date": "2026-02-06",
  "market_area": "Austin, TX"
}
```

**comparison_data JSONB Structure:**
```json
{
  "discrepancies": [
    {
      "item": "Shingle removal",
      "contractor_total": 4750.00,
      "carrier_total": 3800.00,
      "delta": 950.00,
      "percentage_diff": 25.0,
      "reason": "Carrier valued at $2.00/SF vs industry standard $2.50/SF. Current Austin market rates support higher pricing due to labor shortage.",
      "supporting_data": "Xactimate Q4 2025 pricing: $2.45-2.75/SF for standard tear-off"
    },
    {
      "item": "Shingle installation",
      "contractor_total": 8075.00,
      "carrier_total": 6650.00,
      "delta": 1425.00,
      "percentage_diff": 21.4,
      "reason": "Carrier used builder-grade shingles pricing. Scope specifies GAF Timberline HDZ (premium architectural). Market rate $4.25/SF.",
      "supporting_data": "GAF pricing guide 2025: $4.15-4.50/SF installed for HDZ line"
    }
  ],
  "summary": {
    "total_discrepancies": 2,
    "total_undervaluation": 2375.00,
    "average_percentage_diff": 23.2
  }
}
```

### 4. `rebuttals` Table

Stores generated rebuttal letters.

```sql
CREATE TABLE rebuttals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    audit_report_id UUID NOT NULL REFERENCES audit_reports(id),

    content TEXT NOT NULL, -- Generated rebuttal letter (markdown)

    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_rebuttals_audit ON rebuttals(audit_report_id);
```

---

## Contractor Portal - Scope Sheet Form

### Integration with Existing Magic Link Flow

**Current Flow:**
1. Contractor receives email with magic link
2. Clicks link → ContractorUpload page
3. Uploads photos + estimate PDF
4. Submits

**New Flow:**
1. Contractor receives email with magic link
2. Clicks link → ContractorUpload page
3. **Tab 1:** Upload photos (existing)
4. **Tab 2:** Fill scope sheet (NEW)
5. Submits (both photos and scope saved)

### Scope Sheet Form UI

**Page Structure:**

```
┌─────────────────────────────────────────┐
│ Property: 7070 Lantana Ln               │
│ Claim #: CLM-2024-001                   │
├─────────────────────────────────────────┤
│ [Photos] [Scope Sheet] ← Tabs           │
├─────────────────────────────────────────┤
│                                         │
│ Roof (Main)                             │
│ ┌───────────────────────────────────┐  │
│ │ Type: [Slab___________]           │  │
│ │ Square Footage: [1900_]           │  │
│ │ Pitch (/12): [_____]              │  │
│ │                                   │  │
│ │ Fascia (LF): [___] ☐ Paint        │  │
│ │ Soffit (LF): [___] ☐ Paint        │  │
│ │ Drip Edge (LF): [190] ☐ Paint     │  │
│ │ Pipe Jacks (#): [2_] ☐ Paint      │  │
│ │ Ex Vents (#): [3_] ☐ Paint        │  │
│ │ Turbines (#): [2_] ☐ Paint        │  │
│ │ ...                               │  │
│ └───────────────────────────────────┘  │
│                                         │
│ [Collapse] Roof (Other)                 │
│ [Collapse] Exterior (Siding/Gutters)    │
│ [Collapse] Additional Items             │
│                                         │
│ [Save Draft] [Submit Scope Sheet]       │
└─────────────────────────────────────────┘
```

### Form Sections

**Section 1: Roof (Main)**
- Type (text input)
- Square Footage (number)
- Pitch (/12) (text)
- Fascia (LF) + Paint checkbox
- Soffit (LF) + Paint checkbox
- Drip Edge (LF) + Paint checkbox
- Pipe Jacks (#) + Paint checkbox
- Ex Vents (#) + Paint checkbox
- Turtles (#) + Paint checkbox
- Turbines (#) + Paint checkbox
- Furnaces (#) + Paint checkbox
- Power Vents (#) + Paint checkbox
- Ridge (LF)
- Satellites (#)
- Step Flashing (LF)
- Chimney Flashing (Yes/No)
- Rain Diverter (LF)
- Skylights (#) + Damaged checkbox

**Section 2: Roof (Other)**
- Same fields as Roof (Main) for secondary roof area

**Section 3: Exterior**

Four subsections: Front, Right, Back, Left (each with):
- Siding 1: Replace (SF) + Paint (SF)
- Siding 2: Replace (SF) + Paint (SF)
- Gutters (LF) + Paint checkbox
- Windows (text)
- Screens (text)
- Doors (text)
- A/C: Replace + Comb Fins checkboxes

**Section 4: Additional Items & Notes**
- Additional Items (Main) - textarea
- Additional Items (Other) - textarea
- Notes - textarea
- Porch Paint checkbox
- Patio Paint checkbox
- Fence (text)

### Form Behavior

**Auto-save:**
- Save to local storage every 30 seconds
- Restore on page load if incomplete
- Clear local storage on successful submit

**Validation:**
- All fields optional (contractors may not have all info)
- Number fields: non-negative integers only
- Show warning if submitted with many empty fields

**Mobile Optimization:**
- Single column layout
- Large touch targets (48px min)
- Collapsible sections to reduce scrolling
- Sticky submit button at bottom

**Submission:**
- POST to `/api/magic-links/:token/scope-sheet`
- Save to `scope_sheets` table
- Link to claim via magic link validation
- Set `submitted_at` timestamp

---

## Property Manager Workflow

### New UI Section: "AI Audit"

**Location:** Claim Detail page, after "Deductible Analysis" section

**Visibility:** Only shows when:
- Scope sheet submitted by contractor (scope_sheets.submitted_at IS NOT NULL)
- Claim status: `assessing` or `filed`

### UI Components

#### 1. Scope Sheet Review

```
┌─────────────────────────────────────────┐
│ 📋 Scope Sheet                          │
├─────────────────────────────────────────┤
│ Submitted: Feb 5, 2026 2:30 PM         │
│ Contractor: Bob's Roofing              │
│                                         │
│ [View Full Scope Sheet]                 │
│ [Edit Scope Sheet]                      │
└─────────────────────────────────────────┘
```

**View Modal:**
- Display all scope fields in organized sections
- Read-only view with clear labels
- "Close" button

**Edit Capability:**
- Property manager can correct errors
- Updates `scope_sheets` record
- Logs activity: "Scope sheet updated"

#### 2. Generate Industry Estimate

```
┌─────────────────────────────────────────┐
│ 🤖 Industry Estimate                    │
├─────────────────────────────────────────┤
│ Status: Not generated                   │
│                                         │
│ [Generate Industry Estimate]            │
│                                         │
│ Uses AI to estimate costs based on     │
│ current industry pricing (Xactimate-    │
│ style format)                           │
└─────────────────────────────────────────┘
```

**On Click:**
- Button disabled, shows "Generating estimate..."
- Call Perplexity API with scope data
- Store in `audit_reports.generated_estimate`
- Display line items in table:

```
┌─────────────────────────────────────────┐
│ 🤖 Industry Estimate                    │
├─────────────────────────────────────────┤
│ Generated: Feb 5, 2026 3:45 PM         │
│ Total: $15,390.00                       │
│                                         │
│ ┌───────────────────────────────────┐  │
│ │ Description      │ Qty│Unit│Total │  │
│ │──────────────────┼────┼────┼──────│  │
│ │ Remove shingles  │1900│ SF │$4,750│  │
│ │ Install HDZ      │1900│ SF │$8,075│  │
│ │ Drip edge        │ 190│ LF │  $570│  │
│ │ ...              │    │    │      │  │
│ └───────────────────────────────────┘  │
│                                         │
│ [Download PDF] [Regenerate]             │
└─────────────────────────────────────────┘
```

#### 3. Upload Carrier Estimate

```
┌─────────────────────────────────────────┐
│ 📄 Carrier Estimate                     │
├─────────────────────────────────────────┤
│ Upload the estimate PDF received from   │
│ the insurance carrier.                  │
│                                         │
│ [Choose File] [Upload]                  │
│                                         │
│ Or drag and drop PDF here               │
└─────────────────────────────────────────┘
```

**After Upload:**
- Show filename and upload date
- Auto-parse PDF in background
- Display parsed line items

```
┌─────────────────────────────────────────┐
│ 📄 Carrier Estimate                     │
├─────────────────────────────────────────┤
│ File: carrier-estimate-12345.pdf        │
│ Uploaded: Feb 6, 2026 10:15 AM         │
│ Total: $11,286.00                       │
│                                         │
│ ┌───────────────────────────────────┐  │
│ │ Description      │ Qty│Unit│Total │  │
│ │──────────────────┼────┼────┼──────│  │
│ │ Remove shingles  │1900│ SF │$3,800│  │
│ │ Install shingles │1900│ SF │$6,650│  │
│ │ Drip edge        │ 190│ LF │  $456│  │
│ │ ...              │    │    │      │  │
│ └───────────────────────────────────┘  │
│                                         │
│ [Re-upload] [Edit Line Items]           │
└─────────────────────────────────────────┘
```

#### 4. Run Comparison

```
┌─────────────────────────────────────────┐
│ ⚖️  Comparison & Audit                   │
├─────────────────────────────────────────┤
│ Ready to compare estimates              │
│                                         │
│ [Run Comparison]                        │
└─────────────────────────────────────────┘
```

**Enabled When:**
- Industry estimate generated
- Carrier estimate uploaded and parsed

**On Click:**
- Button shows "Comparing..."
- Call Perplexity API for line-by-line comparison
- Store in `audit_reports.comparison_data`
- Display results:

```
┌─────────────────────────────────────────┐
│ ⚖️  Comparison Results                   │
├─────────────────────────────────────────┤
│ Total Undervaluation: $2,375.00         │
│ Discrepancies Found: 2                  │
│                                         │
│ 🔴 Shingle Removal                      │
│    Industry: $4,750 | Carrier: $3,800  │
│    Delta: $950 (25% undervalued)        │
│    Reason: Carrier valued at $2.00/SF   │
│    vs industry standard $2.50/SF.       │
│    Current Austin market rates support  │
│    higher pricing due to labor shortage.│
│                                         │
│ 🔴 Shingle Installation                 │
│    Industry: $8,075 | Carrier: $6,650  │
│    Delta: $1,425 (21% undervalued)      │
│    Reason: Carrier used builder-grade   │
│    pricing. Scope specifies GAF HDZ     │
│    (premium). Market rate $4.25/SF.     │
│                                         │
│ [Download Report PDF]                   │
└─────────────────────────────────────────┘
```

#### 5. Generate Rebuttal

```
┌─────────────────────────────────────────┐
│ ✍️  Rebuttal Letter                      │
├─────────────────────────────────────────┤
│ [Generate Rebuttal Letter]              │
└─────────────────────────────────────────┘
```

**On Click:**
- Call Perplexity API with comparison data
- Generate formal rebuttal letter
- Display in editable text area:

```
┌─────────────────────────────────────────┐
│ ✍️  Rebuttal Letter                      │
├─────────────────────────────────────────┤
│ Generated: Feb 6, 2026 2:30 PM         │
│                                         │
│ ┌───────────────────────────────────┐  │
│ │ [Insurance Carrier Name]          │  │
│ │ [Adjuster Name]                   │  │
│ │                                   │  │
│ │ Re: Claim #CLM-2024-001           │  │
│ │ Property: 7070 Lantana Ln         │  │
│ │                                   │  │
│ │ Dear [Adjuster Name],             │  │
│ │                                   │  │
│ │ We are writing to respectfully    │  │
│ │ request reconsideration of the    │  │
│ │ estimate provided for the         │  │
│ │ above-referenced claim...         │  │
│ │                                   │  │
│ │ [Full letter content - editable]  │  │
│ └───────────────────────────────────┘  │
│                                         │
│ [Edit] [Download PDF] [Copy to Email]  │
└─────────────────────────────────────────┘
```

**Letter Structure:**
- Professional letterhead formatting
- Property/claim context
- Itemized discrepancies with $ amounts
- Industry pricing justifications
- Request for revised estimate
- Contact information

---

## LLM Integration (Perplexity API)

### API Configuration

**Environment Variables:**
```bash
PERPLEXITY_API_KEY=your-api-key-here
PERPLEXITY_MODEL=sonar-pro  # or sonar-turbo for cheaper option
PERPLEXITY_TIMEOUT=60       # seconds
```

### Three API Calls

#### 1. Generate Industry Estimate

**Endpoint:** `POST https://api.perplexity.ai/chat/completions`

**Request:**
```json
{
  "model": "sonar-pro",
  "messages": [
    {
      "role": "system",
      "content": "You are an expert in construction cost estimation and Xactimate pricing. Provide accurate, current market pricing for repair work."
    },
    {
      "role": "user",
      "content": "Based on the following scope sheet and current industry pricing in Austin, TX, produce a detailed scope of repair estimate. Format it in Xactimate style with line items including: description, quantity, unit, unit cost, and total.\n\nScope Sheet:\n- Roof Type: Slab, 1900 SF\n- Drip Edge: 190 LF\n- Pipe Jacks: 2\n- Ex Vents: 3\n- Turbines: 2\n... [full scope data]\n\nProvide the estimate in JSON format:\n{\n  \"line_items\": [\n    {\"description\": \"...\", \"quantity\": X, \"unit\": \"SF\", \"unit_cost\": X.XX, \"total\": XXXX.XX, \"category\": \"...\"}\n  ],\n  \"subtotal\": XXXX.XX,\n  \"overhead_profit\": XXXX.XX,\n  \"total\": XXXXX.XX\n}"
    }
  ],
  "temperature": 0.2,
  "max_tokens": 2000
}
```

**Response Parsing:**
- Extract JSON from response
- Validate schema
- Store in `audit_reports.generated_estimate`

**Error Handling:**
- Invalid JSON → Retry with clarified prompt
- Timeout → Retry up to 3x
- API error → Log and show user error message

#### 2. Compare Estimates

**Request:**
```json
{
  "model": "sonar-pro",
  "messages": [
    {
      "role": "system",
      "content": "You are an expert insurance claim auditor. Compare estimates line-by-line and identify discrepancies where carrier estimates are below current industry standards. Provide specific market data to justify corrections."
    },
    {
      "role": "user",
      "content": "Compare these two estimates for a roof repair in Austin, TX. Identify line items where the carrier estimate is significantly below industry standards. For each discrepancy, explain why the industry estimate is correct using current market pricing data.\n\nIndustry Estimate (generated from current pricing):\n[JSON of generated_estimate]\n\nCarrier Estimate (from insurance company):\n[JSON of parsed carrier data]\n\nProvide comparison in JSON format:\n{\n  \"discrepancies\": [\n    {\n      \"item\": \"...\",\n      \"contractor_total\": XXXX.XX,\n      \"carrier_total\": XXXX.XX,\n      \"delta\": XXXX.XX,\n      \"percentage_diff\": XX.X,\n      \"reason\": \"...\",\n      \"supporting_data\": \"...\"\n    }\n  ],\n  \"summary\": {\n    \"total_discrepancies\": X,\n    \"total_undervaluation\": XXXX.XX,\n    \"average_percentage_diff\": XX.X\n  }\n}"
    }
  ],
  "temperature": 0.2,
  "max_tokens": 3000
}
```

**Response Parsing:**
- Extract comparison JSON
- Validate discrepancies
- Store in `audit_reports.comparison_data`

#### 3. Generate Rebuttal Letter

**Request:**
```json
{
  "model": "sonar-pro",
  "messages": [
    {
      "role": "system",
      "content": "You are a professional insurance claim advocate writing formal rebuttal letters to insurance carriers. Use industry data and professional tone to justify higher repair costs."
    },
    {
      "role": "user",
      "content": "Write a professional rebuttal letter to the insurance carrier for claim #CLM-2024-001 at 7070 Lantana Ln, Austin, TX. Address the following undervalued line items using the provided justifications and market data.\n\nDiscrepancies:\n[JSON of comparison_data.discrepancies]\n\nWrite a formal business letter that:\n1. States the purpose (requesting revised estimate)\n2. Lists each discrepancy with dollar amounts\n3. Provides industry pricing justification for each item\n4. Maintains professional, respectful tone\n5. Requests specific action (revised estimate)\n6. Includes proper closing\n\nFormat as plain text suitable for printing or email."
    }
  ],
  "temperature": 0.3,
  "max_tokens": 2000
}
```

**Response Parsing:**
- Extract letter text
- Store in `rebuttals.content`
- Display in editable text area

---

## PDF Parsing (Carrier Estimates)

### Approach

**Two-Step Process:**
1. Extract text from PDF using Go library
2. Send text to LLM for structured extraction (more reliable than regex)

### Implementation

**Go Library:** `github.com/pdfcpu/pdfcpu` or `github.com/unidoc/unipdf`

**Text Extraction:**
```go
func ExtractTextFromPDF(pdfPath string) (string, error) {
    // Use pdfcpu or unipdf to extract raw text
    text, err := pdflib.ExtractText(pdfPath)
    if err != nil {
        return "", err
    }
    return text, nil
}
```

**Structured Extraction via LLM:**
```go
func ParseCarrierEstimate(pdfText string) (*ParsedEstimate, error) {
    prompt := `Extract line items from this insurance estimate. Return JSON:
    {
      "line_items": [
        {"description": "...", "quantity": X, "unit": "SF", "unit_cost": X.XX, "total": XXXX.XX}
      ],
      "subtotal": XXXX.XX,
      "tax": XXX.XX,
      "total": XXXXX.XX
    }

    Insurance Estimate Text:
    ` + pdfText

    response := callPerplexityAPI(prompt)
    parsed := parseJSON(response)
    return parsed, nil
}
```

**Fallback:**
- If parsing fails, allow manual entry
- Property manager can input line items via form

---

## Error Handling & Status Tracking

### Audit Report Status Flow

```
pending
  ↓
generating_estimate (calling Perplexity for contractor estimate)
  ↓
parsing_carrier (extracting line items from carrier PDF)
  ↓
comparing (generating line-by-line comparison)
  ↓
completed (ready to view results)
```

**Failure States:**
```
failed (any step fails after retries)
```

### Error Scenarios

**1. Perplexity API Fails**
- **Action:** Retry 3x with exponential backoff (1s, 2s, 4s)
- **If all retries fail:** Set status to `failed`, store error message
- **User sees:** "Unable to generate estimate. Please try again later."
- **Log:** Full error details for debugging

**2. PDF Parsing Fails**
- **Action:** Try LLM extraction
- **If LLM fails:** Offer manual entry fallback
- **User sees:** "Could not parse PDF automatically. Please enter line items manually."

**3. LLM Returns Invalid Format**
- **Action:** Retry with clarified prompt emphasizing JSON format
- **Validation:** Check for required fields before accepting
- **User sees:** Loading indicator continues until valid response

**4. API Rate Limit**
- **Action:** Queue requests, process sequentially
- **User sees:** "Your request is queued. Estimated wait: X minutes."

**5. Timeout (>60s)**
- **Action:** Cancel request, allow retry
- **User sees:** "Request timed out. Please try again."

### Status Indicators in UI

**Processing:**
```
⏳ Generating estimate... (30-60 seconds)
```

**Success:**
```
✅ Estimate generated successfully
```

**Failed:**
```
❌ Failed to generate estimate
[Retry] button available
Error details logged for admin
```

---

## API Costs & Budget Controls

### Perplexity Pricing (Estimated)

**Cost per Audit:** ~$1.00 - $2.00

- **Generate Estimate:** ~$0.40-0.60 (2000 tokens, web search)
- **Compare Estimates:** ~$0.40-0.60 (3000 tokens, web search)
- **Generate Rebuttal:** ~$0.20-0.40 (2000 tokens, less search)

**Monthly Budget Examples:**
- 10 audits: $10-20
- 50 audits: $50-100
- 100 audits: $100-200

### Cost Tracking

**Database:**
```sql
CREATE TABLE api_usage_logs (
    id UUID PRIMARY KEY,
    audit_report_id UUID REFERENCES audit_reports(id),
    api_call_type VARCHAR(50), -- 'generate_estimate', 'compare', 'rebuttal'
    tokens_used INTEGER,
    estimated_cost DECIMAL(10,4),
    created_at TIMESTAMP DEFAULT NOW()
);
```

**Admin Dashboard:**
- Daily/monthly usage graphs
- Cost per claim
- Alert at configurable threshold (e.g., $500/month)

---

## Testing Strategy

### Unit Tests

**Backend:**
```go
// Test scope sheet validation
func TestValidateScopeSheet(t *testing.T)

// Test PDF text extraction
func TestExtractPDFText(t *testing.T)

// Test JSON parsing of LLM responses
func TestParseLLMEstimate(t *testing.T)
func TestParseLLMComparison(t *testing.T)

// Test comparison calculations
func TestCalculateDelta(t *testing.T)
```

**Frontend:**
```typescript
// Test scope sheet form validation
test('validates required fields')
test('handles checkbox state correctly')
test('saves to local storage')

// Test API integration
test('submits scope sheet successfully')
test('displays generated estimate')
test('shows comparison results')
```

### Integration Tests

**Mock Perplexity API:**
```go
type MockPerplexityClient struct {
    responses map[string]string
}

func (m *MockPerplexityClient) GenerateEstimate(scope ScopeSheet) (Estimate, error) {
    // Return pre-defined estimate JSON
}
```

**Test Full Audit Flow:**
1. Create scope sheet
2. Mock API call → Return sample estimate
3. Upload carrier PDF
4. Mock PDF parsing → Return sample line items
5. Mock comparison API → Return discrepancies
6. Verify audit_report created correctly

### Manual Testing

**Test Plan:**

1. **Scope Sheet Submission:**
   - Fill out complete scope sheet
   - Submit via magic link
   - Verify data saved to database

2. **Generate Estimate:**
   - Click "Generate Industry Estimate"
   - **Real API call** to Perplexity
   - Verify estimate matches known Xactimate pricing
   - Check line items are reasonable

3. **Upload Carrier PDF:**
   - Upload sample carrier estimate
   - Verify parsing extracts line items correctly
   - Test with various PDF formats

4. **Run Comparison:**
   - Generate comparison report
   - **Real API call** to Perplexity
   - Verify discrepancies are logical
   - Check justifications cite actual market data

5. **Generate Rebuttal:**
   - Create rebuttal letter
   - Verify professional tone
   - Check all discrepancies addressed
   - Test PDF download

6. **Error Scenarios:**
   - Test with invalid PDF
   - Test with malformed scope data
   - Simulate API failures

---

## Security & Data Privacy

### API Key Security

- Store Perplexity API key in environment variable
- Never commit to git
- Rotate keys periodically
- Use secrets manager in production (AWS Secrets Manager, etc.)

### Authorization

- Audit reports only visible to claim's organization
- Scope sheets linked to claims via magic link validation
- Property manager must own claim to generate audits

### Rate Limiting

- Max 10 audit generations per claim (prevent abuse)
- Max 5 API retries per request
- Queue requests if spike detected

### Data Retention

- Scope sheets: Retain indefinitely (claim evidence)
- Carrier estimates: Retain indefinitely (legal record)
- Audit reports: Retain indefinitely (audit trail)
- API logs: Retain 90 days (cost tracking)

---

## MVP Limitations & Future Enhancements

### MVP Scope (Phase 6)

**What's Included:**
- ✅ Digital scope sheet form
- ✅ LLM-generated industry estimates
- ✅ Carrier PDF upload and parsing
- ✅ Line-by-line comparison
- ✅ Delta report
- ✅ Rebuttal letter generation

**What's NOT Included (Future):**
- ❌ Photo analysis (contractor uploads photos but we don't analyze them)
- ❌ OCR for handwritten scope sheets
- ❌ Multi-language support (English only)
- ❌ Automatic email sending of rebuttals (manual copy/paste)
- ❌ Integration with Xactimate API (if available)
- ❌ Historical pricing trends
- ❌ Contractor database / preferred vendor list

### Future Enhancements (Post-MVP)

**Phase 6.1: Photo Analysis**
- Use vision AI to assess damage from photos
- Extract additional scope details from images
- Validate scope sheet against photos

**Phase 6.2: Advanced Parsing**
- OCR for handwritten forms
- Handle more PDF formats
- Extract material specifications

**Phase 6.3: Market Intelligence**
- Track pricing trends over time
- Regional pricing adjustments
- Seasonal labor cost variations

**Phase 6.4: Automation**
- Auto-send rebuttals via email
- Schedule follow-ups
- Track rebuttal responses

---

## Success Criteria

**Phase 6 is complete when:**

1. ✅ Contractors can fill digital scope sheet via magic link
2. ✅ Scope data saved to database with proper validation
3. ✅ Property managers can generate industry estimates via Perplexity API
4. ✅ Carrier PDF upload and parsing works for common formats
5. ✅ LLM comparison identifies undervalued line items with justifications
6. ✅ Delta report displays clearly in UI with $ amounts
7. ✅ Rebuttal letter generates in professional format
8. ✅ All features work end-to-end with real API calls
9. ✅ Error handling gracefully handles API failures
10. ✅ Mobile-responsive scope sheet form
11. ✅ Cost tracking implemented
12. ✅ Documentation updated
13. ✅ Manual testing completed successfully

**Business Value Delivered:**

Property managers can challenge lowball insurance estimates with AI-generated, data-backed rebuttals citing current industry pricing. This saves thousands of dollars per claim by ensuring full compensation.

---

## Deployment Notes

**Prerequisites:**
- Perplexity API key (sign up at perplexity.ai)
- Add `PERPLEXITY_API_KEY` to environment variables
- Test with sample claim before production use

**Configuration:**
```bash
PERPLEXITY_API_KEY=pplx-xxxxx
PERPLEXITY_MODEL=sonar-pro  # or sonar-turbo for lower cost
PERPLEXITY_TIMEOUT=60
PERPLEXITY_MAX_RETRIES=3
```

**Monitoring:**
- Track API usage via `api_usage_logs` table
- Set up alerts for high costs (>$X/day)
- Monitor success/failure rates
- Log all LLM responses for quality review

**Rollout Strategy:**
1. Deploy to staging with test API key
2. Test full audit flow with real API calls
3. Validate estimate accuracy against known Xactimate prices
4. Deploy to production
5. Monitor costs closely for first week
6. Adjust prompts based on result quality

---

## Open Questions / Decisions Needed

1. **Xactimate API Access:** Do we have/need direct Xactimate API access, or is web search sufficient?
   - **Current:** Web search via Perplexity (no Xactimate API)

2. **Photo Analysis:** Should MVP include basic photo analysis, or defer to Phase 6.1?
   - **Current:** Defer to Phase 6.1

3. **PDF Formats:** What carrier estimate formats should we support?
   - **Current:** Best-effort parsing, manual fallback

4. **Pricing Model:** Should we charge users per audit?
   - **Current:** Absorb cost in subscription

5. **Rebuttal Delivery:** Auto-email rebuttals or manual?
   - **Current:** Manual copy/paste (auto-email in future)

---

**End of Design Document**
