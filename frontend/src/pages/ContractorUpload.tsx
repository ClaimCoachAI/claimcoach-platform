import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'

interface ValidationResult {
  valid: boolean
  reason?: string
  magic_link_id?: string
  claim?: {
    id: string
    claim_number?: string
    loss_type: string
    incident_date: string
    property: {
      nickname: string
      legal_address: string
    }
  }
  contractor_name?: string
  expires_at?: string
  status?: string
}

interface UploadedFile {
  file: File
  documentId?: string
  uploading: boolean
  uploaded: boolean
  error?: string
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080'

export default function ContractorUpload() {
  const { token } = useParams<{ token: string }>()
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Upload state
  const [photos, setPhotos] = useState<UploadedFile[]>([])
  const [estimate, setEstimate] = useState<UploadedFile | null>(null)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

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

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return

    const newFiles = Array.from(e.target.files).map(file => ({
      file,
      uploading: false,
      uploaded: false,
    }))

    setPhotos(prev => [...prev, ...newFiles])
  }

  const handleEstimateSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return

    setEstimate({
      file: e.target.files[0],
      uploading: false,
      uploaded: false,
    })
  }

  const removePhoto = (index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index))
  }

  const removeEstimate = () => {
    setEstimate(null)
  }

  const uploadFile = async (file: File, documentType: string): Promise<string> => {
    // Step 1: Request upload URL
    const uploadUrlResponse = await axios.post(
      `${API_URL}/api/magic-links/${token}/documents/upload-url`,
      {
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type,
        document_type: documentType,
      }
    )

    const { upload_url, document_id } = uploadUrlResponse.data.data

    // Step 2: Upload file to Supabase Storage
    await axios.put(upload_url, file, {
      headers: {
        'Content-Type': file.type,
      },
    })

    // Step 3: Confirm upload
    await axios.post(
      `${API_URL}/api/magic-links/${token}/documents/${document_id}/confirm`
    )

    return document_id
  }

  const handleSubmit = async () => {
    if (photos.length === 0 && !estimate) {
      alert('Please upload at least one photo or an estimate.')
      return
    }

    setSubmitting(true)

    try {
      // Upload photos
      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i]
        setPhotos(prev => {
          const updated = [...prev]
          updated[i] = { ...updated[i], uploading: true }
          return updated
        })

        try {
          const documentId = await uploadFile(photo.file, 'contractor_photo')
          setPhotos(prev => {
            const updated = [...prev]
            updated[i] = { ...updated[i], uploading: false, uploaded: true, documentId }
            return updated
          })
        } catch (err) {
          console.error('Photo upload error:', err)
          setPhotos(prev => {
            const updated = [...prev]
            updated[i] = {
              ...updated[i],
              uploading: false,
              error: 'Upload failed. Please try again.'
            }
            return updated
          })
          throw err
        }
      }

      // Upload estimate
      if (estimate) {
        setEstimate(prev => prev ? { ...prev, uploading: true } : null)

        try {
          const documentId = await uploadFile(estimate.file, 'contractor_estimate')
          setEstimate(prev => prev ? { ...prev, uploading: false, uploaded: true, documentId } : null)
        } catch (err) {
          console.error('Estimate upload error:', err)
          setEstimate(prev => prev ? {
            ...prev,
            uploading: false,
            error: 'Upload failed. Please try again.'
          } : null)
          throw err
        }
      }

      // Success!
      setSubmitted(true)
    } catch (err) {
      console.error('Upload error:', err)
      alert('Some files failed to upload. Please try again.')
    } finally {
      setSubmitting(false)
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

  // Success state
  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-6 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Upload Complete!</h2>
          <p className="text-gray-600 mb-4">
            Thank you! Your photos and estimate have been uploaded successfully.
          </p>
          <p className="text-gray-600">
            The property manager will review them shortly.
          </p>
        </div>
      </div>
    )
  }

  const claim = validationResult?.claim

  // Main upload interface
  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-24">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">ClaimCoach AI</h1>
          <p className="text-gray-600">
            Hi {validationResult?.contractor_name}, thanks for helping with{' '}
            {claim?.property.nickname || 'this property'}!
          </p>
        </div>

        {/* Claim Context Card */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Claim Details</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Property:</span>
              <span className="font-medium text-gray-900">{claim?.property.nickname}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Address:</span>
              <span className="font-medium text-gray-900 text-right">{claim?.property.legal_address}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Loss Type:</span>
              <span className="font-medium text-gray-900">{claim?.loss_type}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Incident Date:</span>
              <span className="font-medium text-gray-900">
                {claim?.incident_date ? new Date(claim.incident_date).toLocaleDateString() : 'N/A'}
              </span>
            </div>
          </div>
        </div>

        {/* Photo Upload Section */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Upload Photos</h3>

          <div className="mb-4">
            <label className="block w-full">
              <input
                type="file"
                multiple
                accept="image/*"
                capture="environment"
                onChange={handlePhotoSelect}
                className="hidden"
                disabled={submitting}
              />
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors">
                <svg className="w-12 h-12 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <p className="text-gray-600 font-medium">Tap to take photos or upload</p>
                <p className="text-gray-500 text-sm mt-1">You can select multiple photos</p>
              </div>
            </label>
          </div>

          {/* Photo List */}
          {photos.length > 0 && (
            <div className="space-y-2">
              {photos.map((photo, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center flex-1 min-w-0">
                    <svg className="w-5 h-5 text-gray-400 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span className="text-sm text-gray-700 truncate">{photo.file.name}</span>
                  </div>

                  {photo.uploading && (
                    <div className="ml-2 flex-shrink-0">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                    </div>
                  )}

                  {photo.uploaded && (
                    <div className="ml-2 flex-shrink-0">
                      <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}

                  {photo.error && (
                    <span className="ml-2 text-xs text-red-600">{photo.error}</span>
                  )}

                  {!photo.uploading && !photo.uploaded && (
                    <button
                      onClick={() => removePhoto(index)}
                      className="ml-2 text-red-600 hover:text-red-700 flex-shrink-0"
                      disabled={submitting}
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Estimate Upload Section */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Upload Estimate (Optional)</h3>

          {!estimate ? (
            <label className="block w-full">
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={handleEstimateSelect}
                className="hidden"
                disabled={submitting}
              />
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors">
                <svg className="w-12 h-12 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-gray-600 font-medium">Tap to upload estimate (PDF)</p>
              </div>
            </label>
          ) : (
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center flex-1 min-w-0">
                <svg className="w-5 h-5 text-gray-400 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="text-sm text-gray-700 truncate">{estimate.file.name}</span>
              </div>

              {estimate.uploading && (
                <div className="ml-2 flex-shrink-0">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                </div>
              )}

              {estimate.uploaded && (
                <div className="ml-2 flex-shrink-0">
                  <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}

              {estimate.error && (
                <span className="ml-2 text-xs text-red-600">{estimate.error}</span>
              )}

              {!estimate.uploading && !estimate.uploaded && (
                <button
                  onClick={removeEstimate}
                  className="ml-2 text-red-600 hover:text-red-700 flex-shrink-0"
                  disabled={submitting}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Notes Section */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Additional Notes (Optional)</h3>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add any additional notes or comments..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            rows={4}
            disabled={submitting}
          />
        </div>

        {/* Submit Button - Fixed at bottom on mobile */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 md:relative md:border-0 md:bg-transparent md:p-0">
          <button
            onClick={handleSubmit}
            disabled={submitting || (photos.length === 0 && !estimate)}
            className="w-full py-4 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors text-lg shadow-lg md:shadow-md"
          >
            {submitting ? (
              <span className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                Uploading...
              </span>
            ) : (
              'Submit Photos & Estimate'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
