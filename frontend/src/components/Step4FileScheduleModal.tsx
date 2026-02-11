import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'

interface Step4FileScheduleModalProps {
  isOpen: boolean
  onClose: () => void
  claimId: string
}

export default function Step4FileScheduleModal({
  isOpen,
  onClose,
  claimId,
}: Step4FileScheduleModalProps) {
  const queryClient = useQueryClient()
  const [formData, setFormData] = useState({
    insurance_claim_number: '',
    adjuster_name: '',
    adjuster_phone: '',
    inspection_datetime: '',
  })

  const mutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await api.patch(`/api/claims/${claimId}/step`, {
        current_step: 5,
        steps_completed: [1, 2, 3, 4],
        insurance_claim_number: data.insurance_claim_number,
        adjuster_name: data.adjuster_name || undefined,
        adjuster_phone: data.adjuster_phone || undefined,
        inspection_datetime: data.inspection_datetime || undefined,
      })
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['claim', claimId] })
      setFormData({
        insurance_claim_number: '',
        adjuster_name: '',
        adjuster_phone: '',
        inspection_datetime: '',
      })
      onClose()
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    mutation.mutate(formData)
  }

  if (!isOpen) return null

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto animate-fade-in">
      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="fixed inset-0 bg-navy/20 backdrop-blur-sm" onClick={onClose} />

        <div className="relative z-10 w-full max-w-md glass-card-strong rounded-2xl p-6 animate-scale-in">
          <h3 className="text-2xl font-display font-bold text-navy mb-4">
            File with Insurance
          </h3>
          <p className="text-sm text-slate mb-6">
            Enter your insurance claim number and adjuster details
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-navy mb-2">
                Insurance Claim Number <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.insurance_claim_number}
                onChange={(e) =>
                  setFormData({ ...formData, insurance_claim_number: e.target.value })
                }
                className="glass-input w-full px-4 py-3 rounded-xl text-navy"
                placeholder="e.g., CLM-2024-12345"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-navy mb-2">
                Adjuster Name
              </label>
              <input
                type="text"
                value={formData.adjuster_name}
                onChange={(e) => setFormData({ ...formData, adjuster_name: e.target.value })}
                className="glass-input w-full px-4 py-3 rounded-xl text-navy"
                placeholder="John Smith"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-navy mb-2">
                Adjuster Phone
              </label>
              <input
                type="tel"
                value={formData.adjuster_phone}
                onChange={(e) => setFormData({ ...formData, adjuster_phone: e.target.value })}
                className="glass-input w-full px-4 py-3 rounded-xl text-navy"
                placeholder="(555) 123-4567"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-navy mb-2">
                Inspection Date & Time
              </label>
              <input
                type="datetime-local"
                value={formData.inspection_datetime}
                onChange={(e) =>
                  setFormData({ ...formData, inspection_datetime: e.target.value })
                }
                className="glass-input w-full px-4 py-3 rounded-xl text-navy"
              />
            </div>

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
                disabled={mutation.isPending}
              >
                {mutation.isPending ? 'Saving...' : 'Complete Step'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>,
    document.body
  )
}
