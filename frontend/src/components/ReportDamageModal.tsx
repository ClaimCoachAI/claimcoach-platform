import { useState } from 'react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'
import type { Property } from '../types/claim'

interface ReportDamageModalProps {
  isOpen: boolean
  onClose: () => void
  preselectedPropertyId?: string
}

export default function ReportDamageModal({
  isOpen,
  onClose,
  preselectedPropertyId,
}: ReportDamageModalProps) {
  const [propertyId, setPropertyId] = useState(preselectedPropertyId || '')
  const [lossType, setLossType] = useState<'water' | 'hail' | ''>('')
  const [incidentDate, setIncidentDate] = useState('')
  const [description, setDescription] = useState('')
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: properties } = useQuery({
    queryKey: ['properties'],
    queryFn: async () => {
      const response = await api.get('/api/properties')
      return response.data.data as Property[]
    },
  })

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await api.post('/api/claims', data)
      return response.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['claims'] })
      onClose()
      // Navigate to the new claim
      navigate(`/claims/${data.data.id}`)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    mutation.mutate({
      property_id: propertyId,
      loss_type: lossType,
      incident_date: incidentDate,
      description: description || undefined,
      current_step: 1,
      steps_completed: [1],
      status: 'active',
    })
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 animate-fade-in">
      <div className="bg-white rounded-t-3xl md:rounded-3xl p-8 w-full md:max-w-md max-h-[90vh] overflow-y-auto animate-slide-up">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-display font-bold text-navy">Report Damage</h2>
          <button
            onClick={onClose}
            className="text-slate hover:text-navy transition-colors"
            aria-label="Close"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Property Selection */}
          <div>
            <label htmlFor="property" className="block text-sm font-medium text-navy mb-2">
              Property *
            </label>
            <select
              id="property"
              required
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              className="glass-input w-full px-4 py-3 rounded-xl text-navy"
            >
              <option value="">Select a property</option>
              {properties?.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.legal_address}
                </option>
              ))}
            </select>
          </div>

          {/* Damage Type */}
          <div>
            <label className="block text-sm font-medium text-navy mb-3">
              What type of damage? *
            </label>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setLossType('water')}
                className={`p-6 rounded-2xl border-2 transition-all ${
                  lossType === 'water'
                    ? 'border-teal bg-teal/10'
                    : 'border-slate/20 hover:border-slate/40'
                }`}
              >
                <div className="text-4xl mb-2">💧</div>
                <div className="text-sm font-medium text-navy">Water Damage</div>
              </button>
              <button
                type="button"
                onClick={() => setLossType('hail')}
                className={`p-6 rounded-2xl border-2 transition-all ${
                  lossType === 'hail'
                    ? 'border-teal bg-teal/10'
                    : 'border-slate/20 hover:border-slate/40'
                }`}
              >
                <div className="text-4xl mb-2">🧊</div>
                <div className="text-sm font-medium text-navy">Hail Damage</div>
              </button>
            </div>
          </div>

          {/* Incident Date */}
          <div>
            <label htmlFor="date" className="block text-sm font-medium text-navy mb-2">
              When did it happen? *
            </label>
            <input
              type="date"
              id="date"
              required
              value={incidentDate}
              onChange={(e) => setIncidentDate(e.target.value)}
              max={new Date().toISOString().split('T')[0]}
              className="glass-input w-full px-4 py-3 rounded-xl text-navy"
            />
          </div>

          {/* Description (Optional) */}
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-navy mb-2">
              Brief description (optional)
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Describe what happened..."
              className="glass-input w-full px-4 py-3 rounded-xl text-navy resize-none"
            />
          </div>

          {/* Error Message */}
          {mutation.isError && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200">
              <p className="text-sm text-red-700">
                {(mutation.error as any)?.response?.data?.error || 'Failed to create claim'}
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex space-x-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 btn-secondary px-6 py-3 rounded-xl text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending || !propertyId || !lossType || !incidentDate}
              className="flex-1 btn-primary px-6 py-3 rounded-xl text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {mutation.isPending ? 'Creating...' : 'Create Claim →'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
