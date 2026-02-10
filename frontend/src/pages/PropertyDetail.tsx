import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import api from '../lib/api'
import Layout from '../components/Layout'
import AddPolicyForm from '../components/AddPolicyForm'
import ReportIncidentModal from '../components/ReportIncidentModal'
import ClaimCard from '../components/ClaimCard'

interface Property {
  id: string
  nickname: string
  legal_address: string
  status: string
  owner_entity_name: string
  created_at: string
  updated_at: string
}

interface Policy {
  id: string
  property_id: string
  carrier_name: string
  policy_number?: string
  coverage_a_limit?: number
  coverage_b_limit?: number
  coverage_d_limit?: number
  deductible_type?: 'percentage' | 'fixed'
  deductible_value?: number
  effective_date?: string
  expiration_date?: string
  created_at: string
  updated_at: string
}

interface Claim {
  id: string
  claim_number: string | null
  property_id: string
  property?: {
    nickname: string
    legal_address: string
  }
  loss_type: string
  status: string
  incident_date: string
}

export default function PropertyDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [isClaimModalOpen, setIsClaimModalOpen] = useState(false)

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

  const formatCurrency = (amount?: number) => {
    if (!amount) return 'N/A'
    return `$${amount.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`
  }

  const calculateDeductible = (policy: Policy) => {
    if (!policy.deductible_value || !policy.coverage_a_limit) return null
    if (policy.deductible_type === 'percentage') {
      return (policy.coverage_a_limit * policy.deductible_value) / 100
    }
    return policy.deductible_value
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
            <div className="glass-card rounded-2xl p-6 animate-scale-in delay-100">
              <h3 className="text-lg font-display font-semibold text-navy mb-4">Insurance Policy</h3>

              {policy ? (
                <div className="space-y-4">
                  <div className="p-3 rounded-xl bg-teal/10 border border-teal/20">
                    <p className="text-sm font-medium text-teal-dark flex items-center">
                      <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      Policy on file
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate mb-1">Carrier</label>
                    <p className="text-sm text-navy font-medium">{policy.carrier_name}</p>
                  </div>

                  {policy.policy_number && (
                    <div>
                      <label className="block text-xs font-medium text-slate mb-1">Policy Number</label>
                      <p className="text-sm text-navy font-mono">{policy.policy_number}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate mb-1">Coverage A</label>
                      <p className="text-sm text-navy font-semibold">{formatCurrency(policy.coverage_a_limit)}</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate mb-1">Coverage B</label>
                      <p className="text-sm text-navy font-semibold">{formatCurrency(policy.coverage_b_limit)}</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate mb-1">Coverage D</label>
                      <p className="text-sm text-navy font-semibold">{formatCurrency(policy.coverage_d_limit)}</p>
                    </div>
                  </div>

                  {policy.deductible_type && policy.deductible_value && (
                    <div>
                      <label className="block text-xs font-medium text-slate mb-1">Deductible</label>
                      <p className="text-sm text-navy">
                        {policy.deductible_type === 'percentage'
                          ? `${policy.deductible_value}%`
                          : formatCurrency(policy.deductible_value)}
                        {calculateDeductible(policy) && (
                          <span className="text-slate ml-2">
                            ({formatCurrency(calculateDeductible(policy)!)})
                          </span>
                        )}
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate mb-1">Effective</label>
                      <p className="text-sm text-navy">{formatDate(policy.effective_date)}</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate mb-1">Expiration</label>
                      <p className="text-sm text-navy">{formatDate(policy.expiration_date)}</p>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-white/60">
                    <h4 className="text-sm font-medium text-navy mb-4">Update Policy</h4>
                    <AddPolicyForm
                      propertyId={property.id}
                      existingPolicy={policy}
                      onSuccess={() => refetchPolicy()}
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-3 rounded-xl bg-yellow-50 border border-yellow-200">
                    <p className="text-sm font-medium text-yellow-800 flex items-center">
                      <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      No policy information
                    </p>
                  </div>

                  <AddPolicyForm
                    propertyId={property.id}
                    onSuccess={() => refetchPolicy()}
                  />
                </div>
              )}
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
    </Layout>
  )
}
