# Step 6 PM Brain Strategy Engine — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace Step 6's generic comparison/rebuttal flow with a PM Brain engine that returns one of four statuses (CLOSE, DISPUTE_OFFER, LEGAL_REVIEW, NEED_DOCS) and drives a fully adaptive UI.

**Architecture:** Two-phase backend (verdict first, dispute letter on-demand). New `pm_brain_analysis` and `dispute_letter` columns in `audit_reports`. Step 6 extracted into standalone `Step6AdjudicationEngine.tsx` component.

**Tech Stack:** Go (backend service + handler), PostgreSQL migrations, React + TypeScript (frontend), TanStack Query, Claude API (claude-sonnet-4-6)

---

## Task 1: DB Migration

**Files:**
- Create: `backend/internal/database/migrations/000015_add_pm_brain.up.sql`
- Create: `backend/internal/database/migrations/000015_add_pm_brain.down.sql`

**Step 1: Create up migration**

```sql
-- 000015_add_pm_brain.up.sql
ALTER TABLE audit_reports ADD COLUMN pm_brain_analysis TEXT;
ALTER TABLE audit_reports ADD COLUMN dispute_letter TEXT;
```

**Step 2: Create down migration**

```sql
-- 000015_add_pm_brain.down.sql
ALTER TABLE audit_reports DROP COLUMN IF EXISTS dispute_letter;
ALTER TABLE audit_reports DROP COLUMN IF EXISTS pm_brain_analysis;
```

**Step 3: Run the migration**

```bash
cd "/Users/benjaminlopez/Documents/ClaimCoachAI Code/backend"
migrate -path internal/database/migrations -database "$DATABASE_URL" up
```

Expected: `000015/u add_pm_brain OK`

**Step 4: Commit**

```bash
git add backend/internal/database/migrations/000015_add_pm_brain.*
git commit -m "feat: add pm_brain_analysis and dispute_letter columns to audit_reports"
```

---

## Task 2: Update AuditReport Model

**Files:**
- Modify: `backend/internal/models/audit_report.go`

**Step 1: Add new fields**

In `audit_report.go`, after the `ViabilityAnalysis` field, add:

```go
PMBrainAnalysis *string `json:"pm_brain_analysis" db:"pm_brain_analysis"` // JSON string
DisputeLetter   *string `json:"dispute_letter" db:"dispute_letter"`       // plain text
```

**Step 2: Update GetAuditReportByClaimID SELECT**

In `backend/internal/services/audit_service.go`, find the `GetAuditReportByClaimID` method (around line 357). Update the SELECT to include the new fields:

```go
SELECT id, claim_id, scope_sheet_id, carrier_estimate_id,
       generated_estimate, comparison_data, viability_analysis,
       pm_brain_analysis, dispute_letter,
       total_contractor_estimate, total_carrier_estimate, total_delta,
       status, error_message, created_by_user_id, created_at, updated_at
```

And add the new fields to the `Scan` call:
```go
&report.PMBrainAnalysis, &report.DisputeLetter,
```
(insert after `&report.ViabilityAnalysis` in the Scan argument list)

**Step 3: Verify the file compiles**

```bash
cd "/Users/benjaminlopez/Documents/ClaimCoachAI Code/backend"
go build ./...
```

Expected: no errors

**Step 4: Commit**

```bash
git add backend/internal/models/audit_report.go backend/internal/services/audit_service.go
git commit -m "feat: add PMBrainAnalysis and DisputeLetter fields to AuditReport model"
```

---

## Task 3: Remove CompareEstimates and GenerateRebuttal from service

**Files:**
- Modify: `backend/internal/services/audit_service.go`

**Step 1: Delete the CompareEstimates method**

Find the `CompareEstimates` method (around line 198) and delete it entirely (~85 lines), including the `buildComparisonPrompt` helper below it (~35 lines).

**Step 2: Delete the GenerateRebuttal method**

Find the `GenerateRebuttal` method (around line 521) and delete it entirely (~77 lines).

**Step 3: Delete the GetRebuttal method**

Find the `GetRebuttal` method and delete it entirely.

**Step 4: Verify it compiles**

```bash
cd "/Users/benjaminlopez/Documents/ClaimCoachAI Code/backend"
go build ./...
```

Expected: compile errors referencing `CompareEstimates`, `GenerateRebuttal`, `GetRebuttal` from the handler — that's expected. We'll fix the handler in Task 5.

---

## Task 4: Add RunPMBrainAnalysis to service

**Files:**
- Modify: `backend/internal/services/audit_service.go`

**Step 1: Add PMBrainAnalysis struct types**

Add these structs before the `AuditService` struct definition (or near the top of the file after imports):

```go
type PMBrainDeltaDriver struct {
    LineItem          string  `json:"line_item"`
    ContractorPrice   float64 `json:"contractor_price"`
    CarrierPrice      float64 `json:"carrier_price"`
    Delta             float64 `json:"delta"`
    Reason            string  `json:"reason"`
}

type PMBrainCoverageDispute struct {
    Item                string `json:"item"`
    Status              string `json:"status"` // "denied" | "partial"
    ContractorPosition  string `json:"contractor_position"`
}

type PMBrainAnalysis struct {
    Status                   string                   `json:"status"` // CLOSE|DISPUTE_OFFER|LEGAL_REVIEW|NEED_DOCS
    PlainEnglishSummary      string                   `json:"plain_english_summary"`
    TotalContractorEstimate  float64                  `json:"total_contractor_estimate"`
    TotalCarrierEstimate     float64                  `json:"total_carrier_estimate"`
    TotalDelta               float64                  `json:"total_delta"`
    TopDeltaDrivers          []PMBrainDeltaDriver     `json:"top_delta_drivers"`
    CoverageDisputes         []PMBrainCoverageDispute `json:"coverage_disputes"`
    RequiredNextSteps        []string                 `json:"required_next_steps"`
    LegalThresholdMet        bool                     `json:"legal_threshold_met"`
}
```

**Step 2: Add RunPMBrainAnalysis method**

Add this method to the AuditService:

```go
func (s *AuditService) RunPMBrainAnalysis(ctx context.Context, claimID, auditReportID, userID string) (*PMBrainAnalysis, error) {
    // 1. Fetch audit report (verifies ownership)
    report, err := s.getAuditReportWithOwnershipCheck(ctx, auditReportID, claimID, userID)
    if err != nil {
        return nil, err
    }
    if report.GeneratedEstimate == nil {
        return nil, fmt.Errorf("industry estimate not generated yet")
    }
    if report.CarrierEstimateID == nil {
        return nil, fmt.Errorf("carrier estimate not uploaded yet")
    }

    // 2. Fetch carrier estimate parsed data
    var carrierParsedData string
    err = s.db.QueryRowContext(ctx,
        `SELECT COALESCE(parsed_data, '') FROM carrier_estimates WHERE id = $1`,
        *report.CarrierEstimateID,
    ).Scan(&carrierParsedData)
    if err != nil {
        return nil, fmt.Errorf("failed to fetch carrier estimate: %w", err)
    }
    if carrierParsedData == "" {
        return nil, fmt.Errorf("carrier estimate not parsed yet")
    }

    // 3. Build prompt and call LLM
    prompt := s.buildPMBrainPrompt(*report.GeneratedEstimate, carrierParsedData)

    resp, err := s.llm.CreateMessage(ctx, anthropic.MessageParam{
        Model:     anthropic.ModelClaude_Sonnet_4_6,
        MaxTokens: 4096,
        System: []anthropic.TextBlockParam{
            {Text: "You are an expert insurance claim analyst for a property management company. " +
                "Your job is to compare a contractor's industry-standard estimate with a carrier's " +
                "insurance offer and recommend the best course of action. " +
                "Always respond with valid JSON only, no markdown, no additional text."},
        },
        Messages: []anthropic.MessageParam{
            anthropic.NewUserMessage(anthropic.NewTextBlock(prompt)),
        },
    })
    if err != nil {
        return nil, fmt.Errorf("LLM call failed: %w", err)
    }

    // 4. Parse JSON response
    var content string
    for _, block := range resp.Content {
        if block.Type == "text" {
            content = block.Text
            break
        }
    }
    var analysis PMBrainAnalysis
    if err := json.Unmarshal([]byte(content), &analysis); err != nil {
        return nil, fmt.Errorf("the AI returned a malformed analysis — please try again")
    }
    if analysis.Status != "CLOSE" && analysis.Status != "DISPUTE_OFFER" &&
       analysis.Status != "LEGAL_REVIEW" && analysis.Status != "NEED_DOCS" {
        return nil, fmt.Errorf("the AI returned an invalid status — please try again")
    }

    // 5. Save to DB
    analysisJSON, _ := json.Marshal(analysis)
    _, err = s.db.ExecContext(ctx,
        `UPDATE audit_reports
         SET pm_brain_analysis = $1, status = 'completed', updated_at = NOW()
         WHERE id = $2`,
        string(analysisJSON), auditReportID,
    )
    if err != nil {
        return nil, fmt.Errorf("failed to save analysis: %w", err)
    }

    return &analysis, nil
}

func (s *AuditService) buildPMBrainPrompt(generatedEstimate, carrierParsedData string) string {
    return fmt.Sprintf(`You are analyzing an insurance claim for a property management company.

CONTRACTOR'S INDUSTRY-STANDARD ESTIMATE (from scope sheet + local pricing):
%s

CARRIER'S INSURANCE OFFER (extracted from their PDF):
%s

Analyze both estimates and return a JSON object with this exact schema:
{
  "status": "CLOSE" | "DISPUTE_OFFER" | "LEGAL_REVIEW" | "NEED_DOCS",
  "plain_english_summary": "2-3 sentences explaining the situation in plain English for a non-expert property manager",
  "total_contractor_estimate": <number>,
  "total_carrier_estimate": <number>,
  "total_delta": <contractor_total - carrier_total>,
  "top_delta_drivers": [
    {
      "line_item": "<item name>",
      "contractor_price": <number>,
      "carrier_price": <number>,
      "delta": <contractor - carrier>,
      "reason": "<why this gap exists or why it's significant>"
    }
  ],
  "coverage_disputes": [
    {
      "item": "<item name>",
      "status": "denied" | "partial",
      "contractor_position": "<what the contractor says should be covered>"
    }
  ],
  "required_next_steps": ["<actionable step 1>", "<actionable step 2>"],
  "legal_threshold_met": <true | false>
}

STATUS SELECTION RULES:
- CLOSE: Carrier paid within 10%% of contractor estimate OR carrier paid more. No action needed.
- DISPUTE_OFFER: Carrier underpaid by more than 10%% but less than $15,000 gap. Send a dispute letter.
- LEGAL_REVIEW: Gap is $15,000 or more, OR carrier explicitly denied coverage for major items. Escalate.
- NEED_DOCS: The carrier PDF data is empty, garbled, or clearly not a line-item estimate (e.g., just a check image). Cannot analyze.

Include the top 3-5 delta drivers sorted by dollar gap (largest first).
If no coverage items were denied, return an empty array for coverage_disputes.
Return only the JSON object, no markdown, no explanation.`, generatedEstimate, carrierParsedData)
}
```

**Step 3: Verify it compiles**

```bash
cd "/Users/benjaminlopez/Documents/ClaimCoachAI Code/backend"
go build ./...
```

Expected: still errors from handler (not yet updated). That's OK.

---

## Task 5: Add GenerateDisputeLetter to service

**Files:**
- Modify: `backend/internal/services/audit_service.go`

**Step 1: Add GenerateDisputeLetter method**

```go
func (s *AuditService) GenerateDisputeLetter(ctx context.Context, claimID, auditReportID, userID string) (string, error) {
    // 1. Fetch audit report
    report, err := s.getAuditReportWithOwnershipCheck(ctx, auditReportID, claimID, userID)
    if err != nil {
        return "", err
    }
    if report.PMBrainAnalysis == nil {
        return "", fmt.Errorf("PM Brain analysis must be run first")
    }

    // 2. Parse PM brain analysis to get context
    var analysis PMBrainAnalysis
    if err := json.Unmarshal([]byte(*report.PMBrainAnalysis), &analysis); err != nil {
        return "", fmt.Errorf("invalid PM Brain analysis data")
    }
    if analysis.Status != "DISPUTE_OFFER" {
        return "", fmt.Errorf("dispute letter only available for DISPUTE_OFFER status")
    }

    // 3. Fetch claim details for letter header
    var claimNumber, propertyAddress string
    s.db.QueryRowContext(ctx,
        `SELECT COALESCE(insurance_claim_number, 'Unknown'),
                COALESCE(p.address || ', ' || p.city || ', ' || p.state, 'Unknown Address')
         FROM claims c
         LEFT JOIN properties p ON c.property_id = p.id
         WHERE c.id = $1`, claimID,
    ).Scan(&claimNumber, &propertyAddress)

    // 4. Build prompt and call LLM
    analysisJSON, _ := json.Marshal(analysis)
    prompt := fmt.Sprintf(`Write a professional Dispute/Supplement Request Letter for an insurance claim.

CLAIM DETAILS:
- Claim Number: %s
- Property Address: %s

PM BRAIN ANALYSIS (use this data for the letter):
%s

Write a formal business letter that:
1. Opens with a professional salutation to the insurance carrier
2. References the claim number and property
3. States clearly that the contractor disputes the carrier's estimate
4. For each top_delta_driver: explains the pricing gap with justification
5. For any coverage_disputes: argues why those items should be covered
6. Calculates and states the total additional funds requested (total_delta)
7. Lists the required_next_steps as a formal request
8. Closes professionally requesting a response within 10 business days
9. Uses plain English — no jargon. Firm but respectful tone.

Format as a plain text letter (no markdown). Include today's date: %s.
Return only the letter text, nothing else.`,
        claimNumber, propertyAddress, string(analysisJSON),
        time.Now().Format("January 2, 2006"),
    )

    resp, err := s.llm.CreateMessage(ctx, anthropic.MessageParam{
        Model:     anthropic.ModelClaude_Sonnet_4_6,
        MaxTokens: 2048,
        System: []anthropic.TextBlockParam{
            {Text: "You are a professional insurance claim specialist. Write formal, persuasive dispute letters. Return only the letter text, no markdown, no preamble."},
        },
        Messages: []anthropic.MessageParam{
            anthropic.NewUserMessage(anthropic.NewTextBlock(prompt)),
        },
    })
    if err != nil {
        return "", fmt.Errorf("LLM call failed: %w", err)
    }

    var letterText string
    for _, block := range resp.Content {
        if block.Type == "text" {
            letterText = block.Text
            break
        }
    }

    // 5. Save letter to DB
    _, err = s.db.ExecContext(ctx,
        `UPDATE audit_reports SET dispute_letter = $1, updated_at = NOW() WHERE id = $2`,
        letterText, auditReportID,
    )
    if err != nil {
        return "", fmt.Errorf("failed to save dispute letter: %w", err)
    }

    return letterText, nil
}
```

**Step 2: Verify compiles**

```bash
cd "/Users/benjaminlopez/Documents/ClaimCoachAI Code/backend"
go build ./...
```

---

## Task 6: Update Audit Handler

**Files:**
- Modify: `backend/internal/handlers/audit_handler.go`

**Step 1: Remove old handlers**

Delete the following handler methods entirely:
- `CompareEstimates` (the whole method, ~48 lines)
- `GenerateRebuttal` (the whole method, ~48 lines)
- `GetRebuttal` (the whole method, ~26 lines)

**Step 2: Add RunPMBrain handler**

Add after `GetAuditReport`:

```go
// RunPMBrain POST /api/claims/:id/audit/:auditId/pm-brain
func (h *AuditHandler) RunPMBrain(c *gin.Context) {
    claimID := c.Param("id")
    auditID := c.Param("auditId")
    userID := c.GetString("user_id")

    analysis, err := h.auditService.RunPMBrainAnalysis(c.Request.Context(), claimID, auditID, userID)
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
        return
    }
    c.JSON(http.StatusOK, gin.H{"data": analysis})
}
```

**Step 3: Add GenerateDisputeLetter handler**

```go
// GenerateDisputeLetter POST /api/claims/:id/audit/:auditId/dispute-letter
func (h *AuditHandler) GenerateDisputeLetter(c *gin.Context) {
    claimID := c.Param("id")
    auditID := c.Param("auditId")
    userID := c.GetString("user_id")

    letter, err := h.auditService.GenerateDisputeLetter(c.Request.Context(), claimID, auditID, userID)
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
        return
    }
    c.JSON(http.StatusOK, gin.H{"data": gin.H{"letter": letter}})
}
```

**Step 4: Verify compiles**

```bash
cd "/Users/benjaminlopez/Documents/ClaimCoachAI Code/backend"
go build ./...
```

---

## Task 7: Update Router

**Files:**
- Modify: `backend/internal/api/router.go`

**Step 1: Remove old routes**

Find and delete:
```go
api.POST("/claims/:id/audit/:auditId/compare", auditHandler.CompareEstimates)
api.POST("/claims/:id/audit/:auditId/rebuttal", auditHandler.GenerateRebuttal)
api.GET("/rebuttals/:id", auditHandler.GetRebuttal)
```

**Step 2: Add new routes**

```go
api.POST("/claims/:id/audit/:auditId/pm-brain", auditHandler.RunPMBrain)
api.POST("/claims/:id/audit/:auditId/dispute-letter", auditHandler.GenerateDisputeLetter)
```

**Step 3: Final backend build check**

```bash
cd "/Users/benjaminlopez/Documents/ClaimCoachAI Code/backend"
go build ./...
```

Expected: clean build, zero errors.

**Step 4: Commit**

```bash
git add backend/internal/services/audit_service.go \
        backend/internal/handlers/audit_handler.go \
        backend/internal/api/router.go \
        backend/internal/models/audit_report.go
git commit -m "feat: replace CompareEstimates/GenerateRebuttal with PM Brain analysis engine"
```

---

## Task 8: Frontend Types

**Files:**
- Modify: `frontend/src/types/claim.ts`

**Step 1: Add PM Brain types**

Add after the existing ViabilityAnalysis types:

```typescript
export type PMBrainStatus = 'CLOSE' | 'DISPUTE_OFFER' | 'LEGAL_REVIEW' | 'NEED_DOCS'

export interface PMBrainDeltaDriver {
  line_item: string
  contractor_price: number
  carrier_price: number
  delta: number
  reason: string
}

export interface PMBrainCoverageDispute {
  item: string
  status: 'denied' | 'partial'
  contractor_position: string
}

export interface PMBrainAnalysis {
  status: PMBrainStatus
  plain_english_summary: string
  total_contractor_estimate: number
  total_carrier_estimate: number
  total_delta: number
  top_delta_drivers: PMBrainDeltaDriver[]
  coverage_disputes: PMBrainCoverageDispute[]
  required_next_steps: string[]
  legal_threshold_met: boolean
}
```

**Step 2: TypeScript check**

```bash
cd "/Users/benjaminlopez/Documents/ClaimCoachAI Code/frontend"
npx tsc --noEmit 2>&1 | head -20
```

---

## Task 9: Frontend API Functions

**Files:**
- Modify: `frontend/src/lib/api.ts`

**Step 1: Remove old audit API functions**

Delete:
- `compareEstimates` function
- `generateRebuttal` function
- `getRebuttal` function

**Step 2: Add new API functions**

```typescript
export const runPMBrainAnalysis = async (claimId: string, auditId: string) => {
  const response = await api.post(`/api/claims/${claimId}/audit/${auditId}/pm-brain`)
  return response.data.data as PMBrainAnalysis
}

export const generateDisputeLetter = async (claimId: string, auditId: string) => {
  const response = await api.post(`/api/claims/${claimId}/audit/${auditId}/dispute-letter`)
  return response.data.data.letter as string
}
```

Add the import for `PMBrainAnalysis` at the top:
```typescript
import type { PMBrainAnalysis } from '../types/claim'
```

**Step 3: TypeScript check**

```bash
cd "/Users/benjaminlopez/Documents/ClaimCoachAI Code/frontend"
npx tsc --noEmit 2>&1 | head -20
```

---

## Task 10: Create Step6AdjudicationEngine.tsx

**Files:**
- Create: `frontend/src/components/Step6AdjudicationEngine.tsx`

**Overview of component:**

Props: `{ claim: Claim, scopeSheet: ScopeSheet | null }`

Internal phases (state machine): `'idle' | 'uploading' | 'parsing' | 'ready' | 'analyzing' | 'verdict' | 'letter_generating'`

**Step 1: Create the component file**

```tsx
import { useState, useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Claim, ScopeSheet, PMBrainAnalysis, PMBrainStatus } from '../types/claim'
import {
  getCarrierEstimates,
  uploadCarrierEstimateUrl,
  confirmCarrierEstimate,
  parseCarrierEstimate,
  generateIndustryEstimate,
  runPMBrainAnalysis,
  generateDisputeLetter,
  getAuditReport,
  updateClaimStep,
  sendLegalEscalation,
} from '../lib/api'

type Phase = 'idle' | 'uploading' | 'parsing' | 'ready' | 'analyzing' | 'verdict' | 'letter_generating'

interface Props {
  claim: Claim
  scopeSheet: ScopeSheet | null
}

export default function Step6AdjudicationEngine({ claim, scopeSheet }: Props) {
  const queryClient = useQueryClient()
  const [phase, setPhase] = useState<Phase>('idle')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [pmBrain, setPmBrain] = useState<PMBrainAnalysis | null>(null)
  const [disputeLetter, setDisputeLetter] = useState<string | null>(null)
  const [letterCopied, setLetterCopied] = useState(false)
  const [deltaDriversOpen, setDeltaDriversOpen] = useState(false)
  const [disputesOpen, setDisputesOpen] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [analysisStep, setAnalysisStep] = useState(0)
  const [isPolling, setIsPolling] = useState(false)

  // Legal escalation state
  const [legalPartnerName, setLegalPartnerName] = useState('')
  const [legalPartnerEmail, setLegalPartnerEmail] = useState('')
  const [ownerName, setOwnerName] = useState(claim.property?.owner_entity_name || '')
  const [ownerEmail, setOwnerEmail] = useState('')
  const [legalSubmitted, setLegalSubmitted] = useState<{ partnerName: string } | null>(null)

  const step6Done = claim.steps_completed?.includes(6) ?? false

  // Load carrier estimates
  const { data: carrierEstimates, refetch: refetchCarrierEstimates } = useQuery({
    queryKey: ['carrier-estimates', claim.id],
    queryFn: () => getCarrierEstimates(claim.id),
    refetchInterval: isPolling ? 3000 : false,
  })

  // Load existing audit report (for restored state)
  const { data: auditReport } = useQuery({
    queryKey: ['audit-report', claim.id],
    queryFn: () => getAuditReport(claim.id),
    retry: false,
  })

  const latestEstimate = carrierEstimates?.[0]
  const isParsed = latestEstimate?.parse_status === 'completed'
  const isParsing = latestEstimate?.parse_status === 'pending' || latestEstimate?.parse_status === 'processing'
  const parseFailed = latestEstimate?.parse_status === 'failed'

  // Restore state from persisted audit report
  useEffect(() => {
    if (!auditReport?.pm_brain_analysis) return
    if (phase !== 'idle') return
    try {
      const saved: PMBrainAnalysis = JSON.parse(auditReport.pm_brain_analysis)
      setPmBrain(saved)
      if (auditReport.dispute_letter) setDisputeLetter(auditReport.dispute_letter)
      setPhase('verdict')
    } catch { }
  }, [auditReport])

  // Polling: stop when parse completes or fails
  useEffect(() => {
    if (!isPolling) return
    if (isParsed || parseFailed) {
      setIsPolling(false)
      if (isParsed) setPhase('ready')
      if (parseFailed) setPhase('idle')
    }
  }, [isPolling, isParsed, parseFailed])

  // Analysis step animation
  useEffect(() => {
    if (phase !== 'analyzing') return
    const steps = [
      800,   // Reading carrier estimate
      3000,  // Comparing against contractor scope
      6000,  // Identifying discrepancies
      9000,  // Generating verdict
    ]
    const timers = steps.map((delay, i) =>
      setTimeout(() => setAnalysisStep(i + 1), delay)
    )
    return () => timers.forEach(clearTimeout)
  }, [phase])

  // Upload + parse mutation
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      setPhase('uploading')
      const { upload_url, estimate_id } = await uploadCarrierEstimateUrl(claim.id, file.name, file.size)
      await fetch(upload_url, { method: 'PUT', body: file, headers: { 'Content-Type': 'application/pdf' } })
      await confirmCarrierEstimate(claim.id, estimate_id)
      await parseCarrierEstimate(claim.id, estimate_id)
      setPhase('parsing')
      setIsPolling(true)
    },
    onError: (err: Error) => {
      setErrorMsg(err.message)
      setPhase('idle')
    },
  })

  // Analyze mutation (two-phase: generate estimate → pm-brain)
  const analyzeMutation = useMutation({
    mutationFn: async () => {
      setPhase('analyzing')
      setAnalysisStep(0)
      setErrorMsg(null)
      const { audit_report_id } = await generateIndustryEstimate(claim.id)
      const analysis = await runPMBrainAnalysis(claim.id, audit_report_id)
      return analysis
    },
    onSuccess: (analysis) => {
      setPmBrain(analysis)
      setPhase('verdict')
      queryClient.invalidateQueries({ queryKey: ['audit-report', claim.id] })
    },
    onError: (err: Error) => {
      setErrorMsg(err.message)
      setPhase('ready')
    },
  })

  // Dispute letter mutation
  const letterMutation = useMutation({
    mutationFn: async () => {
      if (!auditReport?.id) throw new Error('No audit report found')
      setPhase('letter_generating')
      return generateDisputeLetter(claim.id, auditReport.id)
    },
    onSuccess: (letter) => {
      setDisputeLetter(letter)
      setPhase('verdict')
      queryClient.invalidateQueries({ queryKey: ['audit-report', claim.id] })
    },
    onError: (err: Error) => {
      setErrorMsg(err.message)
      setPhase('verdict')
    },
  })

  // Legal escalation mutation
  const legalMutation = useMutation({
    mutationFn: () => sendLegalEscalation(claim.id, {
      legal_partner_name: legalPartnerName,
      legal_partner_email: legalPartnerEmail,
      owner_name: ownerName,
      owner_email: ownerEmail,
    }),
    onSuccess: () => setLegalSubmitted({ partnerName: legalPartnerName }),
  })

  // Complete step mutation
  const completeMutation = useMutation({
    mutationFn: () => updateClaimStep(claim.id, {
      current_step: 7,
      steps_completed: [...(claim.steps_completed ?? []), 6],
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['claim', claim.id] }),
  })

  const formatCurrency = (n: number) =>
    n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

  // ─── RENDER ───────────────────────────────────────────────────────────

  // Upload phase
  if (phase === 'idle' || phase === 'uploading') {
    return (
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '24px 0' }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>
          Upload Carrier's Offer
        </h2>
        <p style={{ color: '#64748b', marginBottom: 24, fontSize: 14 }}>
          Upload the PDF from your insurance carrier — their line-item estimate or Explanation of Benefits.
        </p>

        {latestEstimate && !isParsed && !parseFailed ? null : (
          <label style={{
            display: 'block',
            border: '2px dashed #cbd5e1',
            borderRadius: 12,
            padding: '32px 24px',
            textAlign: 'center',
            cursor: 'pointer',
            background: selectedFile ? '#f0fdf4' : '#f8fafc',
          }}>
            <input
              type="file"
              accept=".pdf"
              style={{ display: 'none' }}
              onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
            />
            {selectedFile ? (
              <div style={{ color: '#16a34a', fontWeight: 600 }}>✓ {selectedFile.name}</div>
            ) : (
              <div style={{ color: '#94a3b8' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📄</div>
                <div>Click to select carrier's PDF estimate</div>
              </div>
            )}
          </label>
        )}

        {selectedFile && (
          <button
            onClick={() => uploadMutation.mutate(selectedFile)}
            disabled={uploadMutation.isPending}
            style={{
              marginTop: 16,
              width: '100%',
              padding: '12px 24px',
              background: '#0d9488',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: 15,
            }}
          >
            {uploadMutation.isPending ? 'Uploading…' : 'Upload & Parse PDF'}
          </button>
        )}

        {errorMsg && (
          <div style={{ marginTop: 12, padding: '10px 14px', background: '#fef2f2', borderRadius: 8, color: '#dc2626', fontSize: 14 }}>
            {errorMsg}
          </div>
        )}
      </div>
    )
  }

  // Parsing phase
  if (phase === 'parsing') {
    return (
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '48px 0', textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>⏳</div>
        <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 18, marginBottom: 8 }}>
          Reading carrier's document…
        </div>
        <div style={{ color: '#64748b', fontSize: 14 }}>This takes about 20–30 seconds</div>
      </div>
    )
  }

  // Ready to analyze
  if (phase === 'ready') {
    return (
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '24px 0' }}>
        <div style={{
          padding: '16px 20px',
          background: '#f0fdf4',
          borderRadius: 10,
          border: '1px solid #bbf7d0',
          marginBottom: 24,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <span style={{ fontSize: 20 }}>✓</span>
          <span style={{ color: '#166534', fontWeight: 600 }}>
            {latestEstimate?.file_name ?? 'Carrier estimate'} — ready
          </span>
        </div>

        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>
          Run AI Analysis
        </h2>
        <p style={{ color: '#64748b', fontSize: 14, marginBottom: 20 }}>
          ClaimCoach will compare the carrier's offer against your scope sheet and give you a clear recommendation.
        </p>

        {errorMsg && (
          <div style={{ marginBottom: 16, padding: '10px 14px', background: '#fef2f2', borderRadius: 8, color: '#dc2626', fontSize: 14 }}>
            {errorMsg}
          </div>
        )}

        <button
          onClick={() => analyzeMutation.mutate()}
          style={{
            width: '100%',
            padding: '14px 24px',
            background: '#0d9488',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            fontWeight: 700,
            cursor: 'pointer',
            fontSize: 16,
          }}
        >
          Analyze the Offer →
        </button>
      </div>
    )
  }

  // Analyzing phase (loading animation)
  if (phase === 'analyzing') {
    const STEPS = [
      'Reading carrier estimate',
      'Comparing against your scope',
      'Identifying pricing gaps',
      'Generating recommendation',
    ]
    return (
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '48px 0', textAlign: 'center' }}>
        <div style={{
          width: 80, height: 80, margin: '0 auto 24px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #0d9488, #0891b2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 36,
          boxShadow: '0 0 0 8px rgba(13,148,136,0.15)',
        }}>🤖</div>
        <div style={{ fontWeight: 700, fontSize: 18, color: '#0f172a', marginBottom: 24 }}>
          Analyzing the offer…
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 320, margin: '0 auto' }}>
          {STEPS.map((label, i) => {
            const state = i < analysisStep ? 'done' : i === analysisStep ? 'active' : 'pending'
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                  background: state === 'done' ? '#0d9488' : state === 'active' ? '#e0f2fe' : '#f1f5f9',
                  border: state === 'active' ? '2px solid #0d9488' : 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12,
                }}>
                  {state === 'done' ? '✓' : state === 'active' ? '…' : ''}
                </div>
                <span style={{ fontSize: 14, color: state === 'pending' ? '#94a3b8' : '#334155' }}>{label}</span>
              </div>
            )
          })}
        </div>
        <div style={{ marginTop: 24, color: '#94a3b8', fontSize: 13 }}>About 30–60 seconds</div>
      </div>
    )
  }

  // Letter generating phase
  if (phase === 'letter_generating') {
    return (
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '48px 0', textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>✍️</div>
        <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 18 }}>Writing your dispute letter…</div>
        <div style={{ color: '#64748b', fontSize: 14, marginTop: 8 }}>About 10–15 seconds</div>
      </div>
    )
  }

  // ─── VERDICT PHASE ─────────────────────────────────────────────────────
  if (phase === 'verdict' && pmBrain) {
    return (
      <VerdictPanel
        analysis={pmBrain}
        disputeLetter={disputeLetter}
        letterCopied={letterCopied}
        setLetterCopied={setLetterCopied}
        deltaDriversOpen={deltaDriversOpen}
        setDeltaDriversOpen={setDeltaDriversOpen}
        disputesOpen={disputesOpen}
        setDisputesOpen={setDisputesOpen}
        errorMsg={errorMsg}
        onGenerateLetter={() => letterMutation.mutate()}
        letterGenerating={letterMutation.isPending}
        legalPartnerName={legalPartnerName}
        setLegalPartnerName={setLegalPartnerName}
        legalPartnerEmail={legalPartnerEmail}
        setLegalPartnerEmail={setLegalPartnerEmail}
        ownerName={ownerName}
        setOwnerName={setOwnerName}
        ownerEmail={ownerEmail}
        setOwnerEmail={setOwnerEmail}
        legalSubmitted={legalSubmitted}
        onSubmitLegal={() => legalMutation.mutate()}
        legalSubmitting={legalMutation.isPending}
        step6Done={step6Done}
        onComplete={() => completeMutation.mutate()}
        completing={completeMutation.isPending}
        formatCurrency={formatCurrency}
      />
    )
  }

  return null
}
```

**Step 2: Add VerdictPanel sub-component in the same file**

Append to `Step6AdjudicationEngine.tsx`:

```tsx
// ─── VERDICT PANEL ─────────────────────────────────────────────────────────

interface VerdictPanelProps {
  analysis: PMBrainAnalysis
  disputeLetter: string | null
  letterCopied: boolean
  setLetterCopied: (v: boolean) => void
  deltaDriversOpen: boolean
  setDeltaDriversOpen: (v: boolean) => void
  disputesOpen: boolean
  setDisputesOpen: (v: boolean) => void
  errorMsg: string | null
  onGenerateLetter: () => void
  letterGenerating: boolean
  legalPartnerName: string
  setLegalPartnerName: (v: string) => void
  legalPartnerEmail: string
  setLegalPartnerEmail: (v: string) => void
  ownerName: string
  setOwnerName: (v: string) => void
  ownerEmail: string
  setOwnerEmail: (v: string) => void
  legalSubmitted: { partnerName: string } | null
  onSubmitLegal: () => void
  legalSubmitting: boolean
  step6Done: boolean
  onComplete: () => void
  completing: boolean
  formatCurrency: (n: number) => string
}

const STATUS_CONFIG: Record<PMBrainStatus, { bg: string; border: string; icon: string; label: string; textColor: string }> = {
  CLOSE:         { bg: '#f0fdf4', border: '#bbf7d0', icon: '✅', label: 'Offer Accepted',      textColor: '#166534' },
  DISPUTE_OFFER: { bg: '#fffbeb', border: '#fde68a', icon: '⚠️', label: 'Dispute the Offer',   textColor: '#92400e' },
  LEGAL_REVIEW:  { bg: '#fef2f2', border: '#fecaca', icon: '⚖️', label: 'Legal Review Needed', textColor: '#991b1b' },
  NEED_DOCS:     { bg: '#fffff5', border: '#fef08a', icon: '📋', label: 'More Info Needed',     textColor: '#713f12' },
}

function VerdictPanel(props: VerdictPanelProps) {
  const { analysis, formatCurrency } = props
  const config = STATUS_CONFIG[analysis.status]
  const gap = analysis.total_delta

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px 0', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Status banner */}
      <div style={{
        padding: '20px 24px',
        background: config.bg,
        border: `1px solid ${config.border}`,
        borderRadius: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          <span style={{ fontSize: 28 }}>{config.icon}</span>
          <span style={{ fontWeight: 800, fontSize: 20, color: config.textColor }}>{config.label}</span>
        </div>
        <p style={{ color: '#334155', lineHeight: 1.6, margin: 0, fontSize: 15 }}>
          {analysis.plain_english_summary}
        </p>
      </div>

      {/* Dollar summary (for DISPUTE_OFFER and LEGAL_REVIEW) */}
      {(analysis.status === 'DISPUTE_OFFER' || analysis.status === 'LEGAL_REVIEW') && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 12,
        }}>
          {[
            { label: 'Contractor Estimate', value: analysis.total_contractor_estimate, accent: '#0d9488' },
            { label: 'Carrier Paid',         value: analysis.total_carrier_estimate,   accent: '#64748b' },
            { label: 'Gap',                  value: gap,                               accent: '#dc2626' },
          ].map(({ label, value, accent }) => (
            <div key={label} style={{
              padding: '16px',
              background: '#f8fafc',
              borderRadius: 10,
              border: '1px solid #e2e8f0',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 13, color: '#64748b', marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: accent, fontFamily: "'Work Sans', sans-serif" }}>
                {formatCurrency(Math.abs(value))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delta drivers (collapsible) */}
      {analysis.top_delta_drivers.length > 0 && analysis.status !== 'CLOSE' && (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
          <button
            onClick={() => props.setDeltaDriversOpen(!props.deltaDriversOpen)}
            style={{
              width: '100%', padding: '14px 18px',
              background: '#f8fafc', border: 'none', cursor: 'pointer',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              fontWeight: 600, color: '#0f172a', fontSize: 14,
            }}
          >
            <span>Pricing Gaps ({analysis.top_delta_drivers.length} items)</span>
            <span style={{ color: '#94a3b8' }}>{props.deltaDriversOpen ? '▲' : '▼'}</span>
          </button>
          {props.deltaDriversOpen && (
            <div style={{ padding: '0 18px 14px' }}>
              {analysis.top_delta_drivers.map((driver, i) => (
                <div key={i} style={{
                  padding: '12px 0',
                  borderTop: i > 0 ? '1px solid #f1f5f9' : undefined,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, color: '#0f172a', fontSize: 14 }}>{driver.line_item}</span>
                    <span style={{
                      fontWeight: 700, color: '#dc2626', fontSize: 14,
                      fontFamily: "'Work Sans', sans-serif",
                    }}>-{formatCurrency(driver.delta)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 16, fontSize: 13, color: '#64748b' }}>
                    <span>Contractor: {formatCurrency(driver.contractor_price)}</span>
                    <span>Carrier: {formatCurrency(driver.carrier_price)}</span>
                  </div>
                  {driver.reason && (
                    <div style={{ marginTop: 4, fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>{driver.reason}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Coverage disputes (collapsible) */}
      {analysis.coverage_disputes.length > 0 && (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
          <button
            onClick={() => props.setDisputesOpen(!props.disputesOpen)}
            style={{
              width: '100%', padding: '14px 18px',
              background: '#f8fafc', border: 'none', cursor: 'pointer',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              fontWeight: 600, color: '#0f172a', fontSize: 14,
            }}
          >
            <span>Coverage Disputes ({analysis.coverage_disputes.length} items)</span>
            <span style={{ color: '#94a3b8' }}>{props.disputesOpen ? '▲' : '▼'}</span>
          </button>
          {props.disputesOpen && (
            <div style={{ padding: '0 18px 14px' }}>
              {analysis.coverage_disputes.map((d, i) => (
                <div key={i} style={{ padding: '10px 0', borderTop: i > 0 ? '1px solid #f1f5f9' : undefined }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '2px 8px',
                      borderRadius: 4,
                      background: d.status === 'denied' ? '#fef2f2' : '#fffbeb',
                      color: d.status === 'denied' ? '#991b1b' : '#92400e',
                    }}>
                      {d.status === 'denied' ? 'DENIED' : 'PARTIAL'}
                    </span>
                    <span style={{ fontWeight: 600, color: '#0f172a', fontSize: 14 }}>{d.item}</span>
                  </div>
                  <div style={{ fontSize: 13, color: '#64748b' }}>{d.contractor_position}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Required next steps */}
      {analysis.required_next_steps.length > 0 && (
        <div style={{ padding: '16px 20px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
          <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 14, marginBottom: 12 }}>Next Steps</div>
          <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {analysis.required_next_steps.map((step, i) => (
              <li key={i} style={{ color: '#334155', fontSize: 14, lineHeight: 1.5 }}>{step}</li>
            ))}
          </ol>
        </div>
      )}

      {/* DISPUTE_OFFER actions */}
      {analysis.status === 'DISPUTE_OFFER' && !props.step6Done && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {!disputeLetter ? (
            <button
              onClick={props.onGenerateLetter}
              disabled={props.letterGenerating}
              style={{
                padding: '14px 24px', background: '#0d9488', color: '#fff',
                border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 15,
              }}
            >
              {props.letterGenerating ? 'Writing letter…' : '✉️  Generate Dispute Letter'}
            </button>
          ) : (
            <DisputeLetterCard
              letter={disputeLetter}
              copied={props.letterCopied}
              onCopy={() => {
                navigator.clipboard.writeText(disputeLetter)
                props.setLetterCopied(true)
                setTimeout(() => props.setLetterCopied(false), 2000)
              }}
            />
          )}
        </div>
      )}

      {/* LEGAL_REVIEW form */}
      {analysis.status === 'LEGAL_REVIEW' && !props.step6Done && (
        <LegalEscalationForm
          partnerName={props.legalPartnerName}
          setPartnerName={props.setLegalPartnerName}
          partnerEmail={props.legalPartnerEmail}
          setPartnerEmail={props.setLegalPartnerEmail}
          ownerName={props.ownerName}
          setOwnerName={props.setOwnerName}
          ownerEmail={props.ownerEmail}
          setOwnerEmail={props.setOwnerEmail}
          submitted={props.legalSubmitted}
          onSubmit={props.onSubmitLegal}
          submitting={props.legalSubmitting}
        />
      )}

      {/* NEED_DOCS — re-upload prompt */}
      {analysis.status === 'NEED_DOCS' && (
        <div style={{
          padding: '16px 20px', background: '#fffbeb',
          borderRadius: 10, border: '1px solid #fde68a',
          color: '#92400e', fontSize: 14,
        }}>
          The document you uploaded doesn't appear to contain line-item pricing data. Please upload the full estimate PDF from your carrier.
        </div>
      )}

      {/* Error */}
      {props.errorMsg && (
        <div style={{ padding: '10px 14px', background: '#fef2f2', borderRadius: 8, color: '#dc2626', fontSize: 14 }}>
          {props.errorMsg}
        </div>
      )}

      {/* Complete step */}
      {!props.step6Done && (analysis.status === 'CLOSE' || disputeLetter || props.legalSubmitted) && (
        <button
          onClick={props.onComplete}
          disabled={props.completing}
          style={{
            padding: '14px 24px', background: '#0f172a', color: '#fff',
            border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 15,
          }}
        >
          {props.completing ? 'Saving…' : 'Review Complete — Continue to Payments →'}
        </button>
      )}

      {props.step6Done && (
        <div style={{
          padding: '12px 16px', background: '#f0fdf4',
          borderRadius: 8, color: '#166534', fontSize: 14, fontWeight: 600,
        }}>
          ✓ Step 6 complete
        </div>
      )}
    </div>
  )
}

function DisputeLetterCard({ letter, copied, onCopy }: { letter: string; copied: boolean; onCopy: () => void }) {
  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{
        padding: '12px 18px', background: '#f8fafc',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        borderBottom: '1px solid #e2e8f0',
      }}>
        <span style={{ fontWeight: 700, color: '#0f172a', fontSize: 14 }}>✉️ Dispute Letter</span>
        <button
          onClick={onCopy}
          style={{
            padding: '6px 14px', background: copied ? '#0d9488' : '#fff',
            color: copied ? '#fff' : '#334155',
            border: '1px solid #e2e8f0', borderRadius: 6,
            fontSize: 13, cursor: 'pointer', fontWeight: 600,
          }}
        >
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
      <pre style={{
        margin: 0, padding: '18px 20px',
        fontFamily: 'Georgia, serif', fontSize: 13,
        lineHeight: 1.7, color: '#0f172a',
        whiteSpace: 'pre-wrap', maxHeight: 400, overflowY: 'auto',
      }}>
        {letter}
      </pre>
    </div>
  )
}

function LegalEscalationForm(props: {
  partnerName: string; setPartnerName: (v: string) => void
  partnerEmail: string; setPartnerEmail: (v: string) => void
  ownerName: string; setOwnerName: (v: string) => void
  ownerEmail: string; setOwnerEmail: (v: string) => void
  submitted: { partnerName: string } | null
  onSubmit: () => void; submitting: boolean
}) {
  if (props.submitted) {
    return (
      <div style={{
        padding: '20px 24px', background: '#f0fdf4',
        borderRadius: 10, border: '1px solid #bbf7d0', textAlign: 'center',
      }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
        <div style={{ fontWeight: 700, color: '#166534', fontSize: 16, marginBottom: 4 }}>
          Legal review request sent
        </div>
        <div style={{ color: '#4ade80', fontSize: 13 }}>
          Sent to {props.submitted.partnerName}
        </div>
      </div>
    )
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px',
    border: '1px solid #e2e8f0', borderRadius: 8,
    fontSize: 14, color: '#0f172a', boxSizing: 'border-box',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 13, fontWeight: 600,
    color: '#334155', marginBottom: 6,
  }

  return (
    <div style={{ padding: '20px 24px', background: '#fef2f2', borderRadius: 10, border: '1px solid #fecaca' }}>
      <div style={{ fontWeight: 700, color: '#991b1b', fontSize: 16, marginBottom: 16 }}>
        ⚖️ Send for Legal Review
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div>
          <label style={labelStyle}>Legal Partner Name</label>
          <input style={inputStyle} value={props.partnerName} onChange={e => props.setPartnerName(e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Legal Partner Email</label>
          <input style={inputStyle} type="email" value={props.partnerEmail} onChange={e => props.setPartnerEmail(e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Property Owner Name</label>
          <input style={inputStyle} value={props.ownerName} onChange={e => props.setOwnerName(e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Property Owner Email</label>
          <input style={inputStyle} type="email" value={props.ownerEmail} onChange={e => props.setOwnerEmail(e.target.value)} />
        </div>
      </div>
      <button
        onClick={props.onSubmit}
        disabled={props.submitting || !props.partnerName || !props.partnerEmail}
        style={{
          width: '100%', padding: '12px 24px',
          background: '#dc2626', color: '#fff',
          border: 'none', borderRadius: 8, fontWeight: 700,
          cursor: 'pointer', fontSize: 15,
          opacity: (!props.partnerName || !props.partnerEmail) ? 0.5 : 1,
        }}
      >
        {props.submitting ? 'Sending…' : 'Send Approval Request →'}
      </button>
    </div>
  )
}
```

**Step 3: TypeScript check**

```bash
cd "/Users/benjaminlopez/Documents/ClaimCoachAI Code/frontend"
npx tsc --noEmit 2>&1 | head -30
```

Fix any type errors before continuing.

**Step 4: Commit**

```bash
git add frontend/src/components/Step6AdjudicationEngine.tsx \
        frontend/src/types/claim.ts \
        frontend/src/lib/api.ts
git commit -m "feat: add Step6AdjudicationEngine with PM Brain status-driven adaptive UI"
```

---

## Task 11: Wire into ClaimStepper + Clean Up

**Files:**
- Modify: `frontend/src/components/ClaimStepper.tsx`

**Step 1: Add import**

At the top of ClaimStepper.tsx, add:
```tsx
import Step6AdjudicationEngine from './Step6AdjudicationEngine'
```

**Step 2: Replace case 6 content**

Find `case 6:` in ClaimStepper.tsx and replace the entire block (~500 lines) with:
```tsx
case 6:
  return (
    <Step6AdjudicationEngine
      claim={claim}
      scopeSheet={scopeSheet ?? null}
    />
  )
```

**Step 3: Remove orphaned Step 6 state variables**

Delete these `useState` declarations from ClaimStepper:
- `carrierEstimateFile`
- `isPollingCarrierEstimate`
- `rebuttalText`
- `auditLoadingStep`
- `discrepanciesOpen`
- `legalEscalationDismissed`
- `showLegalEscalationForm`
- `legalEscalationSubmitted`
- `legalPartnerName`
- `legalPartnerEmail`
- Any step 6 `ownerName` / `ownerEmail` state that was declared only for step 6

**Step 4: Remove orphaned Step 6 mutations**

Delete these mutations from ClaimStepper:
- `uploadCarrierEstimateMutation`
- `generateAuditMutation`
- `generateRebuttalMutation`
- `legalEscalationMutation`

Also remove any `useEffect` blocks that were exclusive to Step 6 polling.

**Step 5: Remove orphaned API imports**

In the imports section, remove: `compareEstimates`, `generateRebuttal`, `getRebuttal` (if they are no longer used elsewhere in ClaimStepper).

**Step 6: TypeScript check**

```bash
cd "/Users/benjaminlopez/Documents/ClaimCoachAI Code/frontend"
npx tsc --noEmit 2>&1 | head -30
```

Fix all type errors (the `noUnusedLocals: true` setting will flag anything you missed).

**Step 7: Final commit**

```bash
git add frontend/src/components/ClaimStepper.tsx
git commit -m "feat: wire Step6AdjudicationEngine into ClaimStepper, remove legacy Step 6 code"
```

---

## Task 12: Smoke Test

**Step 1: Start backend**
```bash
cd "/Users/benjaminlopez/Documents/ClaimCoachAI Code/backend"
go run cmd/server/main.go
```
Expected: server starts, no errors.

**Step 2: Start frontend**
```bash
cd "/Users/benjaminlopez/Documents/ClaimCoachAI Code/frontend"
npm run dev
```

**Step 3: Manual flow test**
1. Open a claim → navigate to Step 6
2. Upload a carrier estimate PDF
3. Verify parsing progress shows, then "Analyze the Offer →" button appears
4. Click analyze — verify animation plays through all 4 steps
5. Verify verdict card appears with correct status banner
6. For DISPUTE_OFFER: click "Generate Dispute Letter" → verify letter appears
7. For LEGAL_REVIEW: fill in legal form → verify submission
8. Click "Review Complete →" → verify claim advances to Step 7
9. Reload page → verify analysis is restored (not lost)

**Step 4: Final commit**
```bash
git add -A
git commit -m "feat: Step 6 PM Brain Strategy Engine — complete implementation"
```
