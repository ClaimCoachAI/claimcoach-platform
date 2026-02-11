// frontend/src/components/ClaimCard.tsx

import { useNavigate } from 'react-router-dom'
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

export default function ClaimCard({ claim }: ClaimCardProps) {
  const navigate = useNavigate()
  const progress = getProgress(claim.steps_completed || [])
  const icon = getDamageTypeIcon(claim.loss_type)
  const damageLabel = getDamageTypeLabel(claim.loss_type)
  const statusText = getStepStatusText(
    claim.current_step || 1,
    claim.steps_completed || [],
    claim
  )
  const timeAgo = formatTimeAgo(claim.created_at)

  return (
    <div className="glass-card rounded-2xl p-6 hover:shadow-lg transition-all duration-200 animate-scale-in">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center space-x-3">
          <span className="text-3xl">{icon}</span>
          <div>
            <h3 className="text-lg font-semibold text-navy">{damageLabel}</h3>
            <p className="text-sm text-slate">
              {claim.property?.legal_address || 'Property'}
            </p>
          </div>
        </div>
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
    </div>
  )
}
