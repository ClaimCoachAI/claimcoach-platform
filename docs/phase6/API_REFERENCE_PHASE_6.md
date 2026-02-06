# Phase 6 API Reference

Complete API documentation for the AI Audit System.

## Table of Contents

- [Authentication](#authentication)
- [Contractor Endpoints](#contractor-endpoints)
- [Scope Sheet Endpoints](#scope-sheet-endpoints)
- [Carrier Estimate Endpoints](#carrier-estimate-endpoints)
- [Audit Report Endpoints](#audit-report-endpoints)
- [Rebuttal Endpoints](#rebuttal-endpoints)
- [Error Codes](#error-codes)
- [Rate Limits](#rate-limits)

## Authentication

### Contractor Endpoints

Contractor endpoints use magic link tokens for authentication. No JWT required.

```http
POST /api/magic-links/:token/scope-sheet
```

**Token Format:** UUID v4 (e.g., `550e8400-e29b-41d4-a716-446655440000`)

**Token Expiration:** 7 days from creation

### Property Manager Endpoints

All property manager endpoints require JWT authentication.

```http
Authorization: Bearer {jwt_token}
```

**Token Acquisition:** Via login endpoint (Phase 2)

**Token Expiration:** 24 hours

---

## Contractor Endpoints

### Submit Scope Sheet

Submits a completed scope sheet via magic link.

**Endpoint:** `POST /api/magic-links/:token/scope-sheet`

**Authentication:** Magic link token

**Request Body:**

```json
{
  "roof_type": "asphalt_shingles",
  "roof_square_footage": 2000,
  "roof_pitch": "6/12",
  "fascia_lf": 150,
  "fascia_paint": true,
  "soffit_lf": 100,
  "soffit_paint": false,
  "drip_edge_lf": 180,
  "drip_edge_paint": false,
  "pipe_jacks_count": 4,
  "pipe_jacks_paint": false,
  "ex_vents_count": 2,
  "ex_vents_paint": true,
  "turbines_count": 1,
  "turbines_paint": false,
  "furnaces_count": 0,
  "power_vents_count": 0,
  "ridge_lf": 80,
  "satellites_count": 1,
  "step_flashing_lf": 40,
  "chimney_flashing": true,
  "rain_diverter_lf": 0,
  "skylights_count": 2,
  "skylights_damaged": true,

  "roof_other_type": null,
  "roof_other_pitch": null,

  "porch_paint": false,
  "patio_paint": true,
  "fence": "Wood fence, 6ft tall, 100 LF damaged",

  "front_siding_1_replace_sf": 200,
  "front_siding_1_paint_sf": 0,
  "front_gutters_lf": 40,
  "front_gutters_paint": false,
  "front_windows": "3 windows damaged",
  "front_screens": "2 screens torn",
  "front_doors": null,
  "front_ac_replace": false,
  "front_ac_comb_fins": true,

  "notes": "Significant hail damage on north-facing roof slope. Multiple shingles completely missing."
}
```

**Field Reference:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `roof_type` | string | No | Type of roofing material |
| `roof_square_footage` | integer | No | Total roof area in SF |
| `roof_pitch` | string | No | Roof pitch (e.g., "6/12") |
| `fascia_lf` | integer | No | Fascia linear feet |
| `fascia_paint` | boolean | Yes | Whether fascia needs painting |
| `soffit_lf` | integer | No | Soffit linear feet |
| `soffit_paint` | boolean | Yes | Whether soffit needs painting |
| `notes` | string | No | Additional notes (max 5000 chars) |

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "scope_sheet": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "claim_id": "660e8400-e29b-41d4-a716-446655440001",
      "roof_type": "asphalt_shingles",
      "roof_square_footage": 2000,
      "submitted_at": "2026-02-06T10:30:00Z",
      "created_at": "2026-02-06T10:30:00Z",
      "updated_at": "2026-02-06T10:30:00Z"
    }
  }
}
```

**Error Responses:**

```json
// 400 Bad Request - Invalid token
{
  "success": false,
  "error": "Invalid or expired magic link token"
}

// 400 Bad Request - Validation error
{
  "success": false,
  "error": "roof_square_footage must be a positive integer"
}

// 409 Conflict - Already submitted
{
  "success": false,
  "error": "Scope sheet already submitted for this claim"
}

// 500 Internal Server Error
{
  "success": false,
  "error": "Failed to save scope sheet"
}
```

---

## Scope Sheet Endpoints

### Get Scope Sheet by Claim ID

Retrieves the scope sheet for a specific claim.

**Endpoint:** `GET /api/claims/:id/scope-sheet`

**Authentication:** JWT required

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | UUID | Claim ID |

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "scope_sheet": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "claim_id": "660e8400-e29b-41d4-a716-446655440001",
      "roof_type": "asphalt_shingles",
      "roof_square_footage": 2000,
      "roof_pitch": "6/12",
      "fascia_lf": 150,
      "fascia_paint": true,
      "notes": "Hail damage noted",
      "submitted_at": "2026-02-06T10:30:00Z",
      "created_at": "2026-02-06T10:30:00Z",
      "updated_at": "2026-02-06T10:30:00Z"
    }
  }
}
```

**Error Responses:**

```json
// 401 Unauthorized
{
  "success": false,
  "error": "Authentication required"
}

// 403 Forbidden
{
  "success": false,
  "error": "Unauthorized access to this claim"
}

// 404 Not Found
{
  "success": false,
  "error": "Scope sheet not found for this claim"
}
```

---

## Carrier Estimate Endpoints

### Upload Carrier Estimate

Uploads a carrier estimate PDF file.

**Endpoint:** `POST /api/claims/:id/carrier-estimate`

**Authentication:** JWT required

**Content-Type:** `multipart/form-data`

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | UUID | Claim ID |

**Form Data:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | File | Yes | PDF file (max 10MB) |

**Request Example:**

```http
POST /api/claims/660e8400-e29b-41d4-a716-446655440001/carrier-estimate
Authorization: Bearer {jwt_token}
Content-Type: multipart/form-data

------WebKitFormBoundary7MA4YWxkTrZu0gW
Content-Disposition: form-data; name="file"; filename="carrier_estimate.pdf"
Content-Type: application/pdf

[PDF binary data]
------WebKitFormBoundary7MA4YWxkTrZu0gW--
```

**Response (201 Created):**

```json
{
  "success": true,
  "data": {
    "carrier_estimate": {
      "id": "770e8400-e29b-41d4-a716-446655440002",
      "claim_id": "660e8400-e29b-41d4-a716-446655440001",
      "file_name": "carrier_estimate.pdf",
      "file_size_bytes": 524288,
      "parse_status": "pending",
      "uploaded_at": "2026-02-06T11:00:00Z"
    }
  }
}
```

**Error Responses:**

```json
// 400 Bad Request - File too large
{
  "success": false,
  "error": "File size exceeds 10MB limit"
}

// 400 Bad Request - Invalid file type
{
  "success": false,
  "error": "Only PDF files are accepted"
}

// 401 Unauthorized
{
  "success": false,
  "error": "Authentication required"
}

// 403 Forbidden
{
  "success": false,
  "error": "Unauthorized access to this claim"
}

// 500 Internal Server Error
{
  "success": false,
  "error": "Failed to upload file to storage"
}
```

### Get Carrier Estimates

Retrieves all carrier estimates for a claim.

**Endpoint:** `GET /api/claims/:id/carrier-estimates`

**Authentication:** JWT required

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | UUID | Claim ID |

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "carrier_estimates": [
      {
        "id": "770e8400-e29b-41d4-a716-446655440002",
        "claim_id": "660e8400-e29b-41d4-a716-446655440001",
        "file_name": "carrier_estimate_v2.pdf",
        "file_size_bytes": 524288,
        "parse_status": "completed",
        "uploaded_at": "2026-02-06T11:30:00Z",
        "parsed_at": "2026-02-06T11:32:00Z"
      },
      {
        "id": "770e8400-e29b-41d4-a716-446655440003",
        "claim_id": "660e8400-e29b-41d4-a716-446655440001",
        "file_name": "carrier_estimate_v1.pdf",
        "file_size_bytes": 612352,
        "parse_status": "completed",
        "uploaded_at": "2026-02-06T11:00:00Z",
        "parsed_at": "2026-02-06T11:02:30Z"
      }
    ]
  }
}
```

### Parse Carrier Estimate

Triggers parsing of an uploaded PDF.

**Endpoint:** `POST /api/carrier-estimates/:id/parse`

**Authentication:** JWT required

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | UUID | Carrier Estimate ID |

**Response (202 Accepted):**

```json
{
  "success": true,
  "data": {
    "status": "processing",
    "message": "PDF parsing started"
  }
}
```

**Error Responses:**

```json
// 400 Bad Request - Already parsed
{
  "success": false,
  "error": "Carrier estimate already parsed"
}

// 404 Not Found
{
  "success": false,
  "error": "Carrier estimate not found"
}

// 500 Internal Server Error
{
  "success": false,
  "error": "Failed to download PDF from storage"
}
```

### Get Parsed Data

Retrieves the parsed line items from a carrier estimate.

**Endpoint:** `GET /api/carrier-estimates/:id/parsed-data`

**Authentication:** JWT required

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "parsed_data": {
      "line_items": [
        {
          "description": "Remove existing shingles",
          "quantity": 2000,
          "unit": "SF",
          "unit_cost": 2.50,
          "total": 5000.00,
          "category": "Roofing"
        },
        {
          "description": "Install new asphalt shingles",
          "quantity": 2000,
          "unit": "SF",
          "unit_cost": 3.50,
          "total": 7000.00,
          "category": "Roofing"
        }
      ],
      "total": 14650.00
    }
  }
}
```

---

## Audit Report Endpoints

### Generate Industry Estimate

Generates an industry-standard estimate using AI.

**Endpoint:** `POST /api/claims/:id/audit/generate-estimate`

**Authentication:** JWT required

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | UUID | Claim ID |

**Response (201 Created):**

```json
{
  "success": true,
  "data": {
    "report_id": "880e8400-e29b-41d4-a716-446655440004",
    "status": "completed",
    "estimate": {
      "line_items": [
        {
          "description": "Remove existing asphalt shingles",
          "quantity": 2000,
          "unit": "SF",
          "unit_cost": 2.50,
          "total": 5000.00,
          "category": "Roofing"
        },
        {
          "description": "Install new asphalt shingles",
          "quantity": 2000,
          "unit": "SF",
          "unit_cost": 4.50,
          "total": 9000.00,
          "category": "Roofing"
        },
        {
          "description": "Paint fascia",
          "quantity": 150,
          "unit": "LF",
          "unit_cost": 3.00,
          "total": 450.00,
          "category": "Exterior Trim"
        }
      ],
      "subtotal": 14450.00,
      "overhead_profit": 2890.00,
      "total": 17340.00
    }
  }
}
```

**Error Responses:**

```json
// 400 Bad Request - No scope sheet
{
  "success": false,
  "error": "Scope sheet not found for this claim"
}

// 409 Conflict - Already generated
{
  "success": false,
  "error": "Industry estimate already generated for this claim"
}

// 500 Internal Server Error - LLM error
{
  "success": false,
  "error": "Failed to generate estimate: LLM API error"
}
```

### Compare Estimates

Compares industry estimate with carrier estimate.

**Endpoint:** `POST /api/audit-reports/:id/compare`

**Authentication:** JWT required

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | UUID | Audit Report ID |

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "comparison": {
      "discrepancies": [
        {
          "item": "Install new asphalt shingles",
          "industry_price": 9000.00,
          "carrier_price": 7000.00,
          "delta": 2000.00,
          "justification": "Carrier used outdated pricing. Current market rate for architectural shingles in Austin is $4.50/SF installed."
        },
        {
          "item": "Paint fascia",
          "industry_price": 450.00,
          "carrier_price": 300.00,
          "delta": 150.00,
          "justification": "Carrier underestimated labor. Standard rate for exterior trim painting is $3.00/LF."
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

**Error Responses:**

```json
// 400 Bad Request - No carrier estimate
{
  "success": false,
  "error": "Carrier estimate not parsed yet"
}

// 404 Not Found
{
  "success": false,
  "error": "Audit report not found"
}
```

### Get Audit Report

Retrieves a complete audit report.

**Endpoint:** `GET /api/claims/:id/audit-report`

**Authentication:** JWT required

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "audit_report": {
      "id": "880e8400-e29b-41d4-a716-446655440004",
      "claim_id": "660e8400-e29b-41d4-a716-446655440001",
      "scope_sheet_id": "550e8400-e29b-41d4-a716-446655440000",
      "carrier_estimate_id": "770e8400-e29b-41d4-a716-446655440002",
      "status": "completed",
      "generated_estimate": {
        "line_items": [...],
        "total": 17340.00
      },
      "comparison_data": {
        "discrepancies": [...],
        "summary": {...}
      },
      "total_contractor_estimate": 17340.00,
      "total_carrier_estimate": 14650.00,
      "total_delta": 2690.00,
      "created_at": "2026-02-06T12:00:00Z",
      "updated_at": "2026-02-06T12:05:00Z"
    }
  }
}
```

---

## Rebuttal Endpoints

### Generate Rebuttal Letter

Generates a professional rebuttal letter.

**Endpoint:** `POST /api/audit-reports/:id/generate-rebuttal`

**Authentication:** JWT required

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | UUID | Audit Report ID |

**Response (201 Created):**

```json
{
  "success": true,
  "data": {
    "rebuttal_id": "990e8400-e29b-41d4-a716-446655440005",
    "content": "Date: February 6, 2026\n\nTo: Insurance Adjuster\nRe: Claim Review Request - Claim Number ABC123\n\nDear Adjuster,\n\nI am writing to request a reconsideration of the carrier estimate provided for the property damage claim at 123 Test St...\n\n[Full letter content]"
  }
}
```

**Error Responses:**

```json
// 400 Bad Request - No comparison data
{
  "success": false,
  "error": "Comparison data not available. Please compare estimates first."
}

// 409 Conflict - Already generated
{
  "success": false,
  "error": "Rebuttal already generated for this audit report"
}
```

### Get Rebuttal

Retrieves a generated rebuttal letter.

**Endpoint:** `GET /api/rebuttals/:id`

**Authentication:** JWT required

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | UUID | Rebuttal ID |

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "rebuttal": {
      "id": "990e8400-e29b-41d4-a716-446655440005",
      "audit_report_id": "880e8400-e29b-41d4-a716-446655440004",
      "content": "[Full letter content]",
      "created_at": "2026-02-06T12:30:00Z",
      "updated_at": "2026-02-06T12:30:00Z"
    }
  }
}
```

---

## Error Codes

Standard HTTP status codes and error responses.

| Status Code | Meaning | Common Scenarios |
|-------------|---------|------------------|
| 200 | OK | Successful GET request |
| 201 | Created | Successful POST (resource created) |
| 202 | Accepted | Request accepted, processing async |
| 400 | Bad Request | Validation error, missing fields |
| 401 | Unauthorized | Missing/invalid JWT token |
| 403 | Forbidden | User lacks permission |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Resource already exists |
| 413 | Payload Too Large | File size exceeds limit |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server-side error |
| 503 | Service Unavailable | External API down |

### Error Response Format

All errors follow this format:

```json
{
  "success": false,
  "error": "Human-readable error message",
  "code": "ERROR_CODE",
  "details": {
    "field": "Additional context"
  }
}
```

---

## Rate Limits

### Contractor Endpoints

- **Magic Link:** 10 requests/minute per IP
- **Scope Sheet Submission:** 5 submissions/hour per token

### Property Manager Endpoints

- **File Upload:** 5 uploads/minute per user
- **LLM Operations:** 20 requests/minute per organization
- **GET Requests:** 100 requests/minute per user

### Rate Limit Headers

```http
X-RateLimit-Limit: 20
X-RateLimit-Remaining: 15
X-RateLimit-Reset: 1709734800
```

### Rate Limit Exceeded Response

```http
HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 20
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1709734860

{
  "success": false,
  "error": "Rate limit exceeded. Please wait 60 seconds.",
  "code": "RATE_LIMIT_EXCEEDED"
}
```

---

## Webhooks (Future Enhancement)

Planned webhook support for async operations:

- `scope_sheet.submitted`
- `carrier_estimate.parsed`
- `audit_report.completed`
- `rebuttal.generated`

---

**Last Updated:** February 6, 2026
**API Version:** 1.0.0
