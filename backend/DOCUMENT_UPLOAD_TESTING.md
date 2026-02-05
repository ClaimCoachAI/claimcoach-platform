# Document Upload API Testing Guide

## Overview

This guide provides instructions for testing the document upload/download functionality using the 3-step upload flow.

## Prerequisites

1. Backend server running on `http://localhost:8080`
2. Valid JWT token from Supabase authentication
3. Existing claim ID (from creating a claim first)
4. Supabase Storage bucket `claim-documents` created and configured

## Setup Supabase Storage

Before testing, ensure the `claim-documents` bucket exists in Supabase:

1. Go to Supabase Dashboard → Storage
2. Create bucket named `claim-documents`
3. Set bucket to private (requires authentication)
4. Configure bucket policies as needed

## API Endpoints

### 1. Request Upload URL

**Endpoint:** `POST /api/claims/:id/documents/upload-url`

**Description:** Generates a presigned upload URL and creates a pending document record.

**Headers:**
```
Authorization: Bearer <your-jwt-token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "file_name": "damage-photo.jpg",
  "file_size": 1048576,
  "mime_type": "image/jpeg",
  "document_type": "contractor_photo"
}
```

**Valid Document Types:**
- `policy_pdf` - Policy documents (PDF, max 25MB)
- `contractor_photo` - Photos from contractor (JPEG/PNG/HEIC, max 50MB)
- `contractor_estimate` - Contractor estimates (PDF, max 25MB)
- `carrier_estimate` - Insurance carrier estimates (PDF, max 25MB)
- `proof_of_repair` - Proof of repair documents (JPEG/PNG/HEIC/PDF, max 50MB)
- `other` - Other documents (JPEG/PNG/HEIC/PDF, max 25MB)

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "upload_url": "https://xxx.supabase.co/storage/v1/upload/sign/claim-documents/...",
    "document_id": "uuid-of-document",
    "file_path": "organizations/org-id/claims/claim-id/contractor_photo/damage-photo_abcd1234.jpg"
  }
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:8080/api/claims/CLAIM_ID/documents/upload-url \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "file_name": "damage-photo.jpg",
    "file_size": 1048576,
    "mime_type": "image/jpeg",
    "document_type": "contractor_photo"
  }'
```

### 2. Upload File to Supabase

**Endpoint:** Use the `upload_url` from Step 1

**Description:** Upload the actual file directly to Supabase Storage.

**Headers:**
```
Content-Type: <file's mime type>
```

**Request Body:** Raw file binary data

**cURL Example:**
```bash
curl -X PUT "<upload_url_from_step_1>" \
  -H "Content-Type: image/jpeg" \
  --data-binary @/path/to/damage-photo.jpg
```

### 3. Confirm Upload

**Endpoint:** `POST /api/claims/:id/documents/:documentId/confirm`

**Description:** Confirms the upload and logs the activity.

**Headers:**
```
Authorization: Bearer <your-jwt-token>
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "document-uuid",
    "claim_id": "claim-uuid",
    "uploaded_by_user_id": "user-uuid",
    "document_type": "contractor_photo",
    "file_url": "organizations/org-id/claims/claim-id/contractor_photo/damage-photo_abcd1234.jpg",
    "file_name": "damage-photo.jpg",
    "file_size_bytes": 1048576,
    "mime_type": "image/jpeg",
    "status": "confirmed",
    "created_at": "2024-02-05T12:00:00Z"
  }
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:8080/api/claims/CLAIM_ID/documents/DOCUMENT_ID/confirm \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 4. List Documents

**Endpoint:** `GET /api/claims/:id/documents`

**Description:** Lists all confirmed documents for a claim.

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": "document-uuid",
      "claim_id": "claim-uuid",
      "document_type": "contractor_photo",
      "file_name": "damage-photo.jpg",
      "file_size_bytes": 1048576,
      "mime_type": "image/jpeg",
      "status": "confirmed",
      "created_at": "2024-02-05T12:00:00Z"
    }
  ]
}
```

**cURL Example:**
```bash
curl -X GET http://localhost:8080/api/claims/CLAIM_ID/documents \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 5. Get Document with Download URL

**Endpoint:** `GET /api/documents/:id`

**Description:** Retrieves document metadata and generates a presigned download URL (5 min expiry).

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "document": {
      "id": "document-uuid",
      "claim_id": "claim-uuid",
      "document_type": "contractor_photo",
      "file_name": "damage-photo.jpg",
      "file_size_bytes": 1048576,
      "mime_type": "image/jpeg",
      "status": "confirmed",
      "created_at": "2024-02-05T12:00:00Z"
    },
    "download_url": "https://xxx.supabase.co/storage/v1/object/sign/claim-documents/..."
  }
}
```

**cURL Example:**
```bash
curl -X GET http://localhost:8080/api/documents/DOCUMENT_ID \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Error Codes

### 400 Bad Request
- Invalid document type
- File size exceeds maximum allowed
- Invalid MIME type for document type
- Missing required fields

### 401 Unauthorized
- Missing or invalid JWT token

### 404 Not Found
- Claim not found
- Document not found
- User doesn't have access to the claim

### 500 Internal Server Error
- Database error
- Supabase Storage error

## Testing Checklist

- [ ] Request upload URL for valid document type
- [ ] Upload file to Supabase using presigned URL
- [ ] Confirm upload successfully
- [ ] Verify document appears in list
- [ ] Get document and download using presigned URL
- [ ] Test file size validation (try uploading file > 50MB)
- [ ] Test MIME type validation (try uploading wrong file type)
- [ ] Test invalid document type
- [ ] Test access control (try accessing another org's documents)
- [ ] Verify activity log created on upload
- [ ] Test with different document types

## Storage Path Structure

Files are stored in Supabase Storage with the following structure:

```
bucket: claim-documents
path: organizations/{org-id}/claims/{claim-id}/{document-type}/{filename}
```

Example:
```
claim-documents/
  organizations/
    550e8400-e29b-41d4-a716-446655440000/
      claims/
        650e8400-e29b-41d4-a716-446655440001/
          contractor_photo/
            damage-photo_abcd1234.jpg
          contractor_estimate/
            estimate_xyz789.pdf
```

## Security Limitations

### File Metadata Verification

**Known Limitation:** The actual uploaded file size and MIME type are NOT re-verified after upload to Supabase Storage. This is due to limitations in the Supabase Storage Go client library, which doesn't provide metadata retrieval functionality.

**What This Means:**
- A user could declare a 1MB file but upload a 100MB file
- A user could declare `image/jpeg` but upload a PDF
- The system will accept the upload as long as Supabase Storage policies allow it

**Mitigations in Place:**
1. **Client-side validation** - First line of defense before upload
2. **Supabase Storage bucket policies** - Can enforce maximum file sizes at the storage layer
3. **Activity logging** - Provides audit trail of all uploads
4. **Pending documents cleanup** - Abandoned uploads older than 24 hours are automatically removed

**Future Improvements:**
- When Supabase Storage Go client adds metadata retrieval, verification can be added to the ConfirmUpload endpoint

### Abandoned Document Cleanup

The system automatically cleans up pending documents that are older than 24 hours during upload URL requests. This prevents database bloat from incomplete uploads.

## Notes

- Upload URLs expire after 60 minutes
- Download URLs expire after 5 minutes
- Files are uniquely named to prevent collisions (UUID suffix added)
- Files without extensions are handled gracefully with "file" as the base name
- Only confirmed documents are returned in list/get operations
- Document uploads are logged in claim_activities table
- Organization ownership is verified through claim → property → organization chain
- Pending documents older than 24 hours are automatically cleaned up
