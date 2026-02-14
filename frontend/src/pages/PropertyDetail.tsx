import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import api from '../lib/api'
import Layout from '../components/Layout'
import PolicyCard from '../components/PolicyCard'
import ReportIncidentModal from '../components/ReportIncidentModal'
import ClaimCard from '../components/ClaimCard'
import { usePolicyPDFUpload } from '../hooks/usePolicyPDFUpload'
import { Property, Policy, Claim } from '../types/claim'

export default function PropertyDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [isClaimModalOpen, setIsClaimModalOpen] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const { uploadPDF, isUploading, uploadError } = usePolicyPDFUpload(id || '')

  const {
    data: property,
    isLoading: loadingProperty,
    error: propertyError,
  } = useQuery({
    queryKey: ['property', id],
    queryFn: async () => {
      const response = await api.get(`/api/properties/${id}`)
      return response.data.data as Property
    },
    enabled: !!id,
  })

  const {
    data: policy,
    isLoading: loadingPolicy,
    refetch: refetchPolicy,
  } = useQuery({
    queryKey: ['policy', id],
    queryFn: async () => {
      try {
        const response = await api.get(`/api/properties/${id}/policy`)
        return response.data.data as Policy
      } catch (error: any) {
        if (error.response?.status === 404) {
          return null
        }
        throw error
      }
    },
    enabled: !!id,
  })

  const {
    data: claims,
    refetch: refetchClaims,
  } = useQuery({
    queryKey: ['property-claims', id],
    queryFn: async () => {
      const response = await api.get(`/api/claims?property_id=${id}`)
      return response.data.data as Claim[]
    },
    enabled: !!id,
  })

  const deletePolicyMutation = useMutation({
    mutationFn: async () => {
      await api.delete(`/api/properties/${id}/policy`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['policy', id] })
      queryClient.invalidateQueries({ queryKey: ['property', id] })
      queryClient.invalidateQueries({ queryKey: ['properties'] })
      refetchPolicy()
    },
  })

  const handleDeletePolicy = () => {
    setShowDeleteConfirm(true)
  }

  const confirmDelete = () => {
    deletePolicyMutation.mutate()
    setShowDeleteConfirm(false)
  }

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'draft':
        return 'badge-slate'
      case 'active_monitored':
        return 'badge-success'
      case 'archived':
        return 'badge-error'
      default:
        return 'badge-slate'
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'draft':
        return 'Draft'
      case 'active_monitored':
        return 'Active'
      case 'archived':
        return 'Archived'
      default:
        return status
    }
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  if (loadingProperty || loadingPolicy) {
    return (
      <Layout>
        <div className="flex justify-center items-center py-20">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-teal border-t-transparent"></div>
            <p className="mt-4 text-slate">Loading property details...</p>
          </div>
        </div>
      </Layout>
    )
  }

  if (propertyError || !property) {
    return (
      <Layout>
        <div className="glass-card rounded-2xl p-8 border-red-200 bg-red-50/50 animate-fade-in">
          <h3 className="text-xl font-display font-semibold text-red-800 mb-2">Property not found</h3>
          <p className="text-red-600 mb-4">The property you are looking for does not exist.</p>
          <button
            onClick={() => navigate('/properties')}
            className="btn-primary px-6 py-2 rounded-xl text-sm font-medium"
          >
            Back to Properties
          </button>
        </div>
      </Layout>
    )
  }

  const handleClaimSuccess = () => {
    refetchClaims()
  }

  return (
    <Layout>
      <div className="space-y-8 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-2">
            <button
              onClick={() => navigate('/properties')}
              className="glass-button inline-flex items-center px-4 py-2 rounded-xl text-sm text-navy hover:text-teal transition-colors"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Properties
            </button>
            <div className="flex items-center gap-3">
              <h2 className="text-3xl font-display font-bold text-navy">{property.nickname}</h2>
              <span className={`badge ${getStatusStyle(property.status)}`}>
                {getStatusLabel(property.status)}
              </span>
            </div>
            <p className="text-slate">{property.legal_address}</p>
          </div>
          <button
            onClick={() => setIsClaimModalOpen(true)}
            className="btn-primary inline-flex items-center px-6 py-3 rounded-xl text-sm font-semibold"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Create New Claim
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left Column - Property & Policy Info */}
          <div className="lg:col-span-2 space-y-6">
            {/* Property Details Card */}
            <div className="glass-card rounded-2xl p-6 animate-scale-in">
              <h3 className="text-lg font-display font-semibold text-navy mb-4">Property Details</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate mb-1">Owner Entity</label>
                  <p className="text-sm text-navy font-medium">{property.owner_entity_name}</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate mb-1">Created</label>
                  <p className="text-sm text-navy">{formatDate(property.created_at)}</p>
                </div>
              </div>
            </div>

            {/* Insurance Policy Card */}
            <div className="animate-scale-in delay-100">
              {/* Policy PDF Upload/View */}
              {policy && (
                <div className="glass-card rounded-2xl p-6 mb-6">
                  <label className="block text-xs font-medium text-slate mb-2">Policy Document</label>
                  {policy.policy_pdf_url ? (
                    <div className="flex items-center justify-between p-3 rounded-xl bg-slate/5 border border-slate/10">
                      <div className="flex items-center space-x-2">
                        <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                        </svg>
                        <span className="text-sm text-navy font-medium">Policy.pdf</span>
                      </div>
                      <a
                        href={policy.policy_pdf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-teal hover:text-teal-dark font-medium"
                      >
                        View →
                      </a>
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl bg-slate/5 border border-slate/10">
                      <p className="text-sm text-slate mb-3">Upload your insurance policy PDF</p>
                      {uploadError && (
                        <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded-lg">
                          <p className="text-xs text-red-700">
                            {(uploadError as any)?.response?.data?.error || 'Failed to upload PDF'}
                          </p>
                        </div>
                      )}
                      <label className={`btn-secondary px-4 py-2 rounded-xl text-sm font-medium cursor-pointer inline-block ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                        <input
                          type="file"
                          accept=".pdf,application/pdf"
                          className="hidden"
                          disabled={isUploading}
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) {
                              if (file.type !== 'application/pdf') {
                                alert('Please select a PDF file')
                                return
                              }
                              if (file.size > 10 * 1024 * 1024) {
                                alert('File size must be less than 10MB')
                                return
                              }
                              uploadPDF(file)
                            }
                          }}
                        />
                        {isUploading ? 'Uploading...' : 'Choose PDF File'}
                      </label>
                    </div>
                  )}
                </div>
              )}

              <PolicyCard
                propertyId={property.id}
                policy={policy || null}
                onSuccess={() => refetchPolicy()}
                onDelete={handleDeletePolicy}
              />
            </div>
          </div>

          {/* Right Column - Claims History */}
          <div className="lg:col-span-3">
            <div className="glass-card rounded-2xl p-6 animate-scale-in delay-200">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-display font-semibold text-navy">
                  Claims History
                  {claims && claims.length > 0 && (
                    <span className="ml-2 badge badge-teal">{claims.length}</span>
                  )}
                </h3>
              </div>

              {claims && claims.length > 0 ? (
                <div className="space-y-4">
                  {claims.map((claim) => (
                    <ClaimCard key={claim.id} claim={claim} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <svg className="mx-auto h-16 w-16 text-slate/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <h4 className="mt-4 text-lg font-display font-semibold text-navy">No claims yet</h4>
                  <p className="mt-2 text-sm text-slate">Create your first claim for this property using the button above</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <ReportIncidentModal
        isOpen={isClaimModalOpen}
        onClose={() => setIsClaimModalOpen(false)}
        onSuccess={handleClaimSuccess}
        preselectedPropertyId={property.id}
      />

      {/* Delete Policy Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 overflow-y-auto animate-fade-in">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            <div
              className="fixed inset-0 transition-opacity bg-navy/20 backdrop-blur-sm"
              onClick={() => setShowDeleteConfirm(false)}
            />

            <div className="inline-block w-full max-w-md my-8 overflow-hidden text-left align-middle transition-all transform glass-card-strong shadow-2xl rounded-3xl animate-scale-in">
              <div className="px-8 py-6">
                <div className="flex items-center justify-center w-16 h-16 mx-auto mb-4 rounded-2xl bg-red-50">
                  <svg
                    className="w-8 h-8 text-red-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </div>

                <h3 className="text-2xl font-display font-bold text-navy text-center mb-2">
                  Delete Policy?
                </h3>
                <p className="text-sm text-slate text-center mb-6">
                  Are you sure you want to delete this insurance policy? This action cannot be undone and will remove all policy information.
                </p>

                {policy && (
                  <div className="mb-6 p-4 rounded-xl bg-red-50/50 border border-red-100">
                    <div className="flex items-start gap-3">
                      <svg
                        className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                        />
                      </svg>
                      <div>
                        <p className="text-sm font-medium text-red-900 mb-1">
                          {policy.carrier_name}
                        </p>
                        <p className="text-xs text-red-700">
                          Policy #{policy.policy_number || 'N/A'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(false)}
                    className="flex-1 btn-secondary px-6 py-3 rounded-xl text-sm font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={confirmDelete}
                    className="flex-1 px-6 py-3 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors"
                  >
                    Delete Policy
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
