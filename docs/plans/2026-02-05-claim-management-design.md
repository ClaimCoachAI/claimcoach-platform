# ClaimCoach AI - Property Insurance Claim Management System
**Design Document**
**Date:** February 5, 2026
**Version:** 1.0 - MVP Design

---

## Table of Contents
1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Data Model](#data-model)
4. [Authentication & Authorization](#authentication--authorization)
5. [API Design](#api-design)
6. [Frontend Architecture](#frontend-architecture)
7. [Magic Link System](#magic-link-system)
8. [File Upload & Storage](#file-upload--storage)
9. [LLM Integration (AI Audit)](#llm-integration-ai-audit)
10. [Deployment Strategy](#deployment-strategy)
11. [Error Handling & Monitoring](#error-handling--monitoring)
12. [User Flow (7 Phases)](#user-flow-7-phases)

---

## Overview

**Product Vision:**
ClaimCoach AI helps property managers act as public adjusters for insurance claims across their property portfolio (single family, multifamily, commercial). The system streamlines the entire claim lifecycle from incident detection through financial recovery.

**Target Users:**
- Property Management Companies (primary customer)
- Property Managers (day-to-day users)
- Maintenance Coordinators (field operations)
- Contractors (via magic link, no login required)

**Key Differentiators:**
1. **Magic Link Contractor Access** - No-login photo/estimate uploads
2. **AI-Powered Audit** - LLM compares carrier estimates to industry pricing
3. **Deductible Comparison Gate** - Smart assessment before filing
4. **End-to-End Workflow** - From property setup to claim closure

---

## System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────┐
│  Frontend (Vercel)                                  │
│  - React + Vite + TypeScript + Tailwind            │
│  - Two experiences:                                 │
│    1. PM Dashboard (full app, auth required)       │
│    2. Contractor Portal (magic link, no auth)      │
└──────────────────┬──────────────────────────────────┘
                   │ HTTPS/REST API
                   ↓
┌─────────────────────────────────────────────────────┐
│  Backend (Go Service - Dockerized)                  │
│  - RESTful API layer                                │
│  - Business logic (deductible comparison, etc.)     │
│  - LLM integration for AI audit                     │
│  - Magic link token generation/validation           │
└──────────────────┬──────────────────────────────────┘
                   │
        ┌──────────┴──────────┐
        ↓                     ↓
┌──────────────────┐  ┌──────────────────────────────┐
│  PostgreSQL      │  │  Supabase Services           │
│  (Core Data)     │  │  - Auth (JWT)                │
│  - Organizations │  │  - Storage (Files/Photos)    │
│  - Properties    │  │  - Email (Magic links)       │
│  - Claims        │  │                              │
│  - Documents     │  │                              │
└──────────────────┘  └──────────────────────────────┘
```

### Technology Stack

**Frontend:**
- React 18 + Vite
- TypeScript
- Tailwind CSS
- TanStack Query (React Query) for server state
- Supabase client for auth
- Hosting: Vercel

**Backend:**
- Go 1.21+
- RESTful API architecture
- PostgreSQL database
- Docker containerization
- Standard Go project structure:
  - `cmd/` for application entry points
  - `internal/` for internal packages
  - `migrations/` for database migrations

**Database & Auth:**
- PostgreSQL (core data)
- Supabase for authentication (JWT)
- Database migrations managed in backend

**Storage:**
- Supabase Storage for all documents/photos

**Communications:**
- Supabase Email (MVP)
- SMS via Twilio (Phase 2)

**LLM:**
- Perplexity API (web-grounded for pricing)
- Alternative: OpenAI GPT-4o or Anthropic Claude

**Key Architectural Decisions:**
1. Clean separation: Frontend only talks to Go API
2. Supabase hybrid: Auth via Supabase, Go validates tokens
3. Stateless API: Go backend scales horizontally
4. File proxying: Go API controls all file access

---

## Data Model

### Core Entities

```sql
-- Multi-tenancy root
organizations
  - id (uuid, pk)
  - name (text) -- "ABC Property Management"
  - created_at, updated_at (timestamp)

users
  - id (uuid, pk) -- Supabase auth user ID
  - organization_id (uuid, fk)
  - email (text, unique)
  - name (text)
  - role (enum: 'admin', 'member') -- Simplified for MVP
  - created_at, updated_at (timestamp)

properties
  - id (uuid, pk)
  - organization_id (uuid, fk)
  - nickname (text) -- "Highland Apts"
  - legal_address (text)
  - lat, lng (decimal) -- For weather monitoring (Phase 2)
  - owner_entity_name (text)
  - mortgage_bank_id (uuid, fk, nullable)
  - status (enum: 'draft', 'active_monitored', 'archived')
  - created_at, updated_at (timestamp)

insurance_policies
  - id (uuid, pk)
  - property_id (uuid, fk)
  - carrier_name (text)
  - policy_number (text)
  - coverage_a_limit (decimal) -- Dwelling
  - coverage_b_limit (decimal) -- Other Structures
  - coverage_d_limit (decimal) -- Loss of Use
  - deductible_type (enum: 'percentage', 'fixed')
  - deductible_value (decimal)
  - deductible_calculated (decimal) -- Calculated dollar amount
  - policy_pdf_url (text) -- Supabase Storage path
  - effective_date (date)
  - expiration_date (date)
  - created_at, updated_at (timestamp)

claims
  - id (uuid, pk)
  - property_id (uuid, fk)
  - policy_id (uuid, fk)
  - claim_number (text, nullable) -- Carrier assigns after filing
  - loss_type (enum: 'fire', 'water', 'wind', 'hail', 'other')
  - incident_date (timestamp)
  - status (enum: 'draft', 'assessing', 'filed', 'field_scheduled',
            'audit_pending', 'negotiating', 'settled', 'closed')
  - filed_at (timestamp, nullable)
  - assigned_user_id (uuid, fk, nullable) -- For field meeting
  - adjuster_name (text, nullable)
  - adjuster_phone (text, nullable)
  - meeting_datetime (timestamp, nullable)
  - created_by_user_id (uuid, fk)
  - created_at, updated_at (timestamp)
```

### Supporting Tables

```sql
documents
  - id (uuid, pk)
  - claim_id (uuid, fk)
  - uploaded_by_user_id (uuid, fk, nullable) -- null if contractor upload
  - document_type (enum: 'policy_pdf', 'contractor_photo',
                        'contractor_estimate', 'carrier_estimate',
                        'proof_of_repair', 'other')
  - file_url (text) -- Supabase Storage path
  - file_name (text)
  - file_size_bytes (integer)
  - mime_type (text)
  - metadata (jsonb) -- geolocation, EXIF data, etc.
  - created_at (timestamp)

estimates
  - id (uuid, pk)
  - claim_id (uuid, fk)
  - estimate_type (enum: 'contractor_initial', 'industry_standard',
                        'carrier_acv', 'rebuttal')
  - source_name (text) -- "Bob's Roofing" or "Carrier Adjuster Name"
  - total_amount (decimal)
  - line_items (jsonb) -- Structured estimate data
  - document_id (uuid, fk, nullable) -- Link to PDF in documents table
  - created_at (timestamp)

magic_links
  - id (uuid, pk)
  - claim_id (uuid, fk)
  - token (text, unique, indexed) -- UUID v4
  - contractor_name (text)
  - contractor_email (text)
  - contractor_phone (text, nullable)
  - expires_at (timestamp) -- 72 hours default
  - accessed_at (timestamp, nullable)
  - access_count (integer, default 0)
  - status (enum: 'active', 'expired', 'completed')
  - created_at (timestamp)

claim_activities
  - id (uuid, pk)
  - claim_id (uuid, fk)
  - user_id (uuid, fk, nullable) -- null for system actions
  - activity_type (enum: 'status_change', 'document_upload',
                        'estimate_added', 'comment', 'assignment')
  - description (text) -- "Status changed from draft to assessing"
  - metadata (jsonb) -- Additional context
  - created_at (timestamp)

payments
  - id (uuid, pk)
  - claim_id (uuid, fk)
  - payment_type (enum: 'acv', 'rcv') -- Actual Cash Value or Recoverable Depreciation
  - amount (decimal)
  - check_number (text, nullable)
  - received_date (date)
  - notes (text, nullable)
  - created_at (timestamp)

mortgage_banks
  - id (uuid, pk)
  - name (text)
  - endorsement_required (boolean)
  - instruction_letter_template (text, nullable)
```

### Key Indexes

```sql
CREATE INDEX idx_magic_links_token ON magic_links(token);
CREATE INDEX idx_documents_claim_id ON documents(claim_id);
CREATE INDEX idx_claim_activities_claim_created ON claim_activities(claim_id, created_at DESC);
CREATE INDEX idx_claims_organization_status ON claims(property_id, status);
CREATE INDEX idx_properties_organization ON properties(organization_id);
```

---

## Authentication & Authorization

### Simplified Two-Role Model (MVP)

**Roles:**
- **Admin:** Everything + user management
- **Member:** Everything except user management

**Permission Matrix:**

| Action | Admin | Member |
|--------|-------|--------|
| Add/edit properties | ✅ | ✅ |
| Report incident | ✅ | ✅ |
| File claim | ✅ | ✅ |
| Generate magic link | ✅ | ✅ |
| Upload documents | ✅ | ✅ |
| View all org properties | ✅ | ✅ |
| Invite/remove users | ✅ | ❌ |

**Simplifications:**
- Everyone sees all properties in their organization
- No property-level or claim-level assignments
- Organization isolation enforced (companies cannot see each other's data)
- First user to create account = auto admin

### Authentication Flows

**Path 1: PM Users (Supabase Auth)**

```
1. User enters email/password in React app
2. Frontend: supabase.auth.signInWithPassword()
3. Supabase returns JWT (includes user_id)
4. Frontend stores JWT, includes in all API calls:
   Authorization: Bearer <jwt>
5. Go backend validates JWT via Supabase client
6. Go extracts user_id → queries users table → gets organization_id + role
7. Go enforces permissions based on role + organization
```

**Path 2: Contractors (Magic Link - No Auth)**

```
1. PM generates magic link → Go creates token in magic_links table
2. Contractor clicks: https://app.claimcoach.com/upload?token=abc123
3. Frontend calls: GET /api/magic-links/abc123/validate
4. Go checks: token exists, not expired, status = 'active'
5. Go returns: { claim_id, contractor_name, allowed_actions: ['upload'] }
6. Frontend shows limited upload-only UI
7. Uploads: POST /api/magic-links/abc123/documents
```

### Security Boundaries

**Contractor CAN:**
- View claim context (property address, incident type)
- Upload photos (max 50MB each, 20 photos)
- Upload estimate PDF (max 25MB)
- Add text notes
- Re-access link until expired

**Contractor CANNOT:**
- See other claims
- Delete uploads
- See carrier estimates
- Change claim status
- Generate new links

---

## API Design

### RESTful Endpoints (Go Backend)

```go
// Phase 1: Onboarding
POST   /api/properties                    // Create property
GET    /api/properties                    // List org's properties
GET    /api/properties/:id               // Get property details
PATCH  /api/properties/:id               // Update property
POST   /api/properties/:id/policy        // Add insurance policy (manual)
GET    /api/properties/:id/policy        // Get current policy

// Phase 2: Incident Detection
POST   /api/claims                        // Report incident
GET    /api/claims                        // List org's claims
GET    /api/claims/:id                   // Get claim details
PATCH  /api/claims/:id/status            // Update claim status

// Phase 3: Triage & Evidence
POST   /api/claims/:id/magic-link        // Generate contractor magic link
GET    /api/magic-links/:token/validate  // Validate token (no auth)
POST   /api/magic-links/:token/documents // Contractor upload (no auth)
POST   /api/claims/:id/estimates         // PM uploads contractor estimate
GET    /api/claims/:id/deductible-check  // Compare estimate vs deductible

// Phase 4: Field Logistics
PATCH  /api/claims/:id/field-meeting     // Schedule + assign rep

// Phase 5: Audit & Negotiation
POST   /api/claims/:id/audit              // Trigger AI audit
GET    /api/claims/:id/audit/report       // Get delta report
POST   /api/claims/:id/rebuttal           // Generate rebuttal template

// Phase 6: Financial Recovery
POST   /api/claims/:id/payments           // Log payment (ACV/RCV)
GET    /api/claims/:id/payments           // List payments
POST   /api/claims/:id/demand-letter      // Generate RCV demand

// Phase 7: Closure
POST   /api/claims/:id/close              // Close claim

// Supporting Routes
GET    /api/documents/:id                 // Get presigned URL
POST   /api/documents                     // Upload document
GET    /api/claims/:id/activities         // Get audit trail
POST   /api/users/invite                  // Invite user (admin only)
GET    /api/mortgage-banks                // List mortgage banks
```

### Standard Response Format

```json
{
  "success": true,
  "data": { ... },
  "error": null
}
```

---

## Frontend Architecture

### Route Structure (React Router)

```typescript
// PM Dashboard (Authenticated)
/                              → Redirect to /dashboard
/login                         → Login page
/dashboard                     → Claims list + quick stats
/properties                    → Property portfolio grid
/properties/new                → Add property form
/properties/:id                → Property detail + policy + claims
/claims/:id                    → Claim workspace (main UI)
/claims/:id/audit              → AI audit delta report
/settings                      → User management (admin only)

// Contractor Portal (No Auth)
/upload/:token                 → Magic link upload page (mobile-first)
```

### Key Pages

**1. Claim Workspace (`/claims/:id`) - Core Page**

```
ClaimWorkspace
├── ClaimHeader (status, property, dates)
├── PhaseProgress (visual stepper: Phase 1→7)
├── CurrentPhasePanel (dynamic based on claim.status)
│   ├── AssessingPanel (generate magic link, upload estimate)
│   ├── FiledPanel (schedule meeting, assign rep)
│   ├── AuditPanel (trigger AI audit, view delta)
│   └── PaymentsPanel (log checks, generate demand)
├── DocumentsTimeline (all uploads, chronological)
├── ActivityFeed (audit trail)
└── QuickActions (status changes, close claim)
```

**2. Contractor Upload (`/upload/:token`) - Mobile-First**

```
ContractorUpload
├── WelcomeHeader ("Hi Bob, thanks for helping...")
├── ClaimContext (property address, incident type)
├── PhotoUpload (drag/drop or camera, auto-geotag)
├── EstimateUpload (PDF upload)
├── NotesField (optional text area)
└── SubmitButton → Success confirmation
```

### State Management

**TanStack Query (React Query) for Server State:**

```typescript
// Example: Fetch claim
const { data: claim } = useQuery({
  queryKey: ['claims', claimId],
  queryFn: () => api.getClaim(claimId)
})

// Example: Update claim status
const updateStatus = useMutation({
  mutationFn: (status) => api.updateClaimStatus(claimId, status),
  onSuccess: () => queryClient.invalidateQueries(['claims', claimId])
})
```

**Why React Query:**
- Perfect for REST APIs (automatic caching, refetching)
- No Redux boilerplate
- Built-in loading/error states
- Optimistic updates for snappy UX

### Mobile-First Design

**Contractor Portal Requirements:**
- Responsive for mobile (primary device)
- Large touch targets
- Camera access via web APIs
- PWA capabilities (installable, offline-capable)
- No app store required

---

## Magic Link System

### Token Generation & Security

```go
// Backend: Generate magic link
func (s *ClaimService) GenerateMagicLink(claimID uuid.UUID, contractor Contractor) (*MagicLink, error) {
    token := uuid.New().String() // Cryptographically secure

    link := &MagicLink{
        ID:              uuid.New(),
        ClaimID:         claimID,
        Token:           token,
        ContractorName:  contractor.Name,
        ContractorEmail: contractor.Email,
        ExpiresAt:       time.Now().Add(72 * time.Hour), // 3 days
        Status:          "active",
    }

    db.Create(link)

    // Send email via Supabase
    emailService.Send(contractor.Email, EmailTemplate{
        Subject: "Upload photos for Highland Apts claim",
        Body: fmt.Sprintf(
            "Hi %s, please upload photos and estimate here: %s",
            contractor.Name,
            fmt.Sprintf("https://app.claimcoach.com/upload/%s", token),
        ),
    })

    return link, nil
}
```

### Edge Cases Handled

1. **Expired Link:** Show friendly error + PM contact info
2. **Multiple Uploads:** Allow (contractor might forget something)
3. **Lost Link:** PM can resend (new token, old invalidated)
4. **Accidental Upload:** PM can delete from dashboard
5. **No Internet in Field:** PWA caches page, uploads when online

### Access Tracking

```sql
UPDATE magic_links
SET access_count = access_count + 1,
    last_accessed_at = NOW()
WHERE token = $1
```

---

## File Upload & Storage

### Upload Flow

```typescript
// Frontend: Upload document
async function uploadDocument(file: File, claimId: string, type: DocumentType) {
  // Step 1: Request upload URL from backend
  const { uploadUrl, documentId } = await api.requestUpload({
    claimId,
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type,
    documentType: type
  })

  // Step 2: Upload directly to Supabase Storage
  await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type }
  })

  // Step 3: Confirm upload
  await api.confirmUpload(documentId)

  return documentId
}
```

### Storage Structure (Supabase Storage)

```
bucket: claim-documents/
  └── organizations/
      └── {org-id}/
          └── claims/
              └── {claim-id}/
                  ├── policies/
                  ├── contractor-photos/
                  ├── contractor-estimates/
                  ├── carrier-estimates/
                  └── proof-of-repairs/
```

### File Validation Rules

```go
var fileValidation = map[string]FileRule{
    "contractor_photo": {
        MaxSize:   50 * 1024 * 1024, // 50MB
        MimeTypes: []string{"image/jpeg", "image/png", "image/heic"},
    },
    "policy_pdf": {
        MaxSize:   25 * 1024 * 1024, // 25MB
        MimeTypes: []string{"application/pdf"},
    },
    "contractor_estimate": {
        MaxSize:   25 * 1024 * 1024,
        MimeTypes: []string{"application/pdf"},
    },
}
```

### Access Control

All downloads go through Go API:

```go
GET /api/documents/:id

func (s *DocumentService) GetDocument(docID, userID uuid.UUID) (string, error) {
    // Verify user has access to this document's claim
    if !s.userHasAccessToClaim(userID, doc.ClaimID) {
        return "", ErrUnauthorized
    }

    // Generate short-lived presigned download URL (5 min)
    downloadURL := supabase.Storage.CreateSignedURL(doc.FileURL, 5*time.Minute)

    return downloadURL, nil
}
```

---

## LLM Integration (AI Audit)

### Proven Approach (Validated with ChatGPT)

**User's Tested Prompt:**
> "Based on the scope sheet and current industry pricing can you produce a scope of repair estimate to include the cost of repair. Now produce this in an Xactimate style format which shows line items."

This approach generates accurate estimates with current regional pricing via web search.

### Simplified Flow

```
Contractor Scope/Photos → LLM with Web Search → "Correct" Xactimate-style Estimate
                                                            ↓
Carrier Estimate PDF → Parse with LLM →          Compare Line Items
                                                            ↓
                                                   Generate Delta Report
```

**Key Insight:** Compare LLM-generated industry standard vs carrier offer (not contractor vs carrier).

### Implementation

**Step 1: Generate Industry Standard Estimate**

```go
func (s *AuditService) GenerateIndustryEstimate(claim *Claim) (*Estimate, error) {
    scope := s.getContractorScope(claim.ID)

    prompt := `Based on the scope sheet and current industry pricing, produce a scope of repair estimate to include the cost of repair.

PROPERTY LOCATION: %s
SCOPE OF WORK:
%s

Now produce this in an Xactimate style format which shows line items with:
- Description
- Quantity
- Unit
- Unit Price (current market rate for this location)
- Total

Include proper Overhead & Profit (10-20%% is standard).

Return as JSON:
{
  "line_items": [...],
  "subtotal": 0,
  "overhead_and_profit": 0,
  "total": 0
}`

    // Use Perplexity API (web-grounded) or OpenAI with browsing
    response := callLLMWithWebSearch(
        fmt.Sprintf(prompt, claim.Property.Address, scope),
        JSONMode,
    )

    return parseEstimate(response)
}
```

**Step 2: Parse Carrier Estimate**

```go
func (s *AuditService) ParseCarrierEstimate(pdfURL string) (*Estimate, error) {
    content := extractPDFContent(pdfURL)

    prompt := `Extract line items from this carrier estimate PDF into Xactimate-style JSON...`

    return parseEstimate(callLLM(prompt, JSONMode))
}
```

**Step 3: Compare & Generate Delta Report**

```go
func (s *AuditService) GenerateAuditReport(claimID uuid.UUID) (*AuditReport, error) {
    correctEstimate := s.GenerateIndustryEstimate(claim)
    carrierEstimate := s.ParseCarrierEstimate(claim.CarrierEstimatePDF)

    prompt := `Compare these estimates. The "INDUSTRY STANDARD" is what the repair should cost based on current pricing. The "CARRIER OFFER" is what they're offering.

INDUSTRY STANDARD (Xactimate-style, current pricing):
%s

CARRIER OFFER:
%s

Identify discrepancies:
1. Missing line items
2. Underpriced items (>15%% variance)
3. Missing/insufficient Overhead & Profit

Return JSON with structured delta report.`

    return callLLM(fmt.Sprintf(prompt, correctJSON, carrierJSON), JSONMode)
}
```

### LLM Provider Options

| Provider | Web Search | Cost | Notes |
|----------|-----------|------|-------|
| **Perplexity API** | ✅ Built-in | $5/1M tokens | Recommended for MVP |
| **OpenAI GPT-4o** | ✅ (Enterprise) | Higher tier | User's tested method |
| **Anthropic Claude + Brave** | ✅ (tool use) | $3/1M + search | Alternative |

**Cost Estimation (MVP):**
- 2 PDF parses per claim: ~$0.10
- 1 comparison: ~$0.05
- Total per audit: ~$0.15

---

## Deployment Strategy

### Production Architecture

```
┌─────────────────────────────────────────────────────┐
│  Vercel (Frontend)                                  │
│  - Auto-deploy from git main branch                │
│  - Global CDN                                       │
└──────────────────┬──────────────────────────────────┘
                   │ HTTPS
                   ↓
┌─────────────────────────────────────────────────────┐
│  Railway.app (Go Backend)                           │
│  - Docker deployment                                │
│  - Auto-deploy from git                             │
│  - Built-in PostgreSQL                              │
└──────────────────┬──────────────────────────────────┘
                   │
        ┌──────────┴──────────┐
        ↓                     ↓
┌──────────────────┐  ┌──────────────────────────────┐
│  PostgreSQL      │  │  Supabase (Managed)          │
│  (Railway)       │  │  - Auth                      │
│                  │  │  - Storage                   │
│                  │  │  - Email                     │
└──────────────────┘  └──────────────────────────────┘
```

### Go Backend Dockerfile

```dockerfile
# Multi-stage build for small image
FROM golang:1.21-alpine AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /server cmd/server/main.go

# Minimal runtime image
FROM alpine:latest
RUN apk --no-cache add ca-certificates
WORKDIR /root/
COPY --from=builder /server ./
COPY migrations ./migrations

EXPOSE 8080
CMD ["./server"]
```

### Environment Variables

**Backend (.env):**
```bash
DATABASE_URL=postgresql://...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=xxx
SUPABASE_JWT_SECRET=xxx
PERPLEXITY_API_KEY=xxx
ALLOWED_ORIGINS=https://app.claimcoach.com
PORT=8080
```

**Frontend (.env):**
```bash
VITE_API_URL=https://api.claimcoach.com
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxx
```

### Deployment Flow

```
1. Push code to GitHub
2. Vercel auto-deploys frontend
3. Railway auto-deploys Go backend
4. Database migrations run on startup
5. Done
```

### Database Migrations

```bash
# Use golang-migrate
# migrations/001_initial_schema.up.sql

# Run on startup
migrate -path ./migrations -database $DATABASE_URL up
```

---

## Error Handling & Monitoring

### Backend Error Handling

```go
// Standard error response
type ErrorResponse struct {
    Success bool   `json:"success"`
    Error   string `json:"error"`
    Code    string `json:"code"`
}

// Common errors
var (
    ErrUnauthorized      = AppError{Code: "UNAUTHORIZED", Status: 401}
    ErrClaimNotFound     = AppError{Code: "CLAIM_NOT_FOUND", Status: 404}
    ErrDeductibleNotSet  = AppError{Code: "DEDUCTIBLE_NOT_SET", Status: 400}
    ErrFileTooLarge      = AppError{Code: "FILE_TOO_LARGE", Status: 413}
    ErrMagicLinkExpired  = AppError{Code: "MAGIC_LINK_EXPIRED", Status: 410}
)
```

### Frontend Error Handling

```typescript
function ClaimWorkspace() {
  const { data: claim, error } = useQuery({
    queryKey: ['claims', claimId],
    queryFn: () => api.getClaim(claimId),
    retry: (failureCount, error) => {
      if (error.code === 'CLAIM_NOT_FOUND') return false
      return failureCount < 3
    }
  })

  if (error) return <ErrorState error={error} />
}
```

### Critical Edge Cases

| Scenario | Solution |
|----------|----------|
| User uploads wrong file | Allow PM to delete from documents list |
| Magic link expired | Show error + PM contact button |
| Contractor loses link | PM can resend (new token) |
| Estimate below deductible | Show warning, allow override |
| LLM API down | Queue audit, retry with backoff |
| Multiple PMs editing claim | Optimistic locking (check updated_at) |
| Non-standard carrier format | LLM fails gracefully, allow manual entry |
| File upload interrupted | Auto-retry with backoff |

### Logging Strategy

```go
// Structured logging with slog
logger.Info("Claim created",
    "claim_id", claimID,
    "organization_id", orgID,
    "user_id", userID,
)

logger.Error("LLM audit failed",
    "claim_id", claimID,
    "error", err,
)
```

### Monitoring (MVP)

**Key Metrics:**
- API response times (p50, p95, p99)
- Error rates by endpoint
- LLM API success rate
- File upload success rate
- Magic link access rate

**Alerting:**
- API down > 2 minutes
- Error rate > 5%
- LLM failures > 20%
- Database connection errors

---

## User Flow (7 Phases)

### Phase 1: Onboarding (Setup)

**Goal:** Establish the "Digital Twin" of the asset and its insurance rules.

**Step 1: Property Ingestion**
- PM inputs: Nickname, Address, Owner Entity, Mortgage Bank
- System geocodes address for future weather monitoring
- System flags if mortgage endorsement workflow required

**Step 2: Policy Ingestion**
- PM manually enters policy data (OCR in future phase)
- Required: Policy Limits (Cov A/B/D), Deductible, Carrier
- PM confirms values via modal
- Property status: Draft → Active_Monitored

### Phase 2: Incident Detection (Trigger)

**Goal:** Detect loss event and determine filing strategy.

**Step 3: Trigger Event**
- Path A (Passive): Weather alert (Phase 2 feature - coming soon)
- Path B (Active): PM manually reports incident

**Step 4: Strategy Fork**
- Option A: "File Immediately" (catastrophic loss) → Triggers filing
- Option B: "Assess First" (uncertain damage) → Go to Phase 3

### Phase 3: Triage & Evidence (Assessment Loop)

**Goal:** Validate claim value before alerting carrier.

**Step 5: Contractor Dispatch**
- PM selects vendor from list
- System generates time-sensitive magic link
- Sends via email to contractor

**Step 6: Field Data Capture (Mobile Web)**
- Contractor accesses magic link (no login)
- Uploads photos (auto-geotagged)
- Uploads estimate PDF or scope notes

**Step 7: Pricing Decision Gate**
- PM uploads/reviews contractor estimate
- System compares Total vs Deductible
- If Estimate < Deductible: "Below Deductible Alert" → Close file
- If Estimate > Deductible: "Valid Claim Alert" → Proceed to file

### Phase 4: Field Logistics

**Goal:** Ensure representation during carrier inspection.

**Step 8: Adjuster Scheduling**
- PM inputs meeting date/time from carrier

**Step 9: Attendee Assignment**
- PM assigns representative (self, maintenance, contractor)
- System sends calendar invite with claim details + photos

### Phase 5: Audit & Negotiation

**Goal:** Analyze carrier offer and generate rebuttal.

**Step 10: Offer Ingestion**
- PM uploads carrier's Statement of Loss (PDF)

**Step 11: AI Audit**
- System generates "correct" estimate using LLM + web pricing
- Compares carrier offer to industry standard
- Outputs delta report: missing items, underpriced items, O&P issues

**Step 12: Escalation Logic**
- Path A (Minor Delta): Generate rebuttal email template
- Path B (Major Delta/Denial):
  - Request owner approval (PDF summary + e-signature)
  - Escalate to legal partner (package full claim file)

### Phase 6: Financial Recovery

**Goal:** Track payments and resolve mortgage endorsements.

**Step 13: Check 1 (ACV) Processing**
- PM logs receipt of Actual Cash Value check
- If mortgage bank exists: Trigger endorsement workflow

**Step 14: Repair Verification**
- PM uploads proof of repairs (invoice + photos)

**Step 15: Depreciation Release (RCV)**
- System generates RCV demand letter
- Attaches proof of repairs
- PM sends to carrier

**Step 16: Check 2 (RCV) Processing**
- PM logs receipt of Recoverable Depreciation check

### Phase 7: Closure

**Goal:** Archive claim with full audit trail.

**Step 17: Archive & Analytics**
- System verifies total payments = settlement amount
- PM marks claim status: Closed
- Record locked and archived for audit history

---

## MVP Scope Summary

### Included in MVP
✅ Full 7-phase workflow (manual weather monitoring)
✅ Property & policy management
✅ Incident reporting (manual only)
✅ Magic link contractor access (email only)
✅ File upload & storage (Supabase)
✅ Deductible comparison gate
✅ AI-powered audit (LLM + web search)
✅ Payment tracking
✅ Two-role auth (Admin/Member)
✅ Mobile-first contractor portal
✅ Audit trail for all actions

### Phase 2 Features
🔜 Weather-based incident alerts (API integration)
🔜 SMS for magic links (Twilio)
🔜 OCR for policy extraction
🔜 Pricing database (built from collected estimates)
🔜 Advanced role permissions
🔜 Multi-property bulk operations

---

## Next Steps

1. **Review & Validate:** Confirm design with stakeholders
2. **Set Up Development:** Initialize git worktrees for isolated development
3. **Create Implementation Plan:** Break down into tasks with dependencies
4. **Begin Development:** Start with Phase 1 (Onboarding)

---

**Document Version:** 1.0
**Last Updated:** February 5, 2026
**Status:** Ready for Implementation
