import { useState } from 'react'
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
    <div className="fixed inset-0 z-50 overflow-y-auto animate-fade-in">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div
          className="fixed inset-0 transition-opacity bg-navy/20 backdrop-blur-sm"
          onClick={onClose}
        />

        {/* Modal panel */}
        <div className="inline-block w-full max-w-lg my-8 overflow-hidden text-left align-middle transition-all transform glass-card-strong shadow-2xl rounded-3xl animate-scale-in">
          <form onSubmit={handleSubmit}>
            <div className="px-8 py-6 border-b border-white/20">
              <h3 className="text-2xl font-display font-bold text-navy">
                Add New Property
              </h3>
              <p className="mt-1 text-sm text-slate">Fill in the property details below</p>
            </div>

            <div className="px-8 py-6 space-y-5">
              {createPropertyMutation.isError && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl animate-slide-down">
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
                  className="block text-sm font-medium text-navy mb-2"
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
                  className="glass-input w-full px-4 py-3 rounded-xl text-navy placeholder-slate/50"
                  placeholder="e.g., Downtown Office"
                />
              </div>

              <div>
                <label
                  htmlFor="legal_address"
                  className="block text-sm font-medium text-navy mb-2"
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
                  className="glass-input w-full px-4 py-3 rounded-xl text-navy placeholder-slate/50"
                  placeholder="e.g., 123 Main St, City, State 12345"
                />
              </div>

              <div>
                <label
                  htmlFor="owner_entity_name"
                  className="block text-sm font-medium text-navy mb-2"
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
                  className="glass-input w-full px-4 py-3 rounded-xl text-navy placeholder-slate/50"
                  placeholder="e.g., ABC Properties LLC"
                />
              </div>

              <div>
                <label
                  htmlFor="mortgage_bank_id"
                  className="block text-sm font-medium text-navy mb-2"
                >
                  Mortgage Bank <span className="text-slate">(Optional)</span>
                </label>
                <select
                  id="mortgage_bank_id"
                  name="mortgage_bank_id"
                  value={formData.mortgage_bank_id}
                  onChange={handleChange}
                  className="glass-input w-full px-4 py-3 rounded-xl text-navy cursor-pointer"
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

            <div className="px-8 py-6 border-t border-white/20 flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={createPropertyMutation.isPending}
                className="btn-secondary px-6 py-3 rounded-xl text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createPropertyMutation.isPending}
                className="btn-primary px-6 py-3 rounded-xl text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
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
