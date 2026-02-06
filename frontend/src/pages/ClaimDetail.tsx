import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import Layout from '../components/Layout'
import ClaimStatusBadge from '../components/ClaimStatusBadge'

interface Property {
  id: string
  nickname: string
  legal_address: string
  owner_entity_name: string
}

interface Policy {
  id: string
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

interface Claim {
  id: string
  claim_number: string | null
  property_id: string
  property?: Property
  policy?: Policy
  loss_type: string
  status: string
  incident_date: string
  filed_at?: string
  description?: string
  created_at: string
  updated_at: string
}

interface Document {
  id: string
  claim_id: string
  document_type: string
  file_name: string
  uploaded_by: string
  uploaded_at: string
}

interface Activity {
  id: string
  claim_id: string
  activity_type: string
  description: string
  user_name?: string
  created_at: string
}

// Status flow validation
const STATUS_TRANSITIONS: { [key: string]: string[] } = {
  draft: ['assessing', 'filed'],
  assessing: ['filed'],
  filed: ['field_scheduled', 'audit_pending'],
  field_scheduled: ['audit_pending'],
  audit_pending: ['negotiating'],
  negotiating: ['settled'],
  settled: ['closed'],
  closed: [],
}

export default function ClaimDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [selectedStatus, setSelectedStatus] = useState<string>('')
  const [showSuccessMessage, setShowSuccessMessage] = useState(false)

  // Fetch claim details
  const {
    data: claim,
    isLoading: loadingClaim,
    isError: isClaimError,
    error: claimError,
  } = useQuery({
    queryKey: ['claim', id],
    queryFn: async () => {
      const response = await api.get(`/api/claims/${id}`)
      return response.data.data as Claim
    },
    enabled: !!id,
  })

  // Fetch documents
  const {
    data: documents,
    isLoading: loadingDocuments,
  } = useQuery({
    queryKey: ['claim-documents', id],
    queryFn: async () => {
      const response = await api.get(`/api/claims/${id}/documents`)
      return response.data.data as Document[]
    },
    enabled: !!id,
  })

  // Fetch activities
  const {
    data: activities,
    isLoading: loadingActivities,
  } = useQuery({
    queryKey: ['claim-activities', id],
    queryFn: async () => {
      const response = await api.get(`/api/claims/${id}/activities`)
      return response.data.data as Activity[]
    },
    enabled: !!id,
  })

  // Status update mutation
  const statusMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      const response = await api.patch(`/api/claims/${id}/status`, {
        status: newStatus,
      })
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['claim', id] })
      queryClient.invalidateQueries({ queryKey: ['claim-activities', id] })
      setShowSuccessMessage(true)
      setSelectedStatus('')
      setTimeout(() => setShowSuccessMessage(false), 3000)
    },
  })

  // Document download handler
  const handleDocumentDownload = async (documentId: string) => {
    try {
      const response = await api.get(`/api/documents/${documentId}`)
      const downloadUrl = response.data.data.download_url
      window.open(downloadUrl, '_blank')
    } catch (error) {
      console.error('Failed to download document:', error)
      alert('Failed to download document. Please try again.')
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

  const formatDateTime = (dateString?: string) => {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
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

  const getLossTypeLabel = (lossType: string) => {
    const labels: { [key: string]: string } = {
      fire: 'Fire',
      water: 'Water',
      wind: 'Wind',
      hail: 'Hail',
      other: 'Other',
    }
    return labels[lossType] || lossType
  }

  const getLossTypeIcon = (lossType: string) => {
    switch (lossType) {
      case 'fire':
        return (
          <svg
            className="w-6 h-6 text-red-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z"
            />
          </svg>
        )
      case 'water':
        return (
          <svg
            className="w-6 h-6 text-blue-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
            />
          </svg>
        )
      case 'wind':
        return (
          <svg
            className="w-6 h-6 text-gray-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        )
      case 'hail':
        return (
          <svg
            className="w-6 h-6 text-indigo-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
            />
          </svg>
        )
      default:
        return (
          <svg
            className="w-6 h-6 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        )
    }
  }

  const getDocumentTypeLabel = (type: string) => {
    const labels: { [key: string]: string } = {
      photo: 'Photo',
      estimate: 'Estimate',
      invoice: 'Invoice',
      correspondence: 'Correspondence',
      policy_doc: 'Policy Document',
      other: 'Other',
    }
    return labels[type] || type
  }

  const getActivityIcon = (activityType: string) => {
    switch (activityType) {
      case 'claim_created':
        return (
          <div className="bg-blue-100 rounded-full p-2">
            <svg
              className="w-5 h-5 text-blue-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
        )
      case 'status_changed':
        return (
          <div className="bg-purple-100 rounded-full p-2">
            <svg
              className="w-5 h-5 text-purple-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
              />
            </svg>
          </div>
        )
      case 'document_uploaded':
        return (
          <div className="bg-green-100 rounded-full p-2">
            <svg
              className="w-5 h-5 text-green-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
          </div>
        )
      default:
        return (
          <div className="bg-gray-100 rounded-full p-2">
            <svg
              className="w-5 h-5 text-gray-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
        )
    }
  }

  // Handle loading state
  if (loadingClaim) {
    return (
      <Layout>
        <div className="flex justify-center items-center py-12">
          <div className="text-gray-600">Loading claim details...</div>
        </div>
      </Layout>
    )
  }

  // Handle error state (404 or other errors)
  if (isClaimError || !claim) {
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
                Claim not found
              </h3>
              <div className="mt-2 text-sm text-red-700">
                <p>
                  {claimError instanceof Error
                    ? claimError.message
                    : 'The claim you are looking for does not exist.'}
                </p>
              </div>
              <div className="mt-4">
                <button
                  onClick={() => navigate('/claims')}
                  className="text-sm font-medium text-red-800 hover:text-red-900"
                >
                  Back to Claims
                </button>
              </div>
            </div>
          </div>
        </div>
      </Layout>
    )
  }

  const availableStatuses = STATUS_TRANSITIONS[claim.status] || []

  return (
    <Layout>
      <div className="space-y-6">
        {/* Success Message */}
        {showSuccessMessage && (
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
                  Claim status updated successfully
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Breadcrumb */}
        <nav className="text-sm text-gray-500">
          <ol className="flex items-center space-x-2">
            <li>
              <button
                onClick={() => navigate('/claims')}
                className="hover:text-gray-700"
              >
                Claims
              </button>
            </li>
            <li>
              <span className="mx-2">/</span>
            </li>
            <li>
              {claim.property && (
                <span className="hover:text-gray-700">{claim.property.nickname}</span>
              )}
            </li>
            <li>
              <span className="mx-2">/</span>
            </li>
            <li className="text-gray-900 font-medium">
              {claim.claim_number || 'Draft'}
            </li>
          </ol>
        </nav>

        {/* Claim Header */}
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-4 mb-4">
                <button
                  onClick={() => navigate('/claims')}
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
                  Back to Claims
                </button>
              </div>

              {claim.property && (
                <div className="mb-4">
                  <h1 className="text-2xl font-bold text-gray-900 mb-1">
                    {claim.property.nickname}
                  </h1>
                  <p className="text-gray-600">{claim.property.legal_address}</p>
                </div>
              )}

              <div className="flex items-center gap-6 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-500">
                    Claim Number:
                  </span>
                  {claim.claim_number ? (
                    <span className="text-sm font-semibold text-gray-900">
                      {claim.claim_number}
                    </span>
                  ) : (
                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                      Draft
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {getLossTypeIcon(claim.loss_type)}
                  <span className="text-sm text-gray-600">
                    <strong>Loss Type:</strong> {getLossTypeLabel(claim.loss_type)}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-500">Status:</span>
                  <ClaimStatusBadge status={claim.status} />
                </div>

                <div className="flex items-center gap-2">
                  <svg
                    className="w-5 h-5 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  <span className="text-sm text-gray-600">
                    <strong>Incident Date:</strong> {formatDate(claim.incident_date)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Status Management Card */}
            <div className="bg-white shadow rounded-lg">
              <div className="px-6 py-5 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">
                  Status Management
                </h3>
              </div>
              <div className="px-6 py-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Current Status
                    </label>
                    <div className="text-lg">
                      <ClaimStatusBadge status={claim.status} />
                    </div>
                  </div>

                  {claim.filed_at && (
                    <div className="text-right">
                      <label className="block text-sm font-medium text-gray-500">
                        Filed On
                      </label>
                      <p className="text-sm text-gray-900">
                        {formatDate(claim.filed_at)}
                      </p>
                    </div>
                  )}
                </div>

                {availableStatuses.length > 0 ? (
                  <div className="pt-4 border-t border-gray-200">
                    <label
                      htmlFor="statusUpdate"
                      className="block text-sm font-medium text-gray-700 mb-2"
                    >
                      Update Status
                    </label>
                    <div className="flex gap-3">
                      <select
                        id="statusUpdate"
                        value={selectedStatus}
                        onChange={(e) => setSelectedStatus(e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="">Select new status...</option>
                        {availableStatuses.map((status) => (
                          <option key={status} value={status}>
                            {status.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => selectedStatus && statusMutation.mutate(selectedStatus)}
                        disabled={!selectedStatus || statusMutation.isPending}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                      >
                        {statusMutation.isPending ? 'Updating...' : 'Update Status'}
                      </button>
                    </div>
                    {statusMutation.isError && (
                      <p className="mt-2 text-sm text-red-600">
                        Failed to update status. Please try again.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="pt-4 border-t border-gray-200">
                    <div className="rounded-md bg-gray-50 p-4">
                      <p className="text-sm text-gray-600">
                        {claim.status === 'closed'
                          ? 'This claim is closed and cannot be updated.'
                          : 'No status transitions available at this time.'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Documents Section */}
            <div className="bg-white shadow rounded-lg">
              <div className="px-6 py-5 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">Documents</h3>
              </div>
              <div className="px-6 py-5">
                {loadingDocuments ? (
                  <div className="text-center py-4 text-gray-600">
                    Loading documents...
                  </div>
                ) : documents && documents.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Type
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            File Name
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Uploaded By
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Upload Date
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {documents.map((doc) => (
                          <tr key={doc.id} className="hover:bg-gray-50">
                            <td className="px-4 py-4 whitespace-nowrap">
                              <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                                {getDocumentTypeLabel(doc.document_type)}
                              </span>
                            </td>
                            <td className="px-4 py-4 text-sm text-gray-900">
                              {doc.file_name}
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600">
                              {doc.uploaded_by}
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600">
                              {formatDate(doc.uploaded_at)}
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm">
                              <button
                                onClick={() => handleDocumentDownload(doc.id)}
                                className="text-blue-600 hover:text-blue-800 font-medium"
                              >
                                Download
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <svg
                      className="mx-auto h-12 w-12 text-gray-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                      />
                    </svg>
                    <h3 className="mt-2 text-sm font-medium text-gray-900">
                      No documents uploaded yet
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">
                      Documents will appear here once uploaded.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Activity Timeline */}
            <div className="bg-white shadow rounded-lg">
              <div className="px-6 py-5 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">
                  Activity Timeline
                </h3>
              </div>
              <div className="px-6 py-5">
                {loadingActivities ? (
                  <div className="text-center py-4 text-gray-600">
                    Loading activities...
                  </div>
                ) : activities && activities.length > 0 ? (
                  <div className="flow-root">
                    <ul className="-mb-8">
                      {activities.map((activity, idx) => (
                        <li key={activity.id}>
                          <div className="relative pb-8">
                            {idx !== activities.length - 1 && (
                              <span
                                className="absolute top-10 left-5 -ml-px h-full w-0.5 bg-gray-200"
                                aria-hidden="true"
                              />
                            )}
                            <div className="relative flex items-start space-x-3">
                              <div className="relative">
                                {getActivityIcon(activity.activity_type)}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div>
                                  <div className="text-sm">
                                    <span className="font-medium text-gray-900">
                                      {activity.user_name || 'System'}
                                    </span>
                                  </div>
                                  <p className="mt-0.5 text-sm text-gray-500">
                                    {formatDateTime(activity.created_at)}
                                  </p>
                                </div>
                                <div className="mt-2 text-sm text-gray-700">
                                  <p>{activity.description}</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <svg
                      className="mx-auto h-12 w-12 text-gray-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <h3 className="mt-2 text-sm font-medium text-gray-900">
                      No activity yet
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">
                      Activity will appear here as the claim progresses.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column - Sidebar */}
          <div className="lg:col-span-1">
            {/* Property & Policy Card */}
            <div className="bg-white shadow rounded-lg sticky top-6">
              <div className="px-6 py-5 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">
                  Property & Policy
                </h3>
              </div>
              <div className="px-6 py-5 space-y-6">
                {/* Property Details */}
                {claim.property && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 mb-3">
                      Property Details
                    </h4>
                    <div className="space-y-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-500">
                          Property Name
                        </label>
                        <p className="text-sm text-gray-900">
                          {claim.property.nickname}
                        </p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500">
                          Address
                        </label>
                        <p className="text-sm text-gray-900">
                          {claim.property.legal_address}
                        </p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500">
                          Owner Entity
                        </label>
                        <p className="text-sm text-gray-900">
                          {claim.property.owner_entity_name}
                        </p>
                      </div>
                      <div className="pt-2">
                        <button
                          onClick={() => navigate(`/properties/${claim.property_id}`)}
                          className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                        >
                          View Property Details
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Policy Details */}
                {claim.policy && (
                  <div className="pt-6 border-t border-gray-200">
                    <h4 className="text-sm font-medium text-gray-900 mb-3">
                      Policy Information
                    </h4>
                    <div className="space-y-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-500">
                          Carrier
                        </label>
                        <p className="text-sm text-gray-900">
                          {claim.policy.carrier_name}
                        </p>
                      </div>
                      {claim.policy.policy_number && (
                        <div>
                          <label className="block text-xs font-medium text-gray-500">
                            Policy Number
                          </label>
                          <p className="text-sm text-gray-900">
                            {claim.policy.policy_number}
                          </p>
                        </div>
                      )}
                      {claim.policy.coverage_a_limit && (
                        <div>
                          <label className="block text-xs font-medium text-gray-500">
                            Coverage Limits
                          </label>
                          <div className="text-sm text-gray-900 space-y-1">
                            <div className="flex justify-between">
                              <span>Coverage A:</span>
                              <span className="font-medium">
                                {formatCurrency(claim.policy.coverage_a_limit)}
                              </span>
                            </div>
                            {claim.policy.coverage_b_limit && (
                              <div className="flex justify-between">
                                <span>Coverage B:</span>
                                <span className="font-medium">
                                  {formatCurrency(claim.policy.coverage_b_limit)}
                                </span>
                              </div>
                            )}
                            {claim.policy.coverage_d_limit && (
                              <div className="flex justify-between">
                                <span>Coverage D:</span>
                                <span className="font-medium">
                                  {formatCurrency(claim.policy.coverage_d_limit)}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      {claim.policy.deductible_type && claim.policy.deductible_value && (
                        <div>
                          <label className="block text-xs font-medium text-gray-500">
                            Deductible
                          </label>
                          <p className="text-sm text-gray-900">
                            {claim.policy.deductible_type === 'percentage'
                              ? `${claim.policy.deductible_value}%`
                              : formatCurrency(claim.policy.deductible_value)}
                            {calculateDeductible(claim.policy) && (
                              <span className="text-gray-500 ml-1">
                                ({formatCurrency(calculateDeductible(claim.policy)!)})
                              </span>
                            )}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {!claim.policy && (
                  <div className="pt-6 border-t border-gray-200">
                    <div className="rounded-md bg-yellow-50 p-3">
                      <p className="text-xs text-yellow-800">
                        No policy information available for this property.
                      </p>
                    </div>
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
