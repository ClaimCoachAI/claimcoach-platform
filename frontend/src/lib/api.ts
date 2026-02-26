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
export const generateIndustryEstimate = async (claimId: string) => {
  const response = await api.post(`/api/claims/${claimId}/audit/generate`)
  return response.data.data
}

export const analyzeClaimViability = async (claimId: string) => {
  const response = await api.post(`/api/claims/${claimId}/audit/viability`)
  return response.data.data
}

export const getAuditReport = async (claimId: string) => {
  const response = await api.get(`/api/claims/${claimId}/audit`)
  return response.data.data
}

export const runPMBrainAnalysis = async (claimId: string, auditId: string) => {
  const response = await api.post(`/api/claims/${claimId}/audit/${auditId}/pm-brain`)
  return response.data.data
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
  const response = await api.get(`/api/claims/${claimId}/legal-package/download`, {
    responseType: 'blob',
  })

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

export default api
