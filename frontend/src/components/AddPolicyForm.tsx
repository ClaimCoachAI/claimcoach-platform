import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { Policy } from '../types/claim'

interface AddPolicyFormProps {
  propertyId: string
  onSuccess: () => void
  existingPolicy?: Policy | null
}

export default function AddPolicyForm({
  propertyId,
  onSuccess,
  existingPolicy,
}: AddPolicyFormProps) {
  const queryClient = useQueryClient()
  const [formData, setFormData] = useState({
    carrier_name: existingPolicy?.carrier_name || '',
    carrier_phone: existingPolicy?.carrier_phone || '',
    carrier_email: existingPolicy?.carrier_email || '',
    policy_number: existingPolicy?.policy_number || '',
    deductible_value: existingPolicy?.deductible_value?.toString() || '',
    exclusions: existingPolicy?.exclusions || '',
    effective_date: existingPolicy?.effective_date || '',
    expiration_date: existingPolicy?.expiration_date || '',
  })

  const mutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const payload = {
        carrier_name: data.carrier_name,
        carrier_phone: data.carrier_phone || undefined,
        carrier_email: data.carrier_email || undefined,
        policy_number: data.policy_number || undefined,
        deductible_value: data.deductible_value ? parseFloat(data.deductible_value) : undefined,
        exclusions: data.exclusions || undefined,
        effective_date: data.effective_date || undefined,
        expiration_date: data.expiration_date || undefined,
      }

      const response = await api.post(
        `/api/properties/${propertyId}/policy`,
        payload
      )
      return response.data
    },
    onSuccess: () => {
      // Invalidate all relevant queries to refresh cached data
      queryClient.invalidateQueries({ queryKey: ['policy', propertyId] })
      queryClient.invalidateQueries({ queryKey: ['property', propertyId] })
      queryClient.invalidateQueries({ queryKey: ['properties'] })

      // Wait a bit to ensure backend has committed the transaction
      setTimeout(() => {
        onSuccess()
      }, 100)
    },
    onError: (error: any) => {
      console.error('Policy creation error:', error)
      console.error('Error response:', error?.response?.data)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    mutation.mutate(formData)
  }

  // Helper function to parse backend validation errors into user-friendly messages
  const getErrorMessage = (error: any): string => {
    const backendError = error?.response?.data?.error

    if (!backendError) {
      return error instanceof Error ? error.message : 'An error occurred while saving the policy'
    }

    // Parse validation errors
    if (backendError.includes('DeductibleValue')) {
      if (backendError.includes('required')) {
        return 'Deductible Value is required. Please enter a value.'
      }
      if (backendError.includes('min')) {
        return 'Deductible Value must be 0 or greater.'
      }
    }

    if (backendError.includes('DeductibleType')) {
      return 'Deductible Type is required. Please select either Percentage or Fixed Amount.'
    }

    if (backendError.includes('CarrierName')) {
      return 'Insurance Carrier is required. Please enter the carrier name.'
    }

    // Return the backend error if we can't parse it
    return backendError
  }

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label
          htmlFor="carrier_name"
          className="block text-sm font-medium text-gray-700"
        >
          Insurance Carrier <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          id="carrier_name"
          name="carrier_name"
          required
          value={formData.carrier_name}
          onChange={handleChange}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
          placeholder="e.g., State Farm, Allstate"
        />
      </div>

      <div>
        <label
          htmlFor="policy_number"
          className="block text-sm font-medium text-gray-700"
        >
          Policy Number
        </label>
        <input
          type="text"
          id="policy_number"
          name="policy_number"
          value={formData.policy_number}
          onChange={handleChange}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
          placeholder="Policy number"
        />
      </div>

      <div>
        <label htmlFor="deductible_value" className="block text-sm font-medium text-gray-700">
          Deductible <span className="text-red-500">*</span>
        </label>
        <div className="mt-1 relative rounded-md shadow-sm">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <span className="text-gray-500 sm:text-sm">$</span>
          </div>
          <input
            type="number"
            id="deductible_value"
            name="deductible_value"
            required
            value={formData.deductible_value}
            onChange={handleChange}
            className="block w-full pl-7 pr-3 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            placeholder="10000"
            min="0"
          />
        </div>
      </div>

      <div>
        <label htmlFor="exclusions" className="block text-sm font-medium text-gray-700">
          Exclusions
        </label>
        <textarea
          id="exclusions"
          name="exclusions"
          value={formData.exclusions}
          onChange={(e) => setFormData(prev => ({ ...prev, exclusions: e.target.value }))}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
          placeholder="Enter policy exclusions..."
          rows={4}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="effective_date"
            className="block text-sm font-medium text-gray-700"
          >
            Effective Date
          </label>
          <input
            type="date"
            id="effective_date"
            name="effective_date"
            value={formData.effective_date}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
          />
        </div>

        <div>
          <label
            htmlFor="expiration_date"
            className="block text-sm font-medium text-gray-700"
          >
            Expiration Date
          </label>
          <input
            type="date"
            id="expiration_date"
            name="expiration_date"
            value={formData.expiration_date}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
          />
        </div>
      </div>

      {mutation.isError && (
        <div className="rounded-md bg-red-50 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-red-400"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">
                Error saving policy
              </h3>
              <div className="mt-2 text-sm text-red-700">
                <p>{getErrorMessage(mutation.error)}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {mutation.isSuccess && (
        <div className="rounded-md bg-green-50 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-green-400"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-green-800">
                Policy saved successfully!
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={mutation.isPending}
          className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {mutation.isPending
            ? 'Saving...'
            : existingPolicy
            ? 'Update Policy'
            : 'Save Policy'}
        </button>
      </div>
    </form>
  )
}
