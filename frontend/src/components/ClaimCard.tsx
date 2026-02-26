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

  const stepsCompleted = claim.steps_completed || []
  const currentStep = claim.current_step || 1

  return (
    <div
      className="glass-card rounded-xl p-4 flex flex-col h-full hover:shadow-lg transition-all duration-200 animate-scale-in"
      style={{ borderTopColor: accentColor, borderTopWidth: '3px' }}
    >
      {/* Header: icon tile + type + delete */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center text-xl shrink-0"
            style={{ backgroundColor: `${accentColor}18` }}
          >
            {icon}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-navy leading-tight">{damageLabel}</h3>
            <p className="text-xs text-slate/60 mt-0.5">{incidentDate ?? timeAgo}</p>
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(true) }}
          className="p-1 -mt-0.5 -mr-0.5 text-slate/30 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50"
          title="Delete claim"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>
      </div>

      {/* Reference badge */}
      {referenceId && (
        <div className="mb-3">
          <span
            aria-label={`Claim reference: ${referenceId}`}
            className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full"
            style={{ color: accentColor, backgroundColor: `${accentColor}15` }}
          >
            {referenceId}
          </span>
        </div>
      )}

      {/* Status */}
      <p className="text-xs text-slate line-clamp-2 mb-3 flex-1">{statusText}</p>

      {/* Progress */}
      <div className="mb-3">
        <div className="flex gap-0.5 mb-1">
          {[1, 2, 3, 4, 5, 6, 7].map((step) => (
            <div
              key={step}
              className={`h-1 flex-1 rounded-full transition-all ${
                stepsCompleted.includes(step)
                  ? 'bg-teal'
                  : step === currentStep
                  ? 'bg-teal/40 animate-pulse'
                  : 'bg-slate/15'
              }`}
            />
          ))}
        </div>
        <p className="text-xs text-slate/50">{progress.completed} of 7 steps done</p>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-slate/10">
        <span className="text-xs text-slate/50">Started {timeAgo}</span>
        <button
          onClick={() => navigate(`/claims/${claim.id}`)}
          className="btn-primary px-3 py-1.5 rounded-lg text-xs font-semibold"
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
