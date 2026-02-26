import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'

interface Step2ContractorModalProps {
  isOpen: boolean
  onClose: () => void
  claimId: string
}

export default function Step2ContractorModal({
  isOpen,
  onClose,
  claimId,
}: Step2ContractorModalProps) {
  const queryClient = useQueryClient()
  const [formData, setFormData] = useState({
    contractor_name: '',
    contractor_email: '',
  })

  const mutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await api.patch(`/api/claims/${claimId}/step`, {
        current_step: 3,
        steps_completed: [1, 2],
        contractor_name: data.contractor_name,
        contractor_email: data.contractor_email,
      })
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['claim', claimId] })
      setFormData({ contractor_name: '', contractor_email: '' })
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
            Send Assessment Link
          </h3>
          <p className="text-sm text-slate mb-6">
            We'll email your assessor a secure link to upload photos and complete a scope sheet
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-navy mb-2">
                Assessor Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.contractor_name}
                onChange={(e) => setFormData({ ...formData, contractor_name: e.target.value })}
                className="glass-input w-full px-4 py-3 rounded-xl text-navy"
                placeholder="e.g. ABC Roofing, John Smith"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-navy mb-2">
                Assessor Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                required
                value={formData.contractor_email}
                onChange={(e) => setFormData({ ...formData, contractor_email: e.target.value })}
                className="glass-input w-full px-4 py-3 rounded-xl text-navy"
                placeholder="assessor@example.com"
              />
            </div>

            {mutation.isError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
                <p className="text-sm text-red-700">
                  {(mutation.error as any)?.response?.data?.error || 'Failed to send link'}
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
                {mutation.isPending ? 'Sending...' : 'Send Link'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>,
    document.body
  )
}
