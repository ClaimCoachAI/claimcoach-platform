import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'
import Layout from '../components/Layout'
import AddPolicyForm from '../components/AddPolicyForm'

interface Property {
  id: string
  nickname: string
  legal_address: string
  status: string
  owner_entity_name: string
  created_at: string
  updated_at: string
}

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
  created_at: string
  updated_at: string
}

export default function PropertyDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const {
    data: property,
    isLoading: loadingProperty,
    error: propertyError,
  } = useQuery({
    queryKey: ['property', id],
    queryFn: async () => {
      const response = await api.get(`/api/properties/${id}`)
      return response.data.data as Property
    },
    enabled: !!id,
  })

  const {
    data: policy,
    isLoading: loadingPolicy,
    refetch: refetchPolicy,
  } = useQuery({
    queryKey: ['policy', id],
    queryFn: async () => {
      try {
        const response = await api.get(`/api/properties/${id}/policy`)
        return response.data.data as Policy
      } catch (error: any) {
        if (error.response?.status === 404) {
          return null
        }
        throw error
      }
    },
    enabled: !!id,
  })

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft':
        return 'bg-gray-100 text-gray-800'
      case 'active_monitored':
        return 'bg-green-100 text-green-800'
      case 'archived':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'draft':
        return 'Draft'
      case 'active_monitored':
        return 'Active Monitored'
      case 'archived':
        return 'Archived'
      default:
        return status
    }
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  const formatCurrency = (amount?: number) => {
    if (!amount) return 'N/A'
    return `$${amount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`
  }

  const calculateDeductible = (policy: Policy) => {
    if (!policy.deductible_value || !policy.coverage_a_limit) return null
    if (policy.deductible_type === 'percentage') {
      return (policy.coverage_a_limit * policy.deductible_value) / 100
    }
    return policy.deductible_value
  }

  if (loadingProperty || loadingPolicy) {
    return (
      <Layout>
        <div className="flex justify-center items-center py-12">
          <div className="text-gray-600">Loading property details...</div>
        </div>
      </Layout>
    )
  }

  if (propertyError || !property) {
    return (
      <Layout>
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
                Property not found
              </h3>
              <div className="mt-2 text-sm text-red-700">
                <p>The property you are looking for does not exist.</p>
              </div>
              <div className="mt-4">
                <button
                  onClick={() => navigate('/properties')}
                  className="text-sm font-medium text-red-800 hover:text-red-900"
                >
                  Back to Properties
                </button>
              </div>
            </div>
          </div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate('/properties')}
            className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900"
          >
            <svg
              className="w-5 h-5 mr-1"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Back to Properties
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            <div className="bg-white shadow rounded-lg overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium text-gray-900">
                    Property Details
                  </h3>
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(
                      property.status
                    )}`}
                  >
                    {getStatusLabel(property.status)}
                  </span>
                </div>
              </div>
              <div className="px-6 py-5 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-500">
                    Property Name
                  </label>
                  <p className="mt-1 text-sm text-gray-900">
                    {property.nickname}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500">
                    Address
                  </label>
                  <p className="mt-1 text-sm text-gray-900">
                    {property.legal_address}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500">
                    Owner Entity
                  </label>
                  <p className="mt-1 text-sm text-gray-900">
                    {property.owner_entity_name}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500">
                    Created
                  </label>
                  <p className="mt-1 text-sm text-gray-900">
                    {formatDate(property.created_at)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white shadow rounded-lg overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">
                  Insurance Policy
                </h3>
              </div>
              <div className="px-6 py-5">
                {policy ? (
                  <div className="space-y-4">
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
                            Policy information on file
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-500">
                          Insurance Carrier
                        </label>
                        <p className="mt-1 text-sm text-gray-900">
                          {policy.carrier_name}
                        </p>
                      </div>

                      {policy.policy_number && (
                        <div>
                          <label className="block text-sm font-medium text-gray-500">
                            Policy Number
                          </label>
                          <p className="mt-1 text-sm text-gray-900">
                            {policy.policy_number}
                          </p>
                        </div>
                      )}

                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-500">
                            Coverage A
                          </label>
                          <p className="mt-1 text-sm text-gray-900">
                            {formatCurrency(policy.coverage_a_limit)}
                          </p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-500">
                            Coverage B
                          </label>
                          <p className="mt-1 text-sm text-gray-900">
                            {formatCurrency(policy.coverage_b_limit)}
                          </p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-500">
                            Coverage D
                          </label>
                          <p className="mt-1 text-sm text-gray-900">
                            {formatCurrency(policy.coverage_d_limit)}
                          </p>
                        </div>
                      </div>

                      {policy.deductible_type && policy.deductible_value && (
                        <div>
                          <label className="block text-sm font-medium text-gray-500">
                            Deductible
                          </label>
                          <p className="mt-1 text-sm text-gray-900">
                            {policy.deductible_type === 'percentage'
                              ? `${policy.deductible_value}%`
                              : formatCurrency(policy.deductible_value)}
                            {calculateDeductible(policy) && (
                              <span className="text-gray-500 ml-2">
                                ({formatCurrency(calculateDeductible(policy)!)})
                              </span>
                            )}
                          </p>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-500">
                            Effective Date
                          </label>
                          <p className="mt-1 text-sm text-gray-900">
                            {formatDate(policy.effective_date)}
                          </p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-500">
                            Expiration Date
                          </label>
                          <p className="mt-1 text-sm text-gray-900">
                            {formatDate(policy.expiration_date)}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-gray-200">
                      <h4 className="text-sm font-medium text-gray-900 mb-4">
                        Update Policy Information
                      </h4>
                      <AddPolicyForm
                        propertyId={property.id}
                        existingPolicy={policy}
                        onSuccess={() => refetchPolicy()}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="rounded-md bg-yellow-50 p-4">
                      <div className="flex">
                        <div className="flex-shrink-0">
                          <svg
                            className="h-5 w-5 text-yellow-400"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </div>
                        <div className="ml-3">
                          <h3 className="text-sm font-medium text-yellow-800">
                            No Policy Information
                          </h3>
                          <div className="mt-2 text-sm text-yellow-700">
                            <p>
                              Add insurance policy information to activate
                              monitoring for this property.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <AddPolicyForm
                      propertyId={property.id}
                      onSuccess={() => refetchPolicy()}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
