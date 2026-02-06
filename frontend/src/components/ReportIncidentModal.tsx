import { useState, useEffect } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import api from '../lib/api'

interface ReportIncidentModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

interface Property {
  id: string
  nickname: string
  legal_address: string
  policy?: {
    policy_number: string
    carrier: string
  }
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
}: ReportIncidentModalProps) {
  const [formData, setFormData] = useState<ClaimFormData>({
    property_id: '',
    loss_type: '',
    incident_date: '',
    description: '',
  })

  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null)

  // Fetch properties for dropdown
  const { data: properties, isLoading: loadingProperties } = useQuery({
    queryKey: ['properties'],
    queryFn: async () => {
      const response = await api.get('/api/properties')
      return response.data.data as Property[]
    },
    enabled: isOpen, // Only fetch when modal is open
  })

  const createClaimMutation = useMutation({
    mutationFn: async (data: ClaimFormData) => {
      const payload = {
        ...data,
        description: data.description || undefined,
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

    // Update selected property when property_id changes
    if (name === 'property_id' && properties) {
      const property = properties.find((p) => p.id === value)
      setSelectedProperty(property || null)
    }
  }

  // Reset form when modal closes
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

  // Handle Escape key to close modal
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
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div
          className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75"
          onClick={onClose}
        />

        {/* Modal panel */}
        <div className="inline-block w-full max-w-lg my-8 overflow-hidden text-left align-middle transition-all transform bg-white shadow-xl rounded-lg">
          <form onSubmit={handleSubmit}>
            <div className="px-6 py-4 bg-white border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">
                Report Incident
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                Start a new claim by providing incident details
              </p>
            </div>

            <div className="px-6 py-4 space-y-4">
              {createClaimMutation.isError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-sm text-red-700">
                    {(createClaimMutation.error as any)?.response?.data?.error ||
                      (createClaimMutation.error instanceof Error
                        ? createClaimMutation.error.message
                        : 'Failed to create claim. Please try again.')}
                  </p>
                </div>
              )}

              {/* Property Selection */}
              <div>
                <label
                  htmlFor="property_id"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Property <span className="text-red-500">*</span>
                </label>
                <select
                  id="property_id"
                  name="property_id"
                  required
                  value={formData.property_id}
                  onChange={handleChange}
                  disabled={loadingProperties}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
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

              {/* Show property info if selected */}
              {selectedProperty && selectedProperty.policy && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                  <p className="text-xs font-medium text-blue-900 mb-1">
                    Policy Information
                  </p>
                  <p className="text-xs text-blue-700">
                    <strong>Carrier:</strong> {selectedProperty.policy.carrier}
                  </p>
                  <p className="text-xs text-blue-700">
                    <strong>Policy #:</strong> {selectedProperty.policy.policy_number}
                  </p>
                </div>
              )}

              {/* Loss Type */}
              <div>
                <label
                  htmlFor="loss_type"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Loss Type <span className="text-red-500">*</span>
                </label>
                <select
                  id="loss_type"
                  name="loss_type"
                  required
                  value={formData.loss_type}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select loss type</option>
                  <option value="fire">Fire</option>
                  <option value="water">Water</option>
                  <option value="wind">Wind</option>
                  <option value="hail">Hail</option>
                  <option value="other">Other</option>
                </select>
              </div>

              {/* Incident Date */}
              <div>
                <label
                  htmlFor="incident_date"
                  className="block text-sm font-medium text-gray-700 mb-1"
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Description */}
              <div>
                <label
                  htmlFor="description"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Description <span className="text-gray-400">(Optional)</span>
                </label>
                <textarea
                  id="description"
                  name="description"
                  rows={4}
                  value={formData.description}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Describe what happened..."
                />
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={createClaimMutation.isPending}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createClaimMutation.isPending || loadingProperties}
                className="px-4 py-2 bg-blue-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
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
