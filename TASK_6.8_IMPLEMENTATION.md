# Task 6.8: Carrier Estimate Upload Implementation

## Summary

Successfully implemented carrier estimate upload functionality for both backend and frontend following the Phase 4 document upload patterns.

## Backend Implementation

### 1. Service Layer (`carrier_estimate_service.go`)

Created `CarrierEstimateService` with the following methods:

- **`RequestUploadURL()`**: Generates presigned upload URL for carrier estimate PDFs
  - Validates PDF-only, max 10MB
  - Verifies claim ownership through organization
  - Creates pending carrier estimate record
  - Returns presigned URL and estimate ID

- **`ConfirmUpload()`**: Confirms successful upload
  - Verifies claim ownership
  - Returns carrier estimate record

- **`GetCarrierEstimatesByClaimID()`**: Lists all carrier estimates for a claim
  - Includes organization verification
  - Returns estimates ordered by upload date (newest first)

- **`CreateCarrierEstimate()`**: Creates new carrier estimate record
  - Sets parse_status = "pending"
  - Records file metadata

### 2. Handler Layer (`carrier_estimate_handler.go`)

Created `CarrierEstimateHandler` with endpoints:

- **POST `/api/claims/:id/carrier-estimate/upload-url`**: Request presigned URL
- **POST `/api/claims/:id/carrier-estimate/:estimateId/confirm`**: Confirm upload
- **GET `/api/claims/:id/carrier-estimate`**: List carrier estimates

All endpoints include:
- Authentication required
- Organization ownership validation
- Proper error handling

### 3. Router Configuration (`router.go`)

Registered carrier estimate routes in protected API group:
```go
carrierEstimateService := services.NewCarrierEstimateService(db, storageClient, claimService)
carrierEstimateHandler := handlers.NewCarrierEstimateHandler(carrierEstimateService)

api.POST("/claims/:id/carrier-estimate/upload-url", carrierEstimateHandler.RequestUploadURL)
api.POST("/claims/:id/carrier-estimate/:estimateId/confirm", carrierEstimateHandler.ConfirmUpload)
api.GET("/claims/:id/carrier-estimate", carrierEstimateHandler.ListCarrierEstimates)
```

### 4. Tests (`carrier_estimate_service_test.go`)

Implemented unit tests using sqlmock:
- `TestCarrierEstimateService_CreateCarrierEstimate`: Validates creation
- `TestCarrierEstimateService_GetCarrierEstimatesByClaimID`: Validates listing with org verification

All tests passing ✅

## Frontend Implementation

### 1. API Layer (`lib/api.ts`)

Added two functions:

- **`uploadCarrierEstimate(claimId, file)`**: 3-step upload process
  1. Request presigned URL from backend
  2. Upload file directly to Supabase Storage
  3. Confirm upload with backend

- **`getCarrierEstimates(claimId)`**: Fetch carrier estimates list

### 2. UI Component (`ClaimDetail.tsx`)

Created `CarrierEstimateUpload` component:

**Features:**
- File input with PDF validation
- Max 10MB size validation
- Upload button with progress indicator
- List of uploaded estimates with:
  - File name
  - File size
  - Parse status badge (pending/processing/completed/failed)
  - Upload timestamp
- Empty state with helpful message

**Visibility:**
- Only shown in `audit_pending` and `negotiating` claim statuses
- Located after Documents section, before Deductible Analysis

### 3. TypeScript Interface

```typescript
interface CarrierEstimate {
  id: string
  claim_id: string
  uploaded_by_user_id: string
  file_path: string
  file_name: string
  file_size_bytes: number | null
  parsed_data: string | null
  parse_status: 'pending' | 'processing' | 'completed' | 'failed'
  parse_error: string | null
  uploaded_at: string
  parsed_at: string | null
}
```

## Key Design Decisions

### 1. 3-Step Upload Pattern
Following existing document upload pattern for consistency:
- Step 1: Request presigned URL (backend validates and creates record)
- Step 2: Client uploads directly to Supabase Storage
- Step 3: Client confirms upload (backend marks as complete)

### 2. Security
- Organization ownership verified at every endpoint
- Claim ownership verified through property → organization chain
- File validation: PDF only, max 10MB
- Authentication required for all operations

### 3. Parse Status Flow
- Upload sets `parse_status = "pending"`
- Task 6.9 will implement PDF parsing service
- Status progression: pending → processing → completed/failed

### 4. Storage Path
Follows existing pattern:
```
organizations/{org-id}/claims/{claim-id}/carrier-estimate/{filename}
```

## Files Modified/Created

### Backend
- ✅ Created: `backend/internal/services/carrier_estimate_service.go`
- ✅ Created: `backend/internal/services/carrier_estimate_service_test.go`
- ✅ Created: `backend/internal/handlers/carrier_estimate_handler.go`
- ✅ Modified: `backend/internal/api/router.go`

### Frontend
- ✅ Modified: `frontend/src/lib/api.ts`
- ✅ Modified: `frontend/src/pages/ClaimDetail.tsx`

## Testing

### Backend
```bash
cd backend
go test ./internal/services -run TestCarrierEstimateService -v
```
Output: All tests passing ✅

### Frontend
```bash
cd frontend
npm run build
```
Output: Build successful ✅

## API Endpoints

### 1. Request Upload URL
```
POST /api/claims/:id/carrier-estimate/upload-url
Headers: Authorization: Bearer <token>
Body: {
  "file_name": "estimate.pdf",
  "file_size": 1024000,
  "mime_type": "application/pdf"
}
Response: {
  "success": true,
  "data": {
    "upload_url": "https://...",
    "estimate_id": "uuid",
    "file_path": "organizations/.../claims/.../carrier-estimate/..."
  }
}
```

### 2. Confirm Upload
```
POST /api/claims/:id/carrier-estimate/:estimateId/confirm
Headers: Authorization: Bearer <token>
Response: {
  "success": true,
  "data": {
    "id": "uuid",
    "claim_id": "uuid",
    "file_name": "estimate.pdf",
    "parse_status": "pending",
    ...
  }
}
```

### 3. List Carrier Estimates
```
GET /api/claims/:id/carrier-estimate
Headers: Authorization: Bearer <token>
Response: {
  "success": true,
  "data": [
    {
      "id": "uuid",
      "claim_id": "uuid",
      "file_name": "estimate.pdf",
      "parse_status": "pending",
      ...
    }
  ]
}
```

## Next Steps (Task 6.9)

The carrier estimates are now uploaded and stored with `parse_status = "pending"`. Task 6.9 will:
1. Implement PDF parsing service to extract line items
2. Update `parse_status` to "processing" → "completed"
3. Store parsed data in `parsed_data` JSONB field
4. Handle parsing errors by setting `parse_status = "failed"`

## Dependencies

- Uses existing Supabase Storage client
- Uses existing ClaimService for ownership verification
- Follows existing document upload pattern
- Ready for Task 6.9 PDF parsing integration
