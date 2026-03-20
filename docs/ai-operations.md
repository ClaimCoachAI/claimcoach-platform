# AI Operations Reference

> **Purpose:** Track every AI model in use, what it does, and where to find the code. Update this file whenever a model or operation changes.
>
> Last updated: 2026-03-19

---

## Models in Use

| Provider | Model | Env Var | Default | Role |
|---|---|---|---|---|
| Anthropic | Claude Sonnet 4.6 | `ANTHROPIC_MODEL` | `claude-sonnet-4-6` | Core reasoning — estimates, letters, analysis |
| Anthropic | Claude Haiku 4.5 | `ANTHROPIC_PDF_MODEL` | `claude-haiku-4-5-20251001` | PDF parsing (cost-optimized) |
| OpenAI | GPT-4o Mini Search Preview | `OPENAI_MODEL` | `gpt-4o-mini-search-preview` | Live material pricing via web search |
| Perplexity | Sonar Pro | `PERPLEXITY_MODEL` | `sonar-pro` | (client configured, currently unused in active flows — legacy) |

---

## Operations

### 1. Carrier Estimate PDF Parsing
**Model:** Claude Haiku 4.5
**Service:** `backend/internal/services/pdf_parser_service.go` → `parsePDFWithClaude`
**Triggered by:** User uploading a carrier estimate PDF
**Input:** Raw PDF bytes (sent as base64 to Claude's document API)
**Output:** Structured JSON — document type, line items (description, qty, unit cost, total, category), total amount, notes
**Retries:** 3 attempts with 2s/4s/6s backoff
**Why Haiku:** High-volume, straightforward extraction task — Haiku is ~10x cheaper than Sonnet with equivalent accuracy for structured extraction

---

### 2. Industry Estimate Generation
**Model:** Claude Sonnet 4.6
**Service:** `backend/internal/services/audit_service.go` → `GenerateIndustryEstimate`
**Triggered by:** User requesting an AI-generated industry-standard estimate
**Input:** Scope sheet data (damage tags, measurements, property details) + optional live pricing context
**Output:** Structured JSON estimate with line items, totals, and reasoning
**Max tokens:** 8,000
**Temperature:** 0.2 (low — deterministic estimates)
**Notes:** This is the primary value-generation operation. Sonnet is used here because the prompt requires multi-step reasoning over scope data and pricing context.

---

### 3. Live Pricing Lookup
**Model:** GPT-4o Mini Search Preview (OpenAI)
**Service:** `backend/internal/services/audit_service.go` → `fetchLivePricing`
**Triggered by:** During estimate generation, before building the Sonnet prompt
**Input:** Damage tags + property address (city/state injected as location context)
**Output:** Current material/labor pricing text that gets injected into the Sonnet estimate prompt
**Fallback:** If `OPENAI_API_KEY` is not set or the call fails, estimate generation falls back to Claude's training data pricing
**Why this model:** `gpt-4o-mini-search-preview` has built-in web search — no separate retrieval layer needed

---

### 4. PM Brain Analysis
**Model:** Claude Sonnet 4.6
**Service:** `backend/internal/services/audit_service.go` → `RunPMBrainAnalysis` / `ProcessPMBrainJob`
**Triggered by:** User requesting PM Brain analysis on an audit report
**Input:** Audit report data, carrier estimate, scope sheet
**Output:** Strategic analysis — gap identification, negotiation recommendations, red flags
**Max tokens:** 4,096
**Temperature:** 0.2

---

### 5. Dispute Letter Generation
**Model:** Claude Sonnet 4.6
**Service:** `backend/internal/services/audit_service.go` → `GenerateDisputeLetter`
**Triggered by:** User requesting a dispute letter from an audit report
**Input:** Audit report with estimate delta, carrier estimate data, claim details
**Output:** Professional dispute letter ready to send to carrier
**Max tokens:** 900
**Temperature:** 0.3

---

### 6. Owner Pitch Generation
**Model:** Claude Sonnet 4.6
**Service:** `backend/internal/services/audit_service.go` → `GenerateOwnerPitch`
**Triggered by:** User requesting a homeowner pitch from an audit report
**Input:** Audit report, claim details, estimated recovery amount
**Output:** Persuasive pitch document explaining claim value to property owner
**Max tokens:** 1,500
**Temperature:** 0.4 (slightly higher — persuasive/creative writing)

---

### 7. Claim Viability Analysis
**Model:** Claude Sonnet 4.6
**Service:** `backend/internal/services/audit_service.go` → `AnalyzeClaimViability`
**Triggered by:** User requesting viability check on a claim
**Input:** Claim data, policy details, scope sheet, property info
**Output:** Viability score, go/no-go recommendation, supporting reasoning
**Max tokens:** 1,000
**Temperature:** 0.1 (very deterministic — pass/fail judgement)

---

### 8. RCV Demand Letter Generation
**Model:** Claude Sonnet 4.6
**Service:** `backend/internal/services/rcv_demand_service.go` → `GenerateRCVDemandLetter`
**Triggered by:** User requesting an RCV demand letter after ACV payment received
**Input:** Claim details, payment summary (ACV received, RCV expected, outstanding balance)
**Output:** Formal demand letter requesting outstanding RCV from carrier
**Max tokens:** 1,500
**Temperature:** 0.3

---

## Cost Monitoring

API usage is logged to the `api_usage_logs` table per operation. Each log entry includes:
- `api_call_type` — which operation (e.g., `rcv_demand_generation`)
- `tokens_used` — total tokens consumed
- `estimated_cost` — rough dollar estimate

Token usage is returned in `ChatResponse.Usage.TotalTokens` from all three providers and logged at the service layer.

---

## Configuration

All models are overridable via environment variables (see table above). API keys are stored in GitHub Actions secrets — see MEMORY.md for the full list.

To change a model without a code deploy, update the environment variable in the Lambda function configuration or GitHub Actions secrets and redeploy.

---

## Adding a New AI Operation

1. Add a new `## N. Operation Name` section to this file
2. Note the model, service file, trigger, input/output, and temperature
3. Wire up token logging via `logAPIUsage` in the service
