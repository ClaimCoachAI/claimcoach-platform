import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'
import { ContractorWizard } from '../components/contractor-wizard'
import type { Claim } from '../types/claim'

interface ValidationResult {
  valid: boolean
  reason?: string
  magic_link_id?: string
  claim?: Claim
  contractor_name?: string
  expires_at?: string
  status?: string
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080'

export default function ContractorUpload() {
  const { token } = useParams<{ token: string }>()
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Validate token on mount
  useEffect(() => {
    const validateToken = async () => {
      try {
        const response = await axios.get(`${API_URL}/api/magic-links/${token}/validate`)
        const result = response.data.data

        if (!result.valid) {
          setError(getErrorMessage(result.reason))
        } else {
          setValidationResult(result)
        }
      } catch (err) {
        console.error('Token validation error:', err)
        setError('Failed to validate upload link. Please contact your property manager.')
      } finally {
        setLoading(false)
      }
    }

    if (token) {
      validateToken()
    }
  }, [token])

  const getErrorMessage = (reason?: string) => {
    switch (reason) {
      case 'expired':
        return 'This upload link has expired. Please contact your property manager for a new link.'
      case 'not_found':
        return 'This upload link is invalid. Please check the link and try again.'
      case 'completed':
        return 'This upload link has already been used.'
      default:
        return 'This upload link is no longer valid. Please contact your property manager.'
    }
  }

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Validating upload link...</p>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-6 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Link Expired or Invalid</h2>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    )
  }

  // Main wizard interface
  if (!validationResult || !token) {
    return null
  }

  return <ContractorWizard token={token} validationResult={validationResult} />
}
