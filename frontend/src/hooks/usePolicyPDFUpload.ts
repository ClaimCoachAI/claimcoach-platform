import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'

interface RequestUploadResponse {
  upload_url: string
  file_path: string
}

export function usePolicyPDFUpload(propertyId: string) {
  const queryClient = useQueryClient()
  const [uploadProgress, setUploadProgress] = useState(0)

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      // Step 1: Request upload URL
      const requestResponse = await api.post<{ data: RequestUploadResponse }>(
        `/api/properties/${propertyId}/policy/pdf/upload-url`,
        {
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type,
        }
      )

      const { upload_url } = requestResponse.data.data

      // Step 2: Upload file to S3 using presigned URL
      await fetch(upload_url, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type,
        },
      })

      // Step 3: Confirm upload
      const confirmResponse = await api.post(
        `/api/properties/${propertyId}/policy/pdf/confirm`
      )

      return confirmResponse.data
    },
    onSuccess: () => {
      // Invalidate queries to refresh the policy data
      queryClient.invalidateQueries({ queryKey: ['policy', propertyId] })
      queryClient.invalidateQueries({ queryKey: ['property', propertyId] })
      setUploadProgress(0)
    },
    onError: () => {
      setUploadProgress(0)
    },
  })

  return {
    uploadPDF: uploadMutation.mutate,
    isUploading: uploadMutation.isPending,
    uploadError: uploadMutation.error,
    uploadProgress,
  }
}
