import { createPortal } from 'react-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'

interface Step6CloseClaimModalProps {
  isOpen: boolean
  onClose: () => void
  claimId: string
}

export default function Step6CloseClaimModal({
  isOpen,
  onClose,
  claimId,
}: Step6CloseClaimModalProps) {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async () => {
      const response = await api.patch(`/api/claims/${claimId}/step`, {
        current_step: 6,
        steps_completed: [1, 2, 3, 4, 5, 6],
        status: 'closed',
      })
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['claim', claimId] })
      onClose()
    },
  })

  const handleComplete = () => {
    mutation.mutate()
  }

  if (!isOpen) return null

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto animate-fade-in">
      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="fixed inset-0 bg-navy/20 backdrop-blur-sm" onClick={onClose} />

        <div className="relative z-10 w-full max-w-md glass-card-strong rounded-2xl p-6 animate-scale-in">
          <h3 className="text-2xl font-display font-bold text-navy mb-4">
            Close Claim
          </h3>
          <p className="text-sm text-slate mb-6">
            Track your ACV and RCV payments, then close the claim when everything is complete.
          </p>

          <div className="p-4 rounded-xl bg-teal/10 border border-teal/20 mb-6">
            <p className="text-sm font-medium text-teal-dark mb-2">💰 Payment Tracking</p>
            <p className="text-xs text-slate mb-3">
              Insurance usually pays in two parts:
            </p>
            <ul className="text-xs text-slate space-y-1 ml-4">
              <li>• ACV (Actual Cash Value) - Upfront to start repairs</li>
              <li>• RCV (Recoverable Depreciation) - After repairs are done</li>
            </ul>
          </div>

          {mutation.isError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl mb-4">
              <p className="text-sm text-red-700">
                {(mutation.error as any)?.response?.data?.error || 'Failed to close claim'}
              </p>
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 btn-secondary px-6 py-3 rounded-xl"
              disabled={mutation.isPending}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleComplete}
              className="flex-1 btn-primary px-6 py-3 rounded-xl"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? 'Closing...' : 'Close Claim'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
