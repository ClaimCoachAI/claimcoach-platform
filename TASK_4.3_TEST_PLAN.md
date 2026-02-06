# Task 4.3: Contractor Upload Portal - Test Plan

## Overview
This document describes how to test the contractor upload portal functionality.

## Prerequisites
1. Backend server running on `http://localhost:8080`
2. Frontend dev server running on `http://localhost:5173`
3. Database with at least one claim
4. Supabase Storage configured

## Test Scenarios

### Scenario 1: Generate Magic Link (Property Manager)

**Steps:**
1. Login as property manager
2. Navigate to a claim detail page
3. Generate a magic link for a contractor
4. Copy the generated link URL

**Expected Result:**
- Magic link generated successfully
- Link format: `http://localhost:5173/upload/{token}`
- Token is UUID format
- Link expires in 72 hours

**API Call:**
```bash
curl -X POST http://localhost:8080/api/claims/{claim_id}/magic-link \
  -H "Authorization: Bearer {jwt_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "contractor_name": "John Smith",
    "contractor_email": "john@contractor.com",
    "contractor_phone": "555-0123"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "magic_link_id": "uuid",
    "token": "uuid",
    "link_url": "http://localhost:5173/upload/{token}",
    "contractor_name": "John Smith",
    "contractor_email": "john@contractor.com",
    "contractor_phone": "555-0123",
    "expires_at": "2026-02-08T...",
    "status": "active"
  }
}
```

---

### Scenario 2: Validate Token (Contractor)

**Steps:**
1. Open the magic link in a browser (or new incognito window)
2. Page should load and validate the token

**Expected Result:**
- Token validation happens automatically
- Claim details displayed (property address, loss type, incident date)
- Contractor name displayed in welcome message
- Upload interface visible

**API Call (Automatic):**
```bash
curl http://localhost:8080/api/magic-links/{token}/validate
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "valid": true,
    "magic_link_id": "uuid",
    "contractor_name": "John Smith",
    "expires_at": "2026-02-08T...",
    "status": "active",
    "claim": {
      "id": "uuid",
      "claim_number": "CLM-001",
      "loss_type": "water",
      "incident_date": "2026-01-15T00:00:00Z",
      "property": {
        "nickname": "Downtown Condo",
        "legal_address": "123 Main St, City, State 12345"
      }
    }
  }
}
```

---

### Scenario 3: Upload Photos

**Steps:**
1. Click "Tap to take photos or upload"
2. Select multiple image files (JPEG, PNG, HEIC)
3. Verify files appear in the list

**Expected Result:**
- File input accepts `image/*` types
- Multiple selection enabled
- Camera capture enabled (mobile devices)
- Selected photos displayed in list with file names
- Remove button visible for each photo

**File Validation:**
- Max size: 50MB per photo
- Allowed types: `image/jpeg`, `image/png`, `image/heic`

---

### Scenario 4: Upload Estimate

**Steps:**
1. Click "Tap to upload estimate (PDF)"
2. Select a PDF file
3. Verify file appears

**Expected Result:**
- File input accepts PDF only
- Single file selection
- Selected PDF displayed with file name
- Remove button visible

**File Validation:**
- Max size: 25MB
- Allowed type: `application/pdf`

---

### Scenario 5: Submit Files

**Steps:**
1. Upload at least one photo or estimate
2. Optionally add notes
3. Click "Submit Photos & Estimate"

**Expected Result:**
- Submit button disabled during upload
- Progress indicators visible for each file
- Files upload sequentially
- Success checkmarks appear when done
- Success screen displayed after all uploads complete

**API Calls (Automatic for each file):**

**Step 1: Request Upload URL**
```bash
curl -X POST http://localhost:8080/api/magic-links/{token}/documents/upload-url \
  -H "Content-Type: application/json" \
  -d '{
    "file_name": "photo1.jpg",
    "file_size": 1024000,
    "mime_type": "image/jpeg",
    "document_type": "contractor_photo"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "upload_url": "https://supabase.co/storage/...",
    "document_id": "uuid",
    "file_path": "org_id/claim_id/contractor_photo/photo1.jpg"
  }
}
```

**Step 2: Upload to Supabase (Automatic)**
```bash
curl -X PUT "{upload_url}" \
  -H "Content-Type: image/jpeg" \
  --data-binary @photo1.jpg
```

**Step 3: Confirm Upload**
```bash
curl -X POST http://localhost:8080/api/magic-links/{token}/documents/{document_id}/confirm
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "claim_id": "uuid",
    "uploaded_by_user_id": null,
    "document_type": "contractor_photo",
    "file_url": "org_id/claim_id/contractor_photo/photo1.jpg",
    "file_name": "photo1.jpg",
    "file_size_bytes": 1024000,
    "mime_type": "image/jpeg",
    "metadata": null,
    "status": "confirmed",
    "created_at": "2026-02-05T..."
  }
}
```

---

### Scenario 6: Success State

**Steps:**
1. After all files uploaded successfully
2. Verify success screen

**Expected Result:**
- Green checkmark icon displayed
- "Upload Complete!" heading
- Thank you message
- Confirmation that PM will review

---

### Scenario 7: Verify in Database (Property Manager)

**Steps:**
1. Login as property manager
2. Navigate to the claim
3. Check documents list

**Expected Result:**
- Uploaded photos visible with type "contractor_photo"
- Uploaded estimate visible with type "contractor_estimate"
- `uploaded_by_user_id` is NULL for contractor uploads
- Activity log shows "Contractor uploaded document" entries

**Database Query:**
```sql
SELECT id, claim_id, document_type, file_name, uploaded_by_user_id, status
FROM documents
WHERE claim_id = '{claim_id}'
  AND document_type IN ('contractor_photo', 'contractor_estimate')
ORDER BY created_at DESC;
```

**Expected Result:**
- Multiple rows with `document_type = 'contractor_photo'`
- One row with `document_type = 'contractor_estimate'`
- All rows have `uploaded_by_user_id = NULL`
- All rows have `status = 'confirmed'`

---

## Error Scenarios

### Scenario 8: Expired Token

**Steps:**
1. Use an expired token (> 72 hours old)
2. Open magic link

**Expected Result:**
- Error screen displayed
- Message: "This upload link has expired. Please contact your property manager for a new link."

### Scenario 9: Invalid Token

**Steps:**
1. Use an invalid/random token
2. Open magic link

**Expected Result:**
- Error screen displayed
- Message: "This upload link is invalid. Please check the link and try again."

### Scenario 10: File Too Large

**Steps:**
1. Attempt to upload a photo > 50MB
2. Click submit

**Expected Result:**
- Upload fails with error
- Error message: "File size exceeds maximum allowed"
- File marked with error indicator

### Scenario 11: Invalid File Type

**Steps:**
1. Attempt to upload a non-image file as photo
2. Click submit

**Expected Result:**
- Upload fails with error
- Error message: "File type not allowed for this document type"
- File marked with error indicator

---

## Mobile Testing

### iOS Safari
- Test camera capture functionality
- Test file selection from Photos app
- Test touch targets (minimum 44x44pt)
- Test fixed submit button on small screens

### Android Chrome
- Test camera capture functionality
- Test file selection from Gallery
- Test touch targets
- Test fixed submit button on small screens

---

## Accessibility Testing

- [ ] Keyboard navigation works
- [ ] Screen reader announces upload progress
- [ ] Focus indicators visible
- [ ] Error messages announced
- [ ] Color contrast meets WCAG AA standards

---

## Performance Testing

- [ ] Page loads in < 3 seconds
- [ ] Token validation completes in < 1 second
- [ ] File upload progress visible within 100ms
- [ ] Multiple files upload in parallel (if backend supports)

---

## Security Testing

### Authorization
- [ ] Cannot upload without valid token
- [ ] Expired tokens rejected
- [ ] Invalid tokens rejected
- [ ] Cannot access other claims' upload URLs

### File Validation
- [ ] File size limits enforced
- [ ] MIME type validation works
- [ ] Malicious file names handled safely
- [ ] SQL injection attempts in file names prevented

---

## Manual Test Checklist

### Backend
- [ ] Backend compiles without errors
- [ ] Magic link service includes storage client
- [ ] Public routes registered in router
- [ ] Document upload endpoints work without JWT auth
- [ ] Token validation works
- [ ] Upload URL generation works
- [ ] Upload confirmation works
- [ ] Documents saved with NULL uploaded_by_user_id

### Frontend
- [ ] Frontend builds without errors
- [ ] ContractorUpload page created
- [ ] Public route added to App.tsx
- [ ] Token extracted from URL params
- [ ] Token validation on page load
- [ ] Error states display correctly
- [ ] File selection works
- [ ] Upload progress indicators work
- [ ] Success state displays correctly
- [ ] Mobile-responsive design

### Integration
- [ ] End-to-end flow works: Generate link → Upload files → View in PM dashboard
- [ ] Activity logs created for contractor uploads
- [ ] Files accessible to PM after upload

---

## Automated Testing (Future)

### Unit Tests Needed
- `magic_link_service_test.go`
  - TestRequestUploadURLWithToken
  - TestConfirmUploadWithToken
  - TestRequestUploadURLWithExpiredToken
  - TestRequestUploadURLWithInvalidToken

- `magic_link_handler_test.go`
  - TestMagicLinkRequestUploadURL
  - TestMagicLinkConfirmUpload
  - TestMagicLinkHandleInvalidToken

### Integration Tests Needed
- Full upload flow test
- Token expiration test
- File validation test
- Concurrent uploads test

---

## Known Limitations

1. **No re-verification of uploaded files**: Due to Supabase Storage client limitations, we cannot re-verify the actual file size/MIME type after upload. Clients could potentially bypass validation.

2. **No notes storage**: The notes field is collected but not currently stored in the database. Future enhancement needed.

3. **No email notifications**: Currently no email sent to PM when contractor uploads complete (covered in Task 4.4).

4. **No parallel uploads**: Files uploaded sequentially, not in parallel.

---

## Success Criteria

- [x] Backend endpoints created and working
- [x] Frontend page created and working
- [x] Public route configured (no auth required)
- [x] Token validation working
- [x] File uploads working
- [x] Documents stored with NULL user_id
- [x] Mobile-responsive design
- [x] Error handling implemented
- [x] Success confirmation shown
- [ ] Manual end-to-end testing completed
- [ ] All test scenarios pass
