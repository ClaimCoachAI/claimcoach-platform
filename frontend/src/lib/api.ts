import axios from 'axios'
import { supabase } from './supabase'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8080',
})

// Add auth token to every request
api.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession()

  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`
  }

  return config
})

// Handle 401 errors by redirecting to login
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await supabase.auth.signOut()
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

// Deductible comparison
export const updateClaimEstimate = async (claimId: string, estimateTotal: number) => {
  return api.patch(`/api/claims/${claimId}/estimate`, {
    contractor_estimate_total: estimateTotal
  })
}

// Scope sheet submission (via magic link - no auth required)
export const submitScopeSheet = async (token: string, scopeData: any) => {
  return axios.post(`${import.meta.env.VITE_API_URL || 'http://localhost:8080'}/api/magic-links/${token}/scope-sheet`, scopeData)
}

// Carrier Estimate Upload (3-step process)
export const uploadCarrierEstimate = async (claimId: string, file: File) => {
  // Step 1: Request presigned upload URL
  const uploadUrlResponse = await api.post(`/api/claims/${claimId}/carrier-estimate/upload-url`, {
    file_name: file.name,
    file_size: file.size,
    mime_type: file.type,
  })

  const { upload_url, estimate_id } = uploadUrlResponse.data.data

  // Step 2: Upload file directly to Supabase Storage
  const uploadResponse = await fetch(upload_url, {
    method: 'PUT',
    body: file,
    headers: {
      'Content-Type': file.type,
    },
  })

  if (!uploadResponse.ok) {
    throw new Error('Failed to upload file to storage')
  }

  // Step 3: Confirm upload with backend
  const confirmResponse = await api.post(
    `/api/claims/${claimId}/carrier-estimate/${estimate_id}/confirm`
  )

  return confirmResponse.data.data
}

// List carrier estimates for a claim
export const getCarrierEstimates = async (claimId: string) => {
  const response = await api.get(`/api/claims/${claimId}/carrier-estimate`)
  return response.data.data
}

// Audit API methods

// generateIndustryEstimate submits an async estimate job and polls until it completes.
// Returns the same shape as before: { audit_report_id, audit_report, status }
export const generateIndustryEstimate = async (claimId: string) => {
  // Start the job — returns { job_id, status: "processing" } immediately
  const startResponse = await api.post(`/api/claims/${claimId}/audit/generate`)
  const { job_id } = startResponse.data.data

  // Poll every 3 seconds until the job completes or fails (max 3 minutes)
  const maxAttempts = 60
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise(r => setTimeout(r, 3000))
    const statusResponse = await api.get(`/api/claims/${claimId}/audit/status/${job_id}`)
    const result = statusResponse.data.data

    if (result.status === 'completed') {
      return { audit_report_id: result.audit_report_id, audit_report: result.audit_report, status: result.status }
    }
    if (result.status === 'failed') {
      throw new Error(result.error || 'Estimate generation failed. Please try again.')
    }
    // still processing — continue polling
  }

  throw new Error('Estimate generation timed out. Please try again.')
}

export const analyzeClaimViability = async (claimId: string) => {
  const response = await api.post(`/api/claims/${claimId}/audit/viability`)
  return response.data.data
}

export const getAuditReport = async (claimId: string) => {
  const response = await api.get(`/api/claims/${claimId}/audit`)
  return response.data.data
}

// runPMBrainAnalysis submits an async PM Brain job and polls until it completes.
// Mirrors the generateIndustryEstimate pattern to avoid the 29s API Gateway timeout.
export const runPMBrainAnalysis = async (claimId: string, auditId: string) => {
  // Submit the job — returns { job_id, status: "processing" } immediately
  await api.post(`/api/claims/${claimId}/audit/${auditId}/pm-brain`)

  // Poll every 3 seconds until completed or failed (max 3 minutes)
  const maxAttempts = 60
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise(r => setTimeout(r, 3000))
    const statusResponse = await api.get(`/api/claims/${claimId}/audit/status/${auditId}`)
    const result = statusResponse.data.data

    if (result.status === 'completed' && result.audit_report?.pm_brain_analysis) {
      return JSON.parse(result.audit_report.pm_brain_analysis)
    }
    if (result.status === 'failed') {
      throw new Error(result.error || 'PM Brain analysis failed. Please try again.')
    }
    // still processing — continue polling
  }

  throw new Error('Analysis timed out. Please try again.')
}

export const generateDisputeLetter = async (claimId: string, auditId: string) => {
  const response = await api.post(`/api/claims/${claimId}/audit/${auditId}/dispute-letter`)
  return response.data.data.letter as string
}

// Parse carrier estimate after upload
export const parseCarrierEstimate = async (claimId: string, estimateId: string) => {
  const response = await api.post(`/api/claims/${claimId}/carrier-estimate/${estimateId}/parse`)
  return response.data
}

export const generateOwnerPitch = async (claimId: string, auditId: string) => {
  const response = await api.post(`/api/claims/${claimId}/audit/${auditId}/owner-pitch`)
  return response.data.data.pitch as string
}

export const downloadLegalPackage = async (claimId: string): Promise<void> => {
  let response
  try {
    response = await api.get(`/api/claims/${claimId}/legal-package/download`, {
      responseType: 'blob',
    })
  } catch (err: any) {
    // When responseType is 'blob', error response bodies are Blobs not parsed JSON.
    // Convert the blob to text so we can surface the real error message.
    if (err?.response?.data instanceof Blob) {
      const text = await err.response.data.text()
      try {
        const parsed = JSON.parse(text)
        throw Object.assign(new Error(parsed.error || text), { response: { data: parsed } })
      } catch {
        throw new Error(text || err.message)
      }
    }
    throw err
  }

  const contentDisposition = response.headers['content-disposition'] as string | undefined
  let filename = `ClaimCoach-Legal-Package-${claimId}.zip`
  if (contentDisposition) {
    const match = contentDisposition.match(/filename="?([^"]+)"?/)
    if (match?.[1]) filename = match[1]
  }

  const url = URL.createObjectURL(new Blob([response.data], { type: 'application/zip' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export const updateClaimStep = async (claimId: string, data: {
  current_step: number
  steps_completed: number[]
}) => {
  const response = await api.patch(`/api/claims/${claimId}/step`, data)
  return response.data
}

export interface MediaItem {
  id: string
  url: string
  caption: string
}

export async function getClaimMedia(claimId: string): Promise<MediaItem[]> {
  const response = await api.get(`/api/claims/${claimId}/media`)
  return response.data.data
}

export async function uploadClaimPhoto(claimId: string, file: File): Promise<void> {
  // Step 1: Get presigned upload URL + pre-inserted photo_id
  const urlResponse = await api.post(`/api/claims/${claimId}/media/upload-url`, {
    file_name: file.name,
    file_size: file.size,
    mime_type: file.type,
  })
  const { upload_url, photo_id } = urlResponse.data.data

  // Step 2: PUT file directly to Supabase storage
  const putResponse = await fetch(upload_url, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  })
  if (!putResponse.ok) {
    throw new Error('Failed to upload photo to storage')
  }

  // Step 3: Confirm upload (sets caption = file name by default)
  await api.post(`/api/claims/${claimId}/media`, { photo_id, caption: '' })
}

export async function deleteClaimPhoto(claimId: string, photoId: string): Promise<void> {
  await api.delete(`/api/claims/${claimId}/media/${photoId}`)
}

// Contractor estimate API (Step 2 — PDF upload flow)

export const uploadContractorEstimate = async (claimId: string, file: File) => {
  // Step 1: Request presigned upload URL
  const uploadUrlResponse = await api.post(
    `/api/claims/${claimId}/contractor-estimate/upload-url`,
    { file_name: file.name, file_size: file.size, mime_type: 'application/pdf' }
  )
  const { upload_url, estimate_id } = uploadUrlResponse.data.data

  // Step 2: PUT file directly to Supabase storage
  const putResponse = await fetch(upload_url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/pdf' },
    body: file,
  })
  if (!putResponse.ok) {
    throw new Error('Failed to upload file to storage')
  }

  // Step 3: Confirm upload
  await api.post(`/api/claims/${claimId}/contractor-estimate/${estimate_id}/confirm`)

  return { estimate_id }
}

export const parseContractorEstimate = async (claimId: string, estimateId: string) => {
  const response = await api.post(
    `/api/claims/${claimId}/contractor-estimate/${estimateId}/parse`
  )
  return response.data.data // ContractorEstimateParsedData
}

export const getContractorEstimate = async (claimId: string) => {
  const response = await api.get(`/api/claims/${claimId}/contractor-estimate`)
  return response.data.data // ContractorEstimate | null
}

export default api
