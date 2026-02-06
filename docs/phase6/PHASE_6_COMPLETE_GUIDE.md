# Phase 6: AI Audit System - Complete Guide

## Overview

Phase 6 implements an AI-powered claim auditing system that compares contractor scope sheets against carrier estimates to identify undervalued line items and generate professional rebuttal letters. This system uses LLM technology (Perplexity API) to generate industry-standard estimates and perform line-by-line comparisons.

## Architecture

### System Components

```
┌─────────────────┐     Magic Link      ┌──────────────────┐
│   Contractor    │ ──────────────────> │   Scope Sheet    │
│     Portal      │                     │      Form        │
└─────────────────┘                     └──────────────────┘
                                               │
                                               ↓
                                        ┌──────────────┐
                                        │   Supabase   │
                                        │   Database   │
                                        └──────────────┘
                                               │
                                               ↓
┌──────────────────┐                   ┌──────────────────┐
│ Property Manager │ ──────────────────>│  Generate Industry│
│      Portal      │                   │    Estimate      │
└──────────────────┘                   └──────────────────┘
        │                                      │
        │                                      ↓
        │                              ┌──────────────────┐
        │                              │  Perplexity API  │
        │                              │   (LLM Service)  │
        │                              └──────────────────┘
        │                                      │
        ↓                                      ↓
┌──────────────────┐                   ┌──────────────────┐
│ Upload Carrier   │                   │  Audit Report    │
│    Estimate      │                   │   (Generated)    │
└──────────────────┘                   └──────────────────┘
        │                                      │
        ↓                                      │
┌──────────────────┐                          │
│   PDF Parser     │                          │
│  (Extract Text)  │                          │
└──────────────────┘                          │
        │                                      │
        ↓                                      ↓
┌──────────────────┐                   ┌──────────────────┐
│  LLM Structure   │ ──────────────────>│  Compare         │
│   Line Items     │                   │   Estimates      │
└──────────────────┘                   └──────────────────┘
                                               │
                                               ↓
                                        ┌──────────────────┐
                                        │   Generate       │
                                        │   Rebuttal       │
                                        └──────────────────┘
                                               │
                                               ↓
                                        ┌──────────────────┐
                                        │ Professional     │
                                        │ Letter (Export)  │
                                        └──────────────────┘
```

### Data Flow

1. **Contractor Workflow:**
   - Receives magic link via email
   - Fills out digital scope sheet (50+ fields)
   - Submits scope sheet to database

2. **Property Manager Workflow:**
   - Views submitted scope sheet
   - Generates industry estimate via LLM
   - Uploads carrier PDF estimate
   - System parses PDF and extracts line items
   - Compares estimates line-by-line
   - Reviews discrepancies
   - Generates rebuttal letter
   - Exports/prints letter

## Database Schema

### Tables Created in Phase 6

#### 1. scope_sheets

Stores contractor-submitted damage assessments.

```sql
CREATE TABLE scope_sheets (
    id UUID PRIMARY KEY,
    claim_id UUID REFERENCES claims(id),

    -- Roof Main (20+ fields)
    roof_type VARCHAR(100),
    roof_square_footage INTEGER,
    roof_pitch VARCHAR(50),
    fascia_lf INTEGER,
    fascia_paint BOOLEAN,
    -- ... more fields

    -- Roof Other (20+ fields)
    -- Dimensions
    -- Siding (Front, Right, Back, Left)
    -- Additional

    notes TEXT,
    submitted_at TIMESTAMP,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

**Key Fields:**
- `claim_id`: Links to claim record
- `submitted_at`: NULL until contractor submits
- All measurement fields are nullable (contractor may not fill all)

#### 2. carrier_estimates

Stores uploaded carrier estimate PDFs and parsed data.

```sql
CREATE TABLE carrier_estimates (
    id UUID PRIMARY KEY,
    claim_id UUID REFERENCES claims(id),
    uploaded_by_user_id UUID REFERENCES users(id),

    file_path VARCHAR(500),
    file_name VARCHAR(255),
    file_size_bytes INTEGER,

    parsed_data JSONB,
    parse_status VARCHAR(50), -- pending, processing, completed, failed
    parse_error TEXT,

    uploaded_at TIMESTAMP,
    parsed_at TIMESTAMP
);
```

**Parse Status Values:**
- `pending`: PDF uploaded, awaiting parsing
- `processing`: Currently extracting text and structuring data
- `completed`: Successfully parsed
- `failed`: Parsing error (see parse_error field)

#### 3. audit_reports

Stores LLM-generated estimates and comparisons.

```sql
CREATE TABLE audit_reports (
    id UUID PRIMARY KEY,
    claim_id UUID REFERENCES claims(id),
    scope_sheet_id UUID REFERENCES scope_sheets(id),
    carrier_estimate_id UUID REFERENCES carrier_estimates(id),

    generated_estimate JSONB, -- Industry-standard estimate
    comparison_data JSONB,    -- Line-by-line comparison

    total_contractor_estimate DECIMAL(12, 2),
    total_carrier_estimate DECIMAL(12, 2),
    total_delta DECIMAL(12, 2),

    status VARCHAR(50), -- pending, processing, completed, failed
    error_message TEXT,

    created_by_user_id UUID REFERENCES users(id),
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

**JSON Structures:**

`generated_estimate`:
```json
{
  "line_items": [
    {
      "description": "Remove existing shingles",
      "quantity": 2000,
      "unit": "SF",
      "unit_cost": 2.50,
      "total": 5000.00,
      "category": "Roofing"
    }
  ],
  "subtotal": 14450.00,
  "overhead_profit": 2890.00,
  "total": 17340.00
}
```

`comparison_data`:
```json
{
  "discrepancies": [
    {
      "item": "Install new shingles",
      "industry_price": 9000.00,
      "carrier_price": 7000.00,
      "delta": 2000.00,
      "justification": "Carrier used outdated pricing..."
    }
  ],
  "summary": {
    "total_industry": 17340.00,
    "total_carrier": 14650.00,
    "total_delta": 2690.00
  }
}
```

#### 4. rebuttals

Stores generated rebuttal letters.

```sql
CREATE TABLE rebuttals (
    id UUID PRIMARY KEY,
    audit_report_id UUID REFERENCES audit_reports(id),
    content TEXT, -- Full letter text
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

#### 5. api_usage_logs

Tracks LLM API calls for cost monitoring.

```sql
CREATE TABLE api_usage_logs (
    id UUID PRIMARY KEY,
    organization_id UUID REFERENCES organizations(id),

    model VARCHAR(100),
    endpoint VARCHAR(100),

    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    total_tokens INTEGER,

    estimated_cost DECIMAL(10, 4),
    created_at TIMESTAMP
);
```

## API Endpoints

### Contractor Portal (No Authentication)

#### 1. Submit Scope Sheet

```http
POST /api/magic-links/:token/scope-sheet
Content-Type: application/json

{
  "roof_type": "asphalt_shingles",
  "roof_square_footage": 2000,
  "roof_pitch": "6/12",
  "fascia_lf": 150,
  "fascia_paint": true,
  "soffit_lf": 100,
  "soffit_paint": false,
  "drip_edge_lf": 180,
  "pipe_jacks_count": 4,
  "ex_vents_count": 2,
  "notes": "Hail damage to north-facing slope"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "scope_sheet": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "claim_id": "...",
      "roof_type": "asphalt_shingles",
      "submitted_at": "2026-02-06T10:30:00Z",
      "created_at": "2026-02-06T10:30:00Z"
    }
  }
}
```

### Property Manager Portal (Authenticated)

#### 2. Get Scope Sheet

```http
GET /api/claims/:id/scope-sheet
Authorization: Bearer {jwt_token}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "scope_sheet": {
      "id": "...",
      "claim_id": "...",
      "roof_type": "asphalt_shingles",
      "roof_square_footage": 2000,
      "submitted_at": "2026-02-06T10:30:00Z"
    }
  }
}
```

#### 3. Generate Industry Estimate

```http
POST /api/claims/:id/audit/generate-estimate
Authorization: Bearer {jwt_token}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "report_id": "...",
    "status": "completed",
    "estimate": {
      "line_items": [...],
      "total": 17340.00
    }
  }
}
```

**Process:**
1. Validates scope sheet exists
2. Builds prompt from scope data
3. Calls Perplexity API
4. Validates JSON response
5. Saves to audit_reports
6. Logs API usage

#### 4. Upload Carrier Estimate

```http
POST /api/claims/:id/carrier-estimate
Authorization: Bearer {jwt_token}
Content-Type: multipart/form-data

file: [PDF file]
```

**Response:**
```json
{
  "success": true,
  "data": {
    "carrier_estimate": {
      "id": "...",
      "file_name": "carrier_estimate.pdf",
      "parse_status": "pending",
      "uploaded_at": "2026-02-06T11:00:00Z"
    }
  }
}
```

#### 5. Trigger PDF Parsing

```http
POST /api/carrier-estimates/:id/parse
Authorization: Bearer {jwt_token}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "processing"
  }
}
```

**Process:**
1. Downloads PDF from Supabase storage
2. Extracts text using PDF library
3. Sends to LLM for structuring
4. Validates line items
5. Updates carrier_estimate record

#### 6. Compare Estimates

```http
POST /api/audit-reports/:id/compare
Authorization: Bearer {jwt_token}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "comparison": {
      "discrepancies": [
        {
          "item": "Install shingles",
          "industry_price": 9000.00,
          "carrier_price": 7000.00,
          "delta": 2000.00,
          "justification": "..."
        }
      ],
      "summary": {
        "total_industry": 17340.00,
        "total_carrier": 14650.00,
        "total_delta": 2690.00
      }
    }
  }
}
```

#### 7. Generate Rebuttal

```http
POST /api/audit-reports/:id/generate-rebuttal
Authorization: Bearer {jwt_token}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "rebuttal_id": "...",
    "content": "Date: February 6, 2026\n\nTo: Insurance Adjuster..."
  }
}
```

#### 8. Get Audit Report

```http
GET /api/claims/:id/audit-report
Authorization: Bearer {jwt_token}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "audit_report": {
      "id": "...",
      "claim_id": "...",
      "status": "completed",
      "generated_estimate": {...},
      "comparison_data": {...},
      "total_contractor_estimate": 17340.00,
      "total_carrier_estimate": 14650.00,
      "total_delta": 2690.00
    }
  }
}
```

#### 9. Get Rebuttal

```http
GET /api/rebuttals/:id
Authorization: Bearer {jwt_token}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "rebuttal": {
      "id": "...",
      "audit_report_id": "...",
      "content": "Full letter text...",
      "created_at": "2026-02-06T12:00:00Z"
    }
  }
}
```

## Environment Variables

### Required Configuration

```bash
# Perplexity API
PERPLEXITY_API_KEY=pplx-xxxxxxxxxxxxxxxxxxxxx
PERPLEXITY_MODEL=sonar-pro                    # Options: sonar-pro, sonar-large
PERPLEXITY_TIMEOUT=60                         # Seconds
PERPLEXITY_MAX_RETRIES=3                      # Number of retry attempts

# Database
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# Supabase Storage
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxxxx
SUPABASE_STORAGE_BUCKET=claim-documents

# JWT Authentication
JWT_SECRET=your-secret-key
```

### Optional Configuration

```bash
# Cost Monitoring
ENABLE_API_USAGE_LOGGING=true               # Default: true
API_COST_ALERT_THRESHOLD=100.00            # Alert if monthly cost exceeds

# PDF Parsing
PDF_PARSE_TIMEOUT=120                       # Seconds for PDF parsing
PDF_MAX_SIZE_MB=10                         # Max PDF file size

# LLM Prompts
LLM_TEMPERATURE_ESTIMATE=0.2               # Lower = more consistent
LLM_TEMPERATURE_COMPARISON=0.2
LLM_TEMPERATURE_REBUTTAL=0.3               # Slightly higher for natural writing
```

## Cost Estimation

### Perplexity API Pricing (2026 rates)

- **Model:** sonar-pro
- **Input tokens:** $1.00 per 1M tokens
- **Output tokens:** $1.00 per 1M tokens

### Estimated Costs Per Claim

| Operation | Input Tokens | Output Tokens | Cost |
|-----------|--------------|---------------|------|
| Generate Industry Estimate | 800 | 1200 | $0.002 |
| Parse Carrier PDF | 2000 | 1500 | $0.0035 |
| Compare Estimates | 1500 | 2000 | $0.0035 |
| Generate Rebuttal | 1200 | 1000 | $0.0022 |
| **Total per claim** | **5500** | **5700** | **$0.0112** |

### Monthly Cost Estimates

| Claims/Month | Total Cost | Notes |
|--------------|------------|-------|
| 100 | $1.12 | Light usage |
| 500 | $5.60 | Moderate usage |
| 1000 | $11.20 | Heavy usage |
| 5000 | $56.00 | Enterprise |

### Cost Optimization Tips

1. **Batch operations** when possible
2. **Cache common responses** (e.g., standard line item prices)
3. **Use lower temperature** for deterministic outputs
4. **Limit max_tokens** appropriately
5. **Monitor API usage logs** daily

## Deployment Checklist

### Pre-Deployment

- [ ] Database migrations tested on staging
- [ ] Perplexity API key obtained and tested
- [ ] Supabase storage bucket created
- [ ] Environment variables configured
- [ ] SSL certificates valid
- [ ] Backup database before deployment

### Deployment Steps

1. **Backend Deployment**
   ```bash
   cd backend
   go test ./... -v
   go build -o claimcoach cmd/server/main.go
   ./claimcoach
   ```

2. **Database Migration**
   ```bash
   # Automatic on server start, or manual:
   migrate -path backend/migrations -database $DATABASE_URL up
   ```

3. **Frontend Deployment**
   ```bash
   cd frontend
   npm run build
   # Deploy dist/ to hosting service
   ```

### Post-Deployment

- [ ] Test magic link flow
- [ ] Submit test scope sheet
- [ ] Upload test carrier PDF
- [ ] Verify LLM estimate generation
- [ ] Check PDF parsing works
- [ ] Test comparison and rebuttal
- [ ] Verify API usage logging
- [ ] Monitor error logs for 24 hours

### Monitoring

#### Key Metrics to Track

1. **API Success Rate**
   ```sql
   SELECT
     COUNT(*) as total_calls,
     SUM(estimated_cost) as total_cost
   FROM api_usage_logs
   WHERE created_at > NOW() - INTERVAL '24 hours';
   ```

2. **Parse Success Rate**
   ```sql
   SELECT
     parse_status,
     COUNT(*) as count
   FROM carrier_estimates
   GROUP BY parse_status;
   ```

3. **Average Processing Time**
   - Track from scope submission to rebuttal generation

4. **Error Rates**
   ```sql
   SELECT
     status,
     COUNT(*) as count,
     error_message
   FROM audit_reports
   WHERE status = 'failed'
   GROUP BY status, error_message;
   ```

## Security Considerations

### Authentication

- **Contractor Portal:** Magic link only (time-limited tokens)
- **Property Manager Portal:** JWT authentication required
- **API Endpoints:** All authenticated endpoints verify organization ownership

### Authorization Checks

Every database query includes organization ownership verification:

```go
query := `
  SELECT ar.*
  FROM audit_reports ar
  INNER JOIN claims c ON ar.claim_id = c.id
  INNER JOIN properties p ON c.property_id = p.id
  WHERE ar.id = $1 AND p.organization_id = $2
`
```

### Data Privacy

- **Magic Links:** Expire after 7 days
- **PDFs:** Stored in Supabase with row-level security
- **API Keys:** Never exposed to frontend
- **PII:** No PII in LLM prompts
- **Audit Logs:** Track all data access

### Rate Limiting

Recommended rate limits:

- **Magic Link Endpoints:** 10 requests/minute per IP
- **File Upload:** 5 uploads/minute per user
- **LLM Operations:** 20 requests/minute per organization

## Troubleshooting

### Common Issues

#### 1. LLM Returns Invalid JSON

**Symptoms:** Parse error in logs, status = 'failed'

**Solution:**
```go
// Extract JSON from response if wrapped in markdown
jsonStart := strings.Index(response, "{")
jsonEnd := strings.LastIndex(response, "}")
if jsonStart >= 0 && jsonEnd > jsonStart {
    response = response[jsonStart : jsonEnd+1]
}
```

#### 2. PDF Parsing Fails

**Symptoms:** parse_status stuck in 'processing' or 'failed'

**Possible Causes:**
- PDF is image-based (no text layer)
- PDF is encrypted/password-protected
- File corrupted during upload

**Solution:**
- Use OCR for image-based PDFs (future enhancement)
- Reject encrypted PDFs at upload
- Validate file integrity before parsing

#### 3. High API Costs

**Symptoms:** Unexpected billing from Perplexity

**Investigation:**
```sql
SELECT
  DATE(created_at) as date,
  SUM(estimated_cost) as daily_cost,
  COUNT(*) as call_count
FROM api_usage_logs
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

**Solutions:**
- Check for retry loops
- Verify token counts are reasonable
- Add caching layer for common estimates

#### 4. Slow Response Times

**Symptoms:** Timeout errors, slow UI

**Investigation:**
- Check Perplexity API latency
- Monitor database query performance
- Review PDF file sizes

**Solutions:**
- Increase timeout values
- Add database indexes
- Limit PDF uploads to 10MB

## Testing

### Unit Tests

All services have comprehensive unit tests:

```bash
cd backend
go test ./internal/services/... -v
```

### Integration Tests

Phase 6 integration test covers full workflow:

```bash
go test ./internal/services/phase6_integration_test.go -v
```

### Manual Testing Checklist

- [ ] Contractor receives magic link email
- [ ] Scope sheet form loads and submits
- [ ] Property manager sees submitted scope
- [ ] Industry estimate generates successfully
- [ ] PDF uploads to Supabase storage
- [ ] PDF parsing extracts line items correctly
- [ ] Comparison identifies discrepancies
- [ ] Delta calculation is accurate
- [ ] Rebuttal letter is professional and complete
- [ ] Letter can be exported/printed
- [ ] API usage is logged correctly
- [ ] Error messages are clear and helpful

## Support and Maintenance

### Logs to Monitor

1. **Application Logs**
   - LLM API errors
   - PDF parsing failures
   - Authentication failures

2. **Database Logs**
   - Slow queries
   - Deadlocks
   - Connection pool exhaustion

3. **API Usage Logs**
   - Cost tracking
   - Token usage patterns
   - Error rates

### Backup Strategy

- **Database:** Daily automated backups
- **PDFs:** Redundancy via Supabase
- **Audit Reports:** Immutable once created

### Update Procedures

When updating LLM prompts or logic:

1. Test on staging environment
2. Compare results with production
3. Roll out to 10% of users first
4. Monitor error rates and costs
5. Full rollout if successful

## Future Enhancements

### Phase 6.1 (Planned)

- [ ] OCR for image-based PDFs
- [ ] Batch processing for multiple claims
- [ ] Email delivery of rebuttal letters
- [ ] PDF generation of rebuttals (not just text)
- [ ] Historical pricing database (reduce LLM calls)
- [ ] Advanced analytics dashboard

### Phase 6.2 (Wishlist)

- [ ] Multi-language support
- [ ] Integration with Xactimate
- [ ] Direct API to insurance carriers
- [ ] Machine learning for better parsing
- [ ] Mobile app for contractors

## Contact and Resources

- **Documentation:** `/docs/phase6/`
- **API Reference:** `API_REFERENCE_PHASE_6.md`
- **User Guide:** `USER_GUIDE_PHASE_6.md`
- **Implementation Plan:** `../plans/2026-02-06-ai-audit-system-implementation.md`

---

**Last Updated:** February 6, 2026
**Version:** 1.0.0
**Author:** ClaimCoach Development Team
