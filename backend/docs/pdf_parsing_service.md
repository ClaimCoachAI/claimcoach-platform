# PDF Parsing Service

## Overview

The PDF Parsing Service extracts structured line items from carrier estimate PDFs using a combination of Go PDF libraries and LLM-based data structuring.

## Architecture

### Components

1. **PDFParserService** (`internal/services/pdf_parser_service.go`)
   - Main service for parsing carrier estimate PDFs
   - Downloads PDF from Supabase Storage
   - Extracts text using `github.com/ledongthuc/pdf`
   - Uses Perplexity LLM to structure data
   - Updates database with parsed results

2. **Handler** (`internal/handlers/carrier_estimate_handler.go`)
   - `ParseCarrierEstimate` endpoint
   - Triggers async parsing
   - Returns 202 Accepted immediately

3. **Route**
   - `POST /api/claims/:id/carrier-estimate/:estimateId/parse`

## Workflow

### 1. Upload Carrier Estimate
```http
POST /api/claims/{claimId}/carrier-estimate/upload-url
Content-Type: application/json

{
  "file_name": "carrier_estimate.pdf",
  "file_size": 1024000,
  "mime_type": "application/pdf"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "upload_url": "https://...",
    "estimate_id": "est-123",
    "file_path": "organizations/.../carrier-estimate/..."
  }
}
```

### 2. Confirm Upload
```http
POST /api/claims/{claimId}/carrier-estimate/{estimateId}/confirm
```

### 3. Trigger Parsing
```http
POST /api/claims/{claimId}/carrier-estimate/{estimateId}/parse
```

Response:
```json
{
  "success": true,
  "message": "Parsing started",
  "data": {
    "claim_id": "claim-123",
    "estimate_id": "est-123",
    "status": "processing"
  }
}
```

### 4. Check Parse Status
```http
GET /api/claims/{claimId}/carrier-estimate
```

Response:
```json
{
  "success": true,
  "data": [
    {
      "id": "est-123",
      "claim_id": "claim-123",
      "file_name": "carrier_estimate.pdf",
      "parse_status": "completed",
      "parsed_data": {
        "line_items": [
          {
            "description": "Remove shingles",
            "quantity": 1900,
            "unit": "SF",
            "unit_cost": 2.50,
            "total": 4750.00,
            "category": "Roofing"
          }
        ],
        "total": 15390.00
      },
      "parsed_at": "2024-01-01T12:00:00Z"
    }
  ]
}
```

## Parse Status States

- `pending` - Uploaded but not yet parsed
- `processing` - Currently being parsed
- `completed` - Successfully parsed
- `failed` - Parsing failed (check `parse_error` field)

## PDF Extraction

### Library: `github.com/ledongthuc/pdf`

The service uses a lightweight PDF library to extract text content from PDFs:

```go
// Extract text from all pages
reader, err := pdf.NewReader(strings.NewReader(string(pdfContent)), int64(len(pdfContent)))
numPages := reader.NumPage()

for pageNum := 1; pageNum <= numPages; pageNum++ {
    page := reader.Page(pageNum)
    text, err := page.GetPlainText(nil)
    // Collect text...
}
```

## LLM Structuring

### Temperature: 0.1 (for consistency)

The extracted text is sent to Perplexity with a structured prompt:

**System Prompt:**
```
You are a data extraction assistant. Extract line items from a carrier estimate.

Return JSON with this structure:
{
  "line_items": [
    {
      "description": "string",
      "quantity": number,
      "unit": "string",
      "unit_cost": number,
      "total": number,
      "category": "string"
    }
  ],
  "total": number
}
```

**User Prompt:**
```
Extract line items from this carrier estimate:

[PDF text content]
```

## Data Structure

### LineItem
```go
type LineItem struct {
    Description string  `json:"description"` // e.g., "Remove shingles"
    Quantity    float64 `json:"quantity"`    // e.g., 1900
    Unit        string  `json:"unit"`        // e.g., "SF"
    UnitCost    float64 `json:"unit_cost"`   // e.g., 2.50
    Total       float64 `json:"total"`       // e.g., 4750.00
    Category    string  `json:"category"`    // e.g., "Roofing"
}
```

### ParsedEstimateData
```go
type ParsedEstimateData struct {
    LineItems []LineItem `json:"line_items"`
    Total     float64    `json:"total"`
}
```

## Error Handling

### Parse Errors

If parsing fails, the `parse_status` is set to `failed` and `parse_error` contains the error message:

```json
{
  "id": "est-123",
  "parse_status": "failed",
  "parse_error": "Failed to extract text from PDF: no text content found in PDF"
}
```

Common errors:
- PDF download failed
- No text content in PDF (scanned images)
- LLM service unavailable
- Invalid JSON response from LLM
- No line items extracted

### Graceful Degradation

The service handles errors at each step:
1. Download fails → Status: failed, Error logged
2. Text extraction fails → Status: failed, Error logged
3. LLM fails → Status: failed, Error logged
4. JSON parsing fails → Status: failed, Error logged

## Database Schema

```sql
CREATE TABLE carrier_estimates (
    id UUID PRIMARY KEY,
    claim_id UUID REFERENCES claims(id),
    uploaded_by_user_id UUID REFERENCES users(id),
    file_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_size_bytes BIGINT,
    parsed_data JSONB,           -- Structured line items
    parse_status TEXT NOT NULL,  -- pending/processing/completed/failed
    parse_error TEXT,            -- Error message if failed
    uploaded_at TIMESTAMP NOT NULL,
    parsed_at TIMESTAMP          -- When parsing completed
);
```

## Testing

Run tests:
```bash
go test ./internal/services/... -v -run "Test.*CarrierEstimate|TestUpdateParseStatus|TestUpdateParsedData|TestStructureDataWithLLM"
```

### Test Coverage

- `TestGetCarrierEstimate` - Database retrieval
- `TestUpdateParseStatus` - Status updates
- `TestUpdateParsedData` - Parsed data storage
- `TestStructureDataWithLLM` - LLM integration
- `TestParseCarrierEstimate_AuthorizationFlow` - Authorization
- `TestLineItemSerialization` - JSON serialization

## Configuration

Environment variables:
- `PERPLEXITY_API_KEY` - API key for Perplexity
- `PERPLEXITY_MODEL` - Model to use (default: "sonar-pro")
- `PERPLEXITY_TIMEOUT` - Request timeout in seconds (default: 60)
- `PERPLEXITY_MAX_RETRIES` - Max retry attempts (default: 3)

## Dependencies

```go
require (
    github.com/ledongthuc/pdf v0.0.0-20250511090121-5959a4027728
    github.com/supabase-community/storage-go v0.7.0
)
```

## Security

- Organization-based access control
- Claim ownership verification
- Presigned URL expiration (5 minutes for downloads)
- PDF file type validation
- Size limits (10MB max)

## Performance

- Async processing (non-blocking)
- PDF downloads with 30-second timeout
- LLM requests with retry logic
- Temperature: 0.1 for consistency
- Max tokens: 4000 for responses

## Future Enhancements

1. Support for scanned PDFs (OCR)
2. Multi-page table extraction
3. Confidence scores for extracted data
4. Manual correction interface
5. Batch parsing
6. Progress tracking with webhooks
