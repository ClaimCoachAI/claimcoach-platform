# AI Audit Prompts

This document captures the exact LLM prompts used in the AI audit pipeline (Step 6: Review Insurance Offer). Reference this when tuning, debugging, or improving the analysis quality.

**File:** `backend/internal/services/audit_service.go`

---

## Overview

The audit runs three sequential LLM calls:

| # | Purpose | Model | Temp | Max Tokens |
|---|---------|-------|------|------------|
| 1 | Generate industry-standard estimate from scope sheet | Perplexity Sonar | 0.2 | 2,000 |
| 2 | Compare industry estimate vs. carrier estimate | Claude Haiku | 0.2 | 3,000 |
| 3 | Generate rebuttal letter | Claude Haiku | 0.3 | 2,000 |

---

## Call 1 — Generate Industry Estimate

**Trigger:** `POST /api/claims/:id/audit/generate`
**Function:** `GenerateIndustryEstimate` → `buildEstimatePrompt`

### System Prompt
```
You are an expert construction estimator specializing in insurance claims.
Your task is to produce accurate, industry-standard repair estimates in Xactimate-style format.
Always respond with valid JSON only, no additional text or explanations.
```

### User Prompt (dynamic)
```
Based on the following scope sheet data and current industry pricing,
produce a detailed Xactimate-style estimate in JSON format.

SCOPE SHEET DATA:
- [every non-null field from the scope sheet, e.g.]
- roof_type: Asphalt Shingle
- total_squares: 28
- stories: 2
- [etc. — all non-ID, non-timestamp fields that have values]

RESPONSE FORMAT:
Return ONLY a JSON object with this exact structure:
{
  "line_items": [
    {
      "description": "Item description",
      "quantity": number,
      "unit": "unit type (e.g., SF, LF, EA)",
      "unit_cost": number,
      "total": number,
      "category": "category name (e.g., Roofing, Exterior Trim)"
    }
  ],
  "subtotal": number,
  "overhead_profit": number (typically 20% of subtotal),
  "total": number
}

Use current 2026 industry-standard pricing for materials and labor.
Include all items from the scope sheet with appropriate quantities and costs.
```

### Notes
- Scope sheet fields are reflected dynamically — any null/false/empty fields are excluded
- Overhead & profit is instructed at 20%, which is the Xactimate standard
- Pricing reference year is hardcoded as 2026 — **update this annually**

---

## Call 2 — Compare Estimates

**Trigger:** `POST /api/claims/:id/audit/:auditId/compare`
**Function:** `CompareEstimates` → `buildComparisonPrompt`

### System Prompt
```
You are an expert insurance claim auditor.
Your task is to compare industry-standard estimates with carrier estimates and identify discrepancies.
Always respond with valid JSON only, no additional text or explanations.
```

### User Prompt (dynamic)
```
Compare these two estimates and identify discrepancies:

INDUSTRY ESTIMATE (from contractor scope):
[JSON output from Call 1]

CARRIER ESTIMATE (from insurance company):
[parsed text/JSON extracted from the carrier's PDF]

For each discrepancy, provide:
- Item description
- Industry price vs Carrier price
- Delta amount
- Justification (why industry price is correct)

Return JSON:
{
  "discrepancies": [
    {
      "item": "description",
      "industry_price": X.XX,
      "carrier_price": X.XX,
      "delta": X.XX,
      "justification": "detailed explanation"
    }
  ],
  "summary": {
    "total_industry": X.XX,
    "total_carrier": X.XX,
    "total_delta": X.XX
  }
}
```

### Notes & Known Weaknesses
- The justification instruction (`"why industry price is correct"`) is intentionally brief — the LLM may produce vague justifications. Consider adding: *"cite labor rates, material costs, local market data, or Xactimate line codes where applicable"*
- The prompt does not pass the **loss type** (water vs. hail) as context. This is relevant — hail and water damage have different applicable line items and pricing norms. Consider adding this
- Items with no discrepancy are not returned, only items where carrier < industry

---

## Call 3 — Generate Rebuttal Letter

**Trigger:** `POST /api/claims/:id/audit/:auditId/rebuttal`
**Function:** `GenerateRebuttal` → `buildRebuttalPrompt`

### System Prompt
```
You are a professional insurance claim specialist writing formal rebuttal letters.
Your task is to create well-structured, professional business letters that present discrepancies
between carrier estimates and industry-standard pricing with clear justification.
The tone should be professional, factual, and respectful.
```

### User Prompt (dynamic)
```
Generate a professional rebuttal letter for a property insurance claim.

PROPERTY DETAILS:
- Address: [property legal address]
- Policy Number: [policy number, if available]
- Carrier: [carrier name]
- Claim Number: [claim number, if available]
- Incident Date: [e.g., January 15, 2026]

COMPARISON SUMMARY:
- Industry Standard Total: $X,XXX.XX
- Carrier Estimate Total: $X,XXX.XX
- Delta: $X,XXX.XX

DISCREPANCIES:
1. Item: [item name]
   Industry Price: $X.XX
   Carrier Price: $X.XX
   Delta: $X.XX
   Justification: [justification from Call 2]

2. [etc. for each discrepancy]

Create a formal business letter addressed to the insurance adjuster that:
1. References the claim professionally with property address and claim number
2. States the purpose clearly (requesting reconsideration of the estimate)
3. Presents each discrepancy with industry justification
4. Maintains a professional and respectful tone throughout
5. Includes specific line items and pricing differences
6. Requests a meeting or further discussion
7. Thanks them for their consideration

Format as a complete business letter with:
- Date (use today's date)
- Salutation (To: Insurance Adjuster)
- Subject line with claim reference
- Body paragraphs
- Professional closing

Do not include placeholder addresses, signatures, or company names in the signature block.
Write the letter ready to be reviewed and signed by the property manager.
```

### Notes
- The letter is intentionally left unsigned — it's written for the property owner/manager to sign themselves
- ClaimCoach is not mentioned in the letter; it reads as if written by the policyholder
- If policy number or claim number is missing from the DB, those lines are omitted from the prompt

---

## Suggested Improvements (Not Yet Implemented)

1. **Loss type context in Call 2** — Pass `loss_type: water | hail` so the LLM can apply the right pricing norms (e.g., ice & water shield for hail, moisture barriers for water)
2. **Richer justification guidance in Call 2** — Instruct the LLM to cite Xactimate line codes, RSMeans data, or local market rates rather than generic reasoning
3. **Call 2 threshold filter** — Add a minimum delta threshold (e.g., only flag discrepancies > $50) to reduce noise in the output
4. **Rebuttal addressee** — Once the adjuster's name is captured in Step 5, pass it into the rebuttal prompt so the salutation is personalized
