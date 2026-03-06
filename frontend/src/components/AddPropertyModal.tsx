import { useState, useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import api from '../lib/api'
import { Property } from '../types/claim'

interface AddPropertyModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  /** When provided, the modal switches to edit mode */
  editProperty?: Property
}

interface PropertyFormData {
  nickname: string
  legal_address: string
  owner_entity_name: string
}

export default function AddPropertyModal({
  isOpen,
  onClose,
  onSuccess,
  editProperty,
}: AddPropertyModalProps) {
  const isEdit = Boolean(editProperty)

  const [formData, setFormData] = useState<PropertyFormData>({
    nickname: '',
    legal_address: '',
    owner_entity_name: '',
  })

  // Pre-fill form when editing
  useEffect(() => {
    if (editProperty) {
      setFormData({
        nickname: editProperty.nickname,
        legal_address: editProperty.legal_address,
        owner_entity_name: editProperty.owner_entity_name,
      })
    } else {
      setFormData({ nickname: '', legal_address: '', owner_entity_name: '' })
    }
  }, [editProperty, isOpen])

  const createMutation = useMutation({
    mutationFn: async (data: PropertyFormData) => {
      const response = await api.post('/api/properties', data)
      return response.data
    },
    onSuccess: () => {
      setFormData({ nickname: '', legal_address: '', owner_entity_name: '' })
      onSuccess()
      onClose()
    },
  })

  const updateMutation = useMutation({
    mutationFn: async (data: PropertyFormData) => {
      const response = await api.patch(`/api/properties/${editProperty!.id}`, data)
      return response.data
    },
    onSuccess: () => {
      onSuccess()
      onClose()
    },
  })

  const mutation = isEdit ? updateMutation : createMutation
  const isPending = mutation.isPending

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    mutation.mutate(formData)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
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
                {isEdit ? 'Edit Property' : 'Add New Property'}
              </h3>
              <p className="mt-1 text-sm text-slate">
                {isEdit ? 'Update the property details below' : 'Fill in the property details below'}
              </p>
            </div>

            <div className="px-8 py-6 space-y-5">
              {mutation.isError && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl animate-slide-down">
                  <p className="text-sm text-red-700">
                    {mutation.error instanceof Error
                      ? mutation.error.message
                      : `Failed to ${isEdit ? 'update' : 'create'} property. Please try again.`}
                  </p>
                </div>
              )}

              <div>
                <label htmlFor="nickname" className="block text-sm font-medium text-navy mb-2">
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
                <label htmlFor="legal_address" className="block text-sm font-medium text-navy mb-2">
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
                <label htmlFor="owner_entity_name" className="block text-sm font-medium text-navy mb-2">
                  Owner Entity Name
                </label>
                <input
                  type="text"
                  id="owner_entity_name"
                  name="owner_entity_name"
                  value={formData.owner_entity_name}
                  onChange={handleChange}
                  className="glass-input w-full px-4 py-3 rounded-xl text-navy placeholder-slate/50"
                  placeholder="e.g., Smith Holdings LLC"
                />
              </div>
            </div>

            <div className="px-8 py-6 border-t border-white/20 flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isPending}
                className="btn-secondary px-6 py-3 rounded-xl text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="btn-primary px-6 py-3 rounded-xl text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPending
                  ? isEdit ? 'Saving...' : 'Creating...'
                  : isEdit ? 'Save Changes' : 'Create Property'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
