import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import type { Claim } from '../types/claim'

interface Step3DeductibleModalProps {
  isOpen: boolean
  onClose: () => void
  claim: Claim
}

export default function Step3DeductibleModal({
  isOpen,
  onClose,
  claim,
}: Step3DeductibleModalProps) {
  const queryClient = useQueryClient()
  const [estimateAmount, setEstimateAmount] = useState('')
  const [comparison, setComparison] = useState<{
    estimate: number
    deductible: number
    worthFiling: boolean
  } | null>(null)

  const deductible = claim.policy?.deductible_calculated || 0

  useEffect(() => {
    if (estimateAmount) {
      const estimate = parseFloat(estimateAmount)
      if (!isNaN(estimate)) {
        setComparison({
          estimate,
          deductible,
          worthFiling: estimate > deductible,
        })
      } else {
        setComparison(null)
      }
    } else {
      setComparison(null)
    }
  }, [estimateAmount, deductible])

  const mutation = useMutation({
    mutationFn: async () => {
      if (!comparison) throw new Error('Invalid estimate')

      const response = await api.patch(`/api/claims/${claim.id}/step`, {
        current_step: 4,
        steps_completed: [1, 2, 3],
        contractor_estimate_total: comparison.estimate,
        deductible_comparison_result: comparison.worthFiling ? 'worth_filing' : 'not_worth_filing',
      })
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['claim', claim.id] })
      setEstimateAmount('')
      setComparison(null)
      onClose()
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (comparison) {
      mutation.mutate()
    }
  }

  if (!isOpen) return null

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto animate-fade-in">
      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="fixed inset-0 bg-navy/20 backdrop-blur-sm" onClick={onClose} />

        <div className="relative z-10 w-full max-w-md glass-card-strong rounded-2xl p-6 animate-scale-in">
          <h3 className="text-2xl font-display font-bold text-navy mb-4">
            Check if Worth Filing
          </h3>
          <p className="text-sm text-slate mb-6">
            Compare your contractor's estimate to your deductible
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-navy mb-2">
                Contractor Estimate Total <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate">$</span>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={estimateAmount}
                  onChange={(e) => setEstimateAmount(e.target.value)}
                  className="glass-input w-full pl-8 pr-4 py-3 rounded-xl text-navy"
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate/5 border border-slate/10">
              <p className="text-sm font-medium text-navy mb-2">Your Deductible</p>
              <p className="text-2xl font-bold text-navy">
                ${deductible.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
            </div>

            {comparison && (
              <div
                className={`p-4 rounded-xl border ${
                  comparison.worthFiling
                    ? 'bg-teal/10 border-teal/20'
                    : 'bg-yellow-50 border-yellow-200'
                }`}
              >
                <p className="text-sm font-semibold mb-2">
                  {comparison.worthFiling ? '✅ Worth Filing' : '⚠️ Below Deductible'}
                </p>
                <p className="text-xs text-slate">
                  {comparison.worthFiling
                    ? `Estimate is $${(comparison.estimate - comparison.deductible).toLocaleString('en-US', { minimumFractionDigits: 2 })} above your deductible`
                    : `Estimate is $${(comparison.deductible - comparison.estimate).toLocaleString('en-US', { minimumFractionDigits: 2 })} below your deductible. You'd pay out of pocket anyway.`}
                </p>
              </div>
            )}

            {mutation.isError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
                <p className="text-sm text-red-700">
                  {(mutation.error as any)?.response?.data?.error || 'Failed to update claim'}
                </p>
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 btn-secondary px-6 py-3 rounded-xl"
                disabled={mutation.isPending}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 btn-primary px-6 py-3 rounded-xl"
                disabled={mutation.isPending || !comparison}
              >
                {mutation.isPending ? 'Saving...' : 'Continue'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>,
    document.body
  )
}
