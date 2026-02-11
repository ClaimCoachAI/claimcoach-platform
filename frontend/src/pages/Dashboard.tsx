import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'
import Layout from '../components/Layout'
import ClaimCard from '../components/ClaimCard'
import type { Claim } from '../types/claim'

export default function Dashboard() {
  const [searchQuery, setSearchQuery] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)

  const {
    data: claims,
    isLoading,
  } = useQuery({
    queryKey: ['claims'],
    queryFn: async () => {
      const response = await api.get('/api/claims')
      return response.data.data as Claim[]
    },
  })

  // Filter and sort claims
  const { activeClaims, closedClaims } = useMemo(() => {
    if (!claims) return { activeClaims: [], closedClaims: [] }

    const filtered = searchQuery.trim()
      ? claims.filter(
          (claim) =>
            claim.property?.legal_address?.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : claims

    const active = filtered.filter((claim) => claim.status !== 'closed')
    const closed = filtered.filter((claim) => claim.status === 'closed')

    // Sort active claims: waiting for user action first
    active.sort((a, b) => {
      // Claims on current step (no waiting) come first
      const aWaiting = a.contractor_email && !(a.steps_completed || []).includes(2)
      const bWaiting = b.contractor_email && !(b.steps_completed || []).includes(2)

      if (aWaiting && !bWaiting) return 1
      if (!aWaiting && bWaiting) return -1

      // Then sort by creation date (newest first)
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })

    return { activeClaims: active, closedClaims: closed }
  }, [claims, searchQuery])

  return (
    <Layout>
      <div className="space-y-8 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-3xl font-display font-bold text-navy">Your Claims</h2>
            <p className="mt-2 text-slate">
              {claims
                ? `${activeClaims.length} active • ${closedClaims.length} closed`
                : 'Loading...'}
            </p>
          </div>
        </div>

        {/* Search Bar */}
        <div className="glass-card-strong rounded-2xl p-2 animate-slide-up delay-100">
          <div className="relative">
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
              <svg
                className="h-6 w-6 text-teal"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
            <input
              type="text"
              placeholder="Search claims..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-14 pr-4 py-4 bg-transparent text-navy placeholder-slate/50 focus:outline-none text-lg"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-4 flex items-center text-slate hover:text-navy transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center py-20">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-teal border-t-transparent"></div>
              <p className="mt-4 text-slate">Loading claims...</p>
            </div>
          </div>
        ) : (
          <>
            {/* Active Claims */}
            {activeClaims.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate">
                  Active Claims ({activeClaims.length})
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {activeClaims.map((claim, index) => (
                    <div
                      key={claim.id}
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      <ClaimCard claim={claim} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Closed Claims */}
            {closedClaims.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate">
                  Closed Claims ({closedClaims.length})
                </h3>
                <button
                  onClick={() => {/* Toggle expand */}}
                  className="text-sm text-teal hover:text-teal-dark font-medium"
                >
                  View all →
                </button>
              </div>
            )}

            {/* Empty State */}
            {activeClaims.length === 0 && closedClaims.length === 0 && !searchQuery && (
              <div className="glass-card rounded-2xl p-12 text-center animate-scale-in">
                <svg
                  className="mx-auto h-16 w-16 text-slate/50"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <h3 className="mt-4 text-xl font-display font-semibold text-navy">
                  No claims yet
                </h3>
                <p className="mt-2 text-slate">Create your first claim to get started</p>
              </div>
            )}

            {/* No Search Results */}
            {activeClaims.length === 0 && closedClaims.length === 0 && searchQuery && (
              <div className="glass-card rounded-2xl p-12 text-center animate-scale-in">
                <svg
                  className="mx-auto h-16 w-16 text-slate/50"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                <h3 className="mt-4 text-xl font-display font-semibold text-navy">
                  No claims found
                </h3>
                <p className="mt-2 text-slate">No claims match your search for "{searchQuery}"</p>
                <button
                  onClick={() => setSearchQuery('')}
                  className="mt-6 btn-secondary px-6 py-2 rounded-xl text-sm font-medium"
                >
                  Clear search
                </button>
              </div>
            )}
          </>
        )}

        {/* Floating Action Button */}
        <button
          onClick={() => setShowCreateModal(true)}
          className="fixed bottom-8 right-8 w-14 h-14 bg-gradient-to-br from-teal to-teal-dark rounded-full shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center text-white text-2xl z-50"
          aria-label="Create new claim"
        >
          +
        </button>

        {/* TODO: Create Claim Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50">
            <div className="bg-white rounded-t-3xl md:rounded-3xl p-6 w-full md:max-w-md">
              <p>Create Claim Modal - Coming in Phase 3</p>
              <button onClick={() => setShowCreateModal(false)}>Close</button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
