import { useState, useEffect } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import api from '../lib/api'
import { Property } from '../types/claim'

interface ReportIncidentModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  preselectedPropertyId?: string
}

interface ClaimFormData {
  property_id: string
  loss_type: string
  incident_date: string
  description: string
}

export default function ReportIncidentModal({
  isOpen,
  onClose,
  onSuccess,
  preselectedPropertyId,
}: ReportIncidentModalProps) {
  const [formData, setFormData] = useState<ClaimFormData>({
    property_id: '',
    loss_type: '',
    incident_date: '',
    description: '',
  })

  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null)

  const { data: properties, isLoading: loadingProperties } = useQuery({
    queryKey: ['properties'],
    queryFn: async () => {
      const response = await api.get('/api/properties')
      return response.data.data as Property[]
    },
    enabled: isOpen,
  })

  const createClaimMutation = useMutation({
    mutationFn: async (data: ClaimFormData) => {
      const payload = {
        ...data,
        description: data.description || undefined,
        current_step: 2,
        steps_completed: [1],
      }
      const response = await api.post('/api/claims', payload)
      return response.data
    },
    onSuccess: () => {
      setFormData({
        property_id: '',
        loss_type: '',
        incident_date: '',
        description: '',
      })
      setSelectedProperty(null)
      onSuccess()
      onClose()
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createClaimMutation.mutate(formData)
  }

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target
    setFormData({
      ...formData,
      [name]: value,
    })

    if (name === 'property_id' && properties) {
      const property = properties.find((p) => p.id === value)
      setSelectedProperty(property || null)
    }
  }

  // Set preselected property if provided
  useEffect(() => {
    if (isOpen && preselectedPropertyId && properties) {
      setFormData(prev => ({ ...prev, property_id: preselectedPropertyId }))
      const property = properties.find((p) => p.id === preselectedPropertyId)
      setSelectedProperty(property || null)
    }
  }, [isOpen, preselectedPropertyId, properties])

  useEffect(() => {
    if (!isOpen) {
      setFormData({
        property_id: '',
        loss_type: '',
        incident_date: '',
        description: '',
      })
      setSelectedProperty(null)
    }
  }, [isOpen])

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto animate-fade-in">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div
          className="fixed inset-0 transition-opacity bg-navy/20 backdrop-blur-sm"
          onClick={onClose}
        />

        <div className="inline-block w-full max-w-lg my-8 overflow-hidden text-left align-middle transition-all transform glass-card-strong shadow-2xl rounded-3xl animate-scale-in">
          <form onSubmit={handleSubmit}>
            <div className="px-8 py-6 border-b border-white/20">
              <h3 className="text-2xl font-display font-bold text-navy">
                Report Incident
              </h3>
              <p className="mt-1 text-sm text-slate">
                Start a new claim by providing incident details
              </p>
            </div>

            <div className="px-8 py-6 space-y-5">
              {createClaimMutation.isError && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl animate-slide-down">
                  <p className="text-sm text-red-700">
                    {(createClaimMutation.error as any)?.response?.data?.error ||
                      (createClaimMutation.error instanceof Error
                        ? createClaimMutation.error.message
                        : 'Failed to create claim. Please try again.')}
                  </p>
                </div>
              )}

              <div>
                <label
                  htmlFor="property_id"
                  className="block text-sm font-medium text-navy mb-2"
                >
                  Property <span className="text-red-500">*</span>
                </label>
                <select
                  id="property_id"
                  name="property_id"
                  required
                  value={formData.property_id}
                  onChange={handleChange}
                  disabled={loadingProperties || !!preselectedPropertyId}
                  className="glass-input w-full px-4 py-3 rounded-xl text-navy cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="">
                    {loadingProperties ? 'Loading properties...' : 'Select a property'}
                  </option>
                  {properties?.map((property) => (
                    <option key={property.id} value={property.id}>
                      {property.nickname} - {property.legal_address}
                    </option>
                  ))}
                </select>
              </div>

              {selectedProperty && selectedProperty.policy && (
                <div className="p-4 bg-teal/10 border border-teal/20 rounded-xl">
                  <p className="text-xs font-medium text-teal-dark mb-2">
                    Policy Information
                  </p>
                  <p className="text-xs text-navy">
                    <strong>Carrier:</strong> {selectedProperty.policy.carrier}
                  </p>
                  <p className="text-xs text-navy">
                    <strong>Policy #:</strong> {selectedProperty.policy.policy_number}
                  </p>
                </div>
              )}

              <div>
                <label
                  htmlFor="loss_type"
                  className="block text-sm font-medium text-navy mb-2"
                >
                  Loss Type <span className="text-red-500">*</span>
                </label>
                <select
                  id="loss_type"
                  name="loss_type"
                  required
                  value={formData.loss_type}
                  onChange={handleChange}
                  className="glass-input w-full px-4 py-3 rounded-xl text-navy cursor-pointer"
                >
                  <option value="">Select loss type</option>
                  <option value="water">Water</option>
                  <option value="hail">Hail</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="incident_date"
                  className="block text-sm font-medium text-navy mb-2"
                >
                  Incident Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  id="incident_date"
                  name="incident_date"
                  required
                  value={formData.incident_date}
                  onChange={handleChange}
                  max={new Date().toISOString().split('T')[0]}
                  className="glass-input w-full px-4 py-3 rounded-xl text-navy"
                />
              </div>

              <div>
                <label
                  htmlFor="description"
                  className="block text-sm font-medium text-navy mb-2"
                >
                  Description <span className="text-slate">(Optional)</span>
                </label>
                <textarea
                  id="description"
                  name="description"
                  rows={4}
                  value={formData.description}
                  onChange={handleChange}
                  className="glass-input w-full px-4 py-3 rounded-xl text-navy placeholder-slate/50 resize-none"
                  placeholder="Describe what happened..."
                />
              </div>
            </div>

            <div className="px-8 py-6 border-t border-white/20 flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={createClaimMutation.isPending}
                className="btn-secondary px-6 py-3 rounded-xl text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createClaimMutation.isPending || loadingProperties}
                className="btn-primary px-6 py-3 rounded-xl text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {createClaimMutation.isPending ? 'Creating...' : 'Create Claim'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
