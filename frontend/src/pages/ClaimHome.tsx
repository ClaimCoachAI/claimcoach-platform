import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import Layout from '../components/Layout'
import ProgressBar from '../components/ProgressBar'
import ClaimStepper from '../components/ClaimStepper'
import { getDamageTypeLabel } from '../lib/stepUtils'
import type { Claim } from '../types/claim'

export default function ClaimHome() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const { data: claim, isLoading } = useQuery({
    queryKey: ['claim', id],
    queryFn: async () => {
      const response = await api.get(`/api/claims/${id}`)
      return response.data.data as Claim
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await api.delete(`/api/claims/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['claims'] })
      queryClient.invalidateQueries({ queryKey: ['property-claims'] })
      navigate(`/properties/${claim?.property_id}`)
    },
  })

  if (isLoading) {
    return (
      <Layout>
        <div className="flex justify-center items-center py-20">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-teal border-t-transparent"></div>
            <p className="mt-4 text-slate">Loading claim...</p>
          </div>
        </div>
      </Layout>
    )
  }

  if (!claim) {
    return (
      <Layout>
        <div className="text-center py-20">
          <h2 className="text-2xl font-bold text-navy">Claim not found</h2>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in">
        {/* Back Button */}
        <button
          onClick={() => navigate(`/properties/${claim.property_id}`)}
          className="glass-button inline-flex items-center px-4 py-2 rounded-xl text-sm text-navy hover:text-teal transition-colors"
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Claims
        </button>

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold text-navy">
              {getDamageTypeLabel(claim.loss_type)}
            </h1>
            <p className="mt-1 text-slate">
              {claim.property?.legal_address || 'Property'}
            </p>
          </div>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="glass-button inline-flex items-center px-4 py-2 rounded-xl text-sm text-red-600 hover:text-red-700 transition-colors"
            title="Delete Claim"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        </div>

        {/* Progress Bar */}
        <ProgressBar
          stepsCompleted={claim.steps_completed || []}
          currentStep={claim.current_step || 1}
        />

        {/* Claim Journey Stepper */}
        <div>
          <h2 className="text-xl font-display font-bold text-navy mb-4">Your Claim Journey</h2>
          <ClaimStepper claim={claim} />
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 overflow-y-auto animate-fade-in">
          <div className="flex items-center justify-center min-h-screen px-4">
            <div
              className="fixed inset-0 bg-navy/20 backdrop-blur-sm"
              onClick={() => setShowDeleteConfirm(false)}
            />

            <div className="relative w-full max-w-md glass-card-strong rounded-2xl p-6 animate-scale-in">
              <div className="flex items-center justify-center w-16 h-16 mx-auto mb-4 rounded-2xl bg-red-50">
                <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </div>

              <h3 className="text-2xl font-display font-bold text-navy text-center mb-2">
                Delete Claim?
              </h3>
              <p className="text-sm text-slate text-center mb-6">
                Are you sure you want to delete this claim? This action cannot be undone and will permanently remove all claim data.
              </p>

              {deleteMutation.isError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl">
                  <p className="text-sm text-red-700">
                    {(deleteMutation.error as any)?.response?.data?.error || 'Failed to delete claim'}
                  </p>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 btn-secondary px-6 py-3 rounded-xl"
                  disabled={deleteMutation.isPending}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => deleteMutation.mutate()}
                  className="flex-1 px-6 py-3 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-50"
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending ? 'Deleting...' : 'Delete Claim'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
