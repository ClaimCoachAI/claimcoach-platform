import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'

interface Policy {
  id: string
  property_id: string
  carrier_name: string
  policy_number?: string
  coverage_a_limit?: number
  coverage_b_limit?: number
  coverage_d_limit?: number
  deductible_type?: 'percentage' | 'fixed'
  deductible_value?: number
  effective_date?: string
  expiration_date?: string
}

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
    policy_number: existingPolicy?.policy_number || '',
    coverage_a_limit: existingPolicy?.coverage_a_limit?.toString() || '',
    coverage_b_limit: existingPolicy?.coverage_b_limit?.toString() || '',
    coverage_d_limit: existingPolicy?.coverage_d_limit?.toString() || '',
    deductible_type: existingPolicy?.deductible_type || 'percentage',
    deductible_value: existingPolicy?.deductible_value?.toString() || '',
    effective_date: existingPolicy?.effective_date || '',
    expiration_date: existingPolicy?.expiration_date || '',
  })

  const [calculatedDeductible, setCalculatedDeductible] = useState<number | null>(
    null
  )

  useEffect(() => {
    const coverageA = parseFloat(formData.coverage_a_limit)
    const deductibleValue = parseFloat(formData.deductible_value)

    if (!isNaN(coverageA) && !isNaN(deductibleValue) && coverageA > 0) {
      if (formData.deductible_type === 'percentage') {
        setCalculatedDeductible((coverageA * deductibleValue) / 100)
      } else {
        setCalculatedDeductible(deductibleValue)
      }
    } else {
      setCalculatedDeductible(null)
    }
  }, [
    formData.coverage_a_limit,
    formData.deductible_value,
    formData.deductible_type,
  ])

  const mutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const payload = {
        carrier_name: data.carrier_name,
        policy_number: data.policy_number || undefined,
        coverage_a_limit: data.coverage_a_limit
          ? parseFloat(data.coverage_a_limit)
          : undefined,
        coverage_b_limit: data.coverage_b_limit
          ? parseFloat(data.coverage_b_limit)
          : undefined,
        coverage_d_limit: data.coverage_d_limit
          ? parseFloat(data.coverage_d_limit)
          : undefined,
        deductible_type: data.deductible_type || undefined,
        deductible_value: data.deductible_value
          ? parseFloat(data.deductible_value)
          : undefined,
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
      queryClient.invalidateQueries({ queryKey: ['policy', propertyId] })
      queryClient.invalidateQueries({ queryKey: ['property', propertyId] })
      queryClient.invalidateQueries({ queryKey: ['properties'] })
      onSuccess()
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    mutation.mutate(formData)
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label
            htmlFor="coverage_a_limit"
            className="block text-sm font-medium text-gray-700"
          >
            Coverage A Limit
          </label>
          <div className="mt-1 relative rounded-md shadow-sm">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <span className="text-gray-500 sm:text-sm">$</span>
            </div>
            <input
              type="number"
              id="coverage_a_limit"
              name="coverage_a_limit"
              value={formData.coverage_a_limit}
              onChange={handleChange}
              className="block w-full pl-7 pr-3 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              placeholder="0"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="coverage_b_limit"
            className="block text-sm font-medium text-gray-700"
          >
            Coverage B Limit
          </label>
          <div className="mt-1 relative rounded-md shadow-sm">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <span className="text-gray-500 sm:text-sm">$</span>
            </div>
            <input
              type="number"
              id="coverage_b_limit"
              name="coverage_b_limit"
              value={formData.coverage_b_limit}
              onChange={handleChange}
              className="block w-full pl-7 pr-3 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              placeholder="0"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="coverage_d_limit"
            className="block text-sm font-medium text-gray-700"
          >
            Coverage D Limit
          </label>
          <div className="mt-1 relative rounded-md shadow-sm">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <span className="text-gray-500 sm:text-sm">$</span>
            </div>
            <input
              type="number"
              id="coverage_d_limit"
              name="coverage_d_limit"
              value={formData.coverage_d_limit}
              onChange={handleChange}
              className="block w-full pl-7 pr-3 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              placeholder="0"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="deductible_type"
            className="block text-sm font-medium text-gray-700"
          >
            Deductible Type
          </label>
          <select
            id="deductible_type"
            name="deductible_type"
            value={formData.deductible_type}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
          >
            <option value="percentage">Percentage</option>
            <option value="fixed">Fixed Amount</option>
          </select>
        </div>

        <div>
          <label
            htmlFor="deductible_value"
            className="block text-sm font-medium text-gray-700"
          >
            Deductible Value
          </label>
          <div className="mt-1 relative rounded-md shadow-sm">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <span className="text-gray-500 sm:text-sm">
                {formData.deductible_type === 'percentage' ? '%' : '$'}
              </span>
            </div>
            <input
              type="number"
              id="deductible_value"
              name="deductible_value"
              value={formData.deductible_value}
              onChange={handleChange}
              className="block w-full pl-7 pr-3 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              placeholder="0"
              step={formData.deductible_type === 'percentage' ? '0.1' : '1'}
            />
          </div>
        </div>
      </div>

      {calculatedDeductible !== null && (
        <div className="rounded-md bg-blue-50 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-blue-400"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-blue-800">
                Calculated Deductible
              </h3>
              <div className="mt-2 text-sm text-blue-700">
                <p>
                  ${calculatedDeductible.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

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
                <p>
                  {mutation.error instanceof Error
                    ? mutation.error.message
                    : 'An error occurred while saving the policy'}
                </p>
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
