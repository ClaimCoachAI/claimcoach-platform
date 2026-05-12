# Photo Delete Feature — Design Spec

**Date:** 2026-05-12
**Status:** Approved

---

## Overview

Allow users to delete uploaded photos from the Photos tab of a claim. A trash icon appears on thumbnail hover; clicking it shows an inline confirmation UI directly on the card before the deletion is committed.

---

## Backend

### New endpoint

`DELETE /api/claims/:id/media/:photoId`

**Handler logic (`ClaimMediaHandler.DeletePhoto`):**
1. Extract `claimId` and `photoId` from URL params
2. Verify the claim exists and belongs to the user's org (via `claimService.GetClaim`)
3. Query `claim_photos` for the row: `SELECT id, file_path FROM claim_photos WHERE id = $1 AND claim_id = $2`
4. If not found → 404
5. Call `h.storage.DeleteFile(filePath)` to remove from Supabase storage
6. `DELETE FROM claim_photos WHERE id = $1`
7. Return `200 { success: true }`

**Error handling:**
- If storage delete fails, return 500 and do NOT delete the DB row (keeps storage and DB consistent)
- If DB delete fails after storage delete, log the orphaned file path (storage is gone, DB row lingers — acceptable; row has no file behind it)

### Modified endpoint

`GET /api/claims/:id/media` — add `id` field to each `mediaItem` response:
```json
{ "id": "uuid", "url": "...", "caption": "..." }
```

### Route registration

```go
api.DELETE("/claims/:id/media/:photoId", claimMediaHandler.DeletePhoto)
```

---

## Frontend

### API function (`frontend/src/lib/api.ts`)

```ts
export async function deleteClaimPhoto(claimId: string, photoId: string): Promise<void> {
  await api.delete(`/api/claims/${claimId}/media/${photoId}`)
}
```

### State additions (`ClaimPhotoGallery.tsx`)

- `confirmDeleteId: string | null` — id of the photo currently showing confirm UI (null = none)

### Mutation

```ts
const deleteMutation = useMutation({
  mutationFn: ({ photoId }: { photoId: string }) => deleteClaimPhoto(claimId, photoId),
  onSuccess: () => {
    setConfirmDeleteId(null)
    queryClient.invalidateQueries({ queryKey: ['claim-media', claimId] })
  },
  onError: () => setConfirmDeleteId(null),
})
```

### Thumbnail render logic

Each photo card in the grid has two states based on `confirmDeleteId`:

**Normal state (confirmDeleteId !== photo.id):**
- Existing hover overlay shows a trash icon button instead of the zoom icon
- Clicking card body → opens lightbox (existing behavior)
- Clicking trash icon → `setConfirmDeleteId(photo.id)`, stop propagation

**Confirm state (confirmDeleteId === photo.id):**
- Card shows "Delete photo?" label with Cancel and Delete buttons
- Card click does nothing (no lightbox)
- Cancel → `setConfirmDeleteId(null)`
- Delete → `deleteMutation.mutate({ photoId: photo.id })`
- Delete button shows a spinner while `deleteMutation.isPending`

### MediaItem type update

Add `id: string` to the `MediaItem` interface in `api.ts`.

---

## Data Flow

```
User hovers thumbnail
  → trash icon appears (CSS hover)
  → clicks trash
    → setConfirmDeleteId(photo.id)
    → card shows "Delete photo?" + Cancel/Delete

User clicks Delete
  → DELETE /api/claims/:id/media/:photoId
    → storage.DeleteFile(filePath)
    → DELETE FROM claim_photos WHERE id = $1
  → invalidate ['claim-media', claimId]
  → photo disappears from grid

User clicks Cancel
  → setConfirmDeleteId(null)
  → card returns to normal
```

---

## Error Handling

- Storage delete fails → 500, DB row preserved, user sees error (future: surface in UI)
- DB delete fails after storage delete → orphaned DB row (acceptable edge case; row has no backing file)
- Photo not found → 404, no-op on frontend (query refetch clears stale state)

---

## Out of Scope

- Bulk delete
- Undo / soft delete
- Delete from lightbox view
