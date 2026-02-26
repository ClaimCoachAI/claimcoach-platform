// frontend/src/components/ClaimCard.tsx

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import {
  getDamageTypeIcon,
  getDamageTypeLabel,
  getStepStatusText,
  formatTimeAgo,
  getProgress
} from '../lib/stepUtils'
import type { Claim } from '../types/claim'

interface ClaimCardProps {
  claim: Claim
}

const DAMAGE_ACCENT: Record<string, string> = {
  water: '#38bdf8',  // sky-400
  hail:  '#818cf8',  // indigo-400
}

export default function ClaimCard({ claim }: ClaimCardProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const progress = getProgress(claim.steps_completed || [])
  const icon = getDamageTypeIcon(claim.loss_type)
  const damageLabel = getDamageTypeLabel(claim.loss_type)
  const statusText = getStepStatusText(
    claim.current_step || 1,
    claim.steps_completed || [],
    claim
  )
  const timeAgo = formatTimeAgo(claim.created_at)
  const referenceId = claim.insurance_claim_number || claim.claim_number || null
  const accentColor = DAMAGE_ACCENT[claim.loss_type] ?? '#38bdf8'
  const incidentDate = claim.incident_date
    ? new Date(claim.incident_date).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      })
    : null

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await api.delete(`/api/claims/${claim.id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['property-claims', claim.property_id] })
      queryClient.invalidateQueries({ queryKey: ['claims'] })
      setShowDeleteConfirm(false)
    },
  })

  return (
    <div
      className="glass-card rounded-2xl p-6 hover:shadow-lg transition-all duration-200 animate-scale-in relative"
      style={{ borderLeftColor: accentColor, borderLeftWidth: '3px' }}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center space-x-3">
          <span className="text-3xl">{icon}</span>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-semibold text-navy">{damageLabel}</h3>
              {referenceId && (
                <span
                  aria-label={`Claim reference: ${referenceId}`}
                  className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full"
                  style={{ color: accentColor, backgroundColor: `${accentColor}18` }}
                >
                  {referenceId}
                </span>
              )}
            </div>
            <p className="text-sm text-slate">
              {incidentDate ?? (claim.property?.legal_address || 'Property')}
            </p>
          </div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation()
            setShowDeleteConfirm(true)
          }}
          className="p-2 text-slate hover:text-red-600 transition-colors rounded-lg hover:bg-red-50"
          title="Delete claim"
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

      <div className="mb-4">
        <p className="text-sm font-medium text-slate mb-1">{statusText}</p>
        <p className="text-xs text-slate/70">
          Step {claim.current_step || 1} of 6
        </p>
      </div>

      <div className="mb-4">
        <div className="flex items-center space-x-1 mb-1">
          {[1, 2, 3, 4, 5, 6].map((step) => (
            <div
              key={step}
              className={`h-1.5 flex-1 rounded-full transition-all ${
                (claim.steps_completed || []).includes(step)
                  ? 'bg-teal'
                  : step === (claim.current_step || 1)
                  ? 'bg-teal/50 animate-pulse'
                  : 'bg-slate/20'
              }`}
            />
          ))}
        </div>
        <p className="text-xs text-slate">
          {progress.completed} of {progress.total} steps done
        </p>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-slate">Started {timeAgo}</span>
        <button
          onClick={() => navigate(`/claims/${claim.id}`)}
          className="btn-primary px-4 py-2 rounded-xl text-sm font-semibold"
        >
          View Claim →
        </button>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && createPortal(
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
              <p className="text-sm text-slate text-center mb-4">
                Are you sure you want to delete the <strong>{damageLabel}</strong> claim?
              </p>
              <p className="text-xs text-slate text-center mb-6">
                This action cannot be undone and will permanently remove all claim data.
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
                  {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
