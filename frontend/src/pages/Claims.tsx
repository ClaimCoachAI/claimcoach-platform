import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'
import Layout from '../components/Layout'
import ClaimCard from '../components/ClaimCard'
import ReportIncidentModal from '../components/ReportIncidentModal'
import { Claim, Property } from '../types/claim'

export default function Claims() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [propertyFilter, setPropertyFilter] = useState<string>('all')

  const {
    data: claims,
    isLoading: loadingClaims,
    isError: isClaimsError,
    error: claimsError,
    refetch,
  } = useQuery({
    queryKey: ['claims', statusFilter, propertyFilter],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (statusFilter !== 'all') {
        params.append('status', statusFilter)
      }
      if (propertyFilter !== 'all') {
        params.append('property_id', propertyFilter)
      }
      const response = await api.get(`/api/claims?${params.toString()}`)
      return response.data.data as Claim[]
    },
  })

  const { data: properties, isError: isPropertiesError } = useQuery({
    queryKey: ['properties'],
    queryFn: async () => {
      const response = await api.get('/api/properties')
      return response.data.data as Property[]
    },
  })

  const handleSuccess = () => {
    refetch()
  }

  const stats = useMemo(() => ({
    total: claims?.length || 0,
    active: claims?.filter((c) => !['settled', 'closed'].includes(c.status)).length || 0,
    settled: claims?.filter((c) => c.status === 'settled').length || 0,
    draft: claims?.filter((c) => c.status === 'draft').length || 0,
  }), [claims])

  if (isClaimsError) {
    return (
      <Layout>
        <div className="glass-card rounded-2xl p-8 border-red-200 bg-red-50/50 animate-fade-in">
          <h3 className="text-xl font-display font-semibold text-red-800 mb-2">Failed to load claims</h3>
          <p className="text-red-600 text-sm mb-4">
            {claimsError instanceof Error ? claimsError.message : 'An error occurred'}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="btn-primary px-6 py-2 rounded-xl text-sm font-medium"
          >
            Reload page
          </button>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="space-y-8 animate-fade-in">
        {isPropertiesError && (
          <div className="glass-card rounded-xl p-4 border-yellow-200 bg-yellow-50/50 animate-slide-down">
            <p className="text-yellow-800 text-sm">
              Failed to load properties for filtering. Some features may be limited.
            </p>
          </div>
        )}

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-3xl font-display font-bold text-navy">Claims</h2>
            <p className="mt-2 text-slate">
              {stats.active > 0 ? `${stats.active} active claims, ` : ''}{stats.total} total
            </p>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="btn-primary inline-flex items-center px-6 py-3 rounded-xl text-sm font-semibold"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Report Incident
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="glass-card rounded-2xl p-6 animate-scale-in delay-100">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-xl bg-teal/10 flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-teal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-slate">Total</p>
                <p className="text-2xl font-display font-bold text-navy">{stats.total}</p>
              </div>
            </div>
          </div>

          <div className="glass-card rounded-2xl p-6 animate-scale-in delay-200">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-slate">Active</p>
                <p className="text-2xl font-display font-bold text-navy">{stats.active}</p>
              </div>
            </div>
          </div>

          <div className="glass-card rounded-2xl p-6 animate-scale-in delay-300">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-slate">Settled</p>
                <p className="text-2xl font-display font-bold text-navy">{stats.settled}</p>
              </div>
            </div>
          </div>

          <div className="glass-card rounded-2xl p-6 animate-scale-in delay-400">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-xl bg-slate/10 flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-slate" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-slate">Drafts</p>
                <p className="text-2xl font-display font-bold text-navy">{stats.draft}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="glass-card-strong rounded-2xl p-6 animate-slide-up">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="statusFilter" className="block text-sm font-medium text-navy mb-2">
                Filter by Status
              </label>
              <select
                id="statusFilter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="glass-input w-full px-4 py-3 rounded-xl text-navy cursor-pointer"
              >
                <option value="all">All Statuses</option>
                <option value="draft">Draft</option>
                <option value="assessing">Assessing</option>
                <option value="filed">Filed</option>
                <option value="field_scheduled">Field Scheduled</option>
                <option value="audit_pending">Audit Pending</option>
                <option value="negotiating">Negotiating</option>
                <option value="settled">Settled</option>
                <option value="closed">Closed</option>
              </select>
            </div>

            <div>
              <label htmlFor="propertyFilter" className="block text-sm font-medium text-navy mb-2">
                Filter by Property
              </label>
              <select
                id="propertyFilter"
                value={propertyFilter}
                onChange={(e) => setPropertyFilter(e.target.value)}
                className="glass-input w-full px-4 py-3 rounded-xl text-navy cursor-pointer"
              >
                <option value="all">All Properties</option>
                {properties?.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.nickname}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Claims List */}
        {loadingClaims ? (
          <div className="flex justify-center items-center py-20">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-teal border-t-transparent"></div>
              <p className="mt-4 text-slate">Loading claims...</p>
            </div>
          </div>
        ) : claims && claims.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {claims.map((claim, index) => (
              <div
                key={claim.id}
                style={{ animationDelay: `${index * 50}ms` }}
                className="animate-scale-in"
              >
                <ClaimCard claim={claim} />
              </div>
            ))}
          </div>
        ) : (
          <div className="glass-card rounded-2xl p-12 text-center animate-scale-in">
            <svg className="mx-auto h-16 w-16 text-slate/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h3 className="mt-4 text-xl font-display font-semibold text-navy">No claims found</h3>
            <p className="mt-2 text-slate">
              {statusFilter !== 'all' || propertyFilter !== 'all'
                ? 'No claims match your filters. Try adjusting your search.'
                : 'Get started by reporting your first incident.'}
            </p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="mt-6 btn-primary inline-flex items-center px-6 py-3 rounded-xl text-sm font-semibold"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Report Incident
            </button>
          </div>
        )}
      </div>

      <ReportIncidentModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleSuccess}
      />
    </Layout>
  )
}
