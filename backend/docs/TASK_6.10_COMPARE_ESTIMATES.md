# Task 6.10: Compare Estimates Service

## Overview

The Compare Estimates Service is part of the AI-powered audit workflow. It compares industry-standard contractor estimates with insurance carrier estimates to identify discrepancies and provide justifications.

## Implementation Details

### Service Method

**Location**: `internal/services/audit_service.go`

**Method**: `CompareEstimates(ctx context.Context, auditReportID string, userID string, orgID string) error`

**Flow**:
1. Retrieves audit report by ID and verifies ownership via claim → property → organization
2. Validates that industry estimate exists (from Task 6.7)
3. Retrieves carrier estimate for the claim
4. Validates that carrier estimate has been parsed (from Task 6.9)
5. Builds comparison prompt with both estimates
6. Calls LLM API to generate comparison analysis
7. Parses LLM response (JSON with discrepancies and justifications)
8. Extracts totals from comparison data
9. Updates audit report with:
   - `comparison_data` (JSONB)
   - `total_contractor_estimate` (float64)
   - `total_carrier_estimate` (float64)
   - `total_delta` (float64)
   - `status` = "completed"
10. Logs API usage for billing

### LLM Configuration

- **Temperature**: 0.2 (low variability for consistent analysis)
- **Max Tokens**: 3000 (sufficient for detailed comparison)
- **Model**: Perplexity Sonar Large (configured via environment)

### LLM Prompt Format

The prompt provides:
- Industry estimate JSON (from contractor scope)
- Carrier estimate JSON (from insurance company)
- Instructions for identifying discrepancies
- Expected JSON response format

### Response Format

```json
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

### Handler

**Location**: `internal/handlers/audit_handler.go`

**Endpoint**: `POST /api/claims/:id/audit/:auditId/compare`

**Authentication**: Required (JWT via middleware)

**Request**: No body required (uses path parameters)

**Response**:
- **200 OK**: Comparison completed successfully
- **400 Bad Request**: Industry estimate not generated or carrier estimate not uploaded/parsed
- **404 Not Found**: Audit report not found
- **500 Internal Server Error**: Processing error

### Error Handling

The service handles the following error cases:
- Audit report not found or unauthorized access
- Industry estimate not generated yet
- Carrier estimate not uploaded
- Carrier estimate not parsed yet
- Invalid JSON from LLM
- Missing required fields in comparison data

### Database Updates

Updates `audit_reports` table:
- `comparison_data`: JSONB containing full comparison results
- `total_contractor_estimate`: Sum from industry estimate
- `total_carrier_estimate`: Sum from carrier estimate
- `total_delta`: Difference between totals
- `status`: Set to "completed"
- `updated_at`: Current timestamp

### API Usage Logging

All LLM API calls are logged to `api_usage_logs` table with:
- Organization ID (for billing)
- Model name
- Token usage (prompt, completion, total)
- Estimated cost

## Testing

### Service Tests

**Location**: `internal/services/audit_service_test.go`

**Test Cases**:
1. `TestCompareEstimates_Success`: Successful comparison flow
2. `TestCompareEstimates_NoIndustryEstimate`: Industry estimate not generated
3. `TestCompareEstimates_NoCarrierEstimate`: Carrier estimate not uploaded
4. `TestCompareEstimates_CarrierEstimateNotParsed`: Carrier estimate pending parsing
5. `TestCompareEstimates_AuditReportNotFound`: Invalid audit report ID

### Handler Tests

**Location**: `internal/handlers/audit_handler_test.go`

**Test Cases**:
1. `TestCompareEstimatesHandler_Success`: Successful request
2. `TestCompareEstimatesHandler_AuditReportNotFound`: 404 response
3. `TestCompareEstimatesHandler_IndustryEstimateNotGenerated`: 400 response
4. `TestCompareEstimatesHandler_CarrierEstimateNotUploaded`: 400 response
5. `TestCompareEstimatesHandler_CarrierEstimateNotParsed`: 400 response
6. `TestCompareEstimatesHandler_InternalError`: 500 response

## Usage Example

```bash
# 1. Generate industry estimate (Task 6.7)
POST /api/claims/{claimId}/generate-estimate

# 2. Upload carrier estimate (Task 6.8)
POST /api/claims/{claimId}/carrier-estimate/upload-url
POST /api/claims/{claimId}/carrier-estimate/{estimateId}/confirm

# 3. Parse carrier estimate (Task 6.9)
POST /api/claims/{claimId}/carrier-estimate/{estimateId}/parse

# 4. Compare estimates (Task 6.10)
POST /api/claims/{claimId}/audit/{auditId}/compare

# Response
{
  "success": true,
  "message": "Estimates compared successfully"
}
```

## Dependencies

- **Requires**: Tasks 6.7 (Industry Estimate) and 6.9 (PDF Parsing) to be completed
- **Enables**: Task 6.11 (Generate Rebuttal)

## Security

- Ownership verification via claim → property → organization relationship
- JWT authentication required
- User must belong to the organization that owns the property

## Future Enhancements

1. Support multiple carrier estimates per claim
2. Historical comparison tracking
3. Export comparison reports to PDF
4. Bulk comparison for multiple claims
5. Custom comparison rules per organization
