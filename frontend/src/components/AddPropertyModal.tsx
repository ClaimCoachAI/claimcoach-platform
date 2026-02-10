import { useState, useEffect } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import api from '../lib/api'

interface AddPropertyModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

interface PropertyFormData {
  nickname: string
  legal_address: string
  owner_entity_name: string
  mortgage_bank_id: string
}

interface MortgageBank {
  id: string
  name: string
  endorsement_required: boolean
}

export default function AddPropertyModal({
  isOpen,
  onClose,
  onSuccess,
}: AddPropertyModalProps) {
  const [formData, setFormData] = useState<PropertyFormData>({
    nickname: '',
    legal_address: '',
    owner_entity_name: '',
    mortgage_bank_id: '',
  })

  // Fetch mortgage banks
  const { data: mortgageBanks } = useQuery({
    queryKey: ['mortgage-banks'],
    queryFn: async () => {
      const response = await api.get('/api/mortgage-banks')
      return response.data.data as MortgageBank[]
    },
  })

  const createPropertyMutation = useMutation({
    mutationFn: async (data: PropertyFormData) => {
      const payload = {
        ...data,
        mortgage_bank_id: data.mortgage_bank_id || undefined,
      }
      const response = await api.post('/api/properties', payload)
      return response.data
    },
    onSuccess: () => {
      setFormData({
        nickname: '',
        legal_address: '',
        owner_entity_name: '',
        mortgage_bank_id: '',
      })
      onSuccess()
      onClose()
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createPropertyMutation.mutate(formData)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    })
  }

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
        <div className="inline-block w-full max-w-md my-8 overflow-hidden text-left align-middle transition-all transform bg-white shadow-xl rounded-lg">
          <form onSubmit={handleSubmit}>
            <div className="px-6 py-4 bg-white border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">
                Add New Property
              </h3>
            </div>

            <div className="px-6 py-4 space-y-4">
              {createPropertyMutation.isError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-sm text-red-700">
                    {createPropertyMutation.error instanceof Error
                      ? createPropertyMutation.error.message
                      : 'Failed to create property. Please try again.'}
                  </p>
                </div>
              )}

              <div>
                <label
                  htmlFor="nickname"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Property Nickname <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="nickname"
                  name="nickname"
                  required
                  value={formData.nickname}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., Downtown Office"
                />
              </div>

              <div>
                <label
                  htmlFor="legal_address"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Legal Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="legal_address"
                  name="legal_address"
                  required
                  value={formData.legal_address}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., 123 Main St, City, State 12345"
                />
              </div>

              <div>
                <label
                  htmlFor="owner_entity_name"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Owner Entity Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="owner_entity_name"
                  name="owner_entity_name"
                  required
                  value={formData.owner_entity_name}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., ABC Properties LLC"
                />
              </div>

              <div>
                <label
                  htmlFor="mortgage_bank_id"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Mortgage Bank <span className="text-gray-400">(Optional)</span>
                </label>
                <select
                  id="mortgage_bank_id"
                  name="mortgage_bank_id"
                  value={formData.mortgage_bank_id}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select a bank (optional)</option>
                  {mortgageBanks?.map((bank) => (
                    <option key={bank.id} value={bank.id}>
                      {bank.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={createPropertyMutation.isPending}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createPropertyMutation.isPending}
                className="px-4 py-2 bg-blue-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {createPropertyMutation.isPending ? 'Creating...' : 'Create Property'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
