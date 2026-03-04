import { useState, useCallback } from 'react'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8080'

export interface PhotoUploadResult {
  documentId: string
}

export function usePhotoUpload(token: string) {
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const uploadPhoto = useCallback(async (file: File): Promise<PhotoUploadResult | null> => {
    setUploading(true)
    setUploadError(null)
    try {
      // Step 1: Request presigned upload URL
      const urlRes = await axios.post<{
        success: boolean
        data: { upload_url: string; document_id: string }
      }>(`${API}/api/magic-links/${token}/documents/upload-url`, {
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type,
        document_type: 'contractor_photo',
      })
      const { upload_url, document_id } = urlRes.data.data

      // Step 2: PUT file directly to storage (presigned URL — no auth header)
      await axios.put(upload_url, file, {
        headers: { 'Content-Type': file.type },
        // Must not send Authorization header to presigned URL
        transformRequest: [(data) => data],
      })

      // Step 3: Confirm the upload
      await axios.post(`${API}/api/magic-links/${token}/documents/${document_id}/confirm`)

      return { documentId: document_id }
    } catch (e: unknown) {
      const msg =
        e instanceof Error
          ? e.message
          : (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Upload failed'
      setUploadError(msg)
      return null
    } finally {
      setUploading(false)
    }
  }, [token])

  const clearUploadError = useCallback(() => setUploadError(null), [])

  return { uploadPhoto, uploading, uploadError, clearUploadError }
}
