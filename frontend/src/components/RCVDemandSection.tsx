import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tantml:invoke>
<parameter name="name">api'

interface RCVDemandLetter {
  id: string
  claim_id: string
  payment_id: string | null
  content: string
  acv_received: number | null
  rcv_expected: number | null
  rcv_outstanding: number | null
  created_by_user_id: string
  created_at: string
  updated_at: string
  sent_at: string | null
  sent_to_email: string | null
}

interface PaymentSummary {
  TotalACVReceived: number
  TotalRCVReceived: number
  ExpectedACV: number
  ExpectedRCV: number
  ACVDelta: number
  RCVDelta: number
  FullyReconciled: boolean
  HasDisputes: boolean
}

interface RCVDemandSectionProps {
  claimId: string
}

export default function RCVDemandSection({ claimId }: RCVDemandSectionProps) {
  const queryClient = useQueryClient()
  const [showMarkSentModal, setShowMarkSentModal] = useState(false)
  const [selectedLetter, setSelectedLetter] = useState<RCVDemandLetter | null>(null)

  // Fetch payment summary to check if RCV is outstanding
  const { data: summary } = useQuery<PaymentSummary>({
    queryKey: ['payment-summary', claimId],
    queryFn: async () => {
      const response = await api.get(`/api/claims/${claimId}/payment-summary`)
      return response.data.data
    },
  })

  // Fetch RCV demand letters
  const { data: letters, isLoading } = useQuery<RCVDemandLetter[]>({
    queryKey: ['rcv-demand', claimId],
    queryFn: async () => {
      const response = await api.get(`/api/claims/${claimId}/rcv-demand`)
      return response.data.data || []
    },
  })

  // Generate RCV demand letter mutation
  const generateMutation = useMutation({
    mutationFn: () => api.post(`/api/claims/${claimId}/rcv-demand/generate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rcv-demand', claimId] })
      queryClient.invalidateQueries({ queryKey: ['claim-activities', claimId] })
    },
  })

  // Mark as sent mutation
  const markSentMutation = useMutation({
    mutationFn: ({ letterId, sent_to_email }: { letterId: string; sent_to_email: string }) =>
      api.patch(`/api/rcv-demand/${letterId}/mark-sent`, { sent_to_email }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rcv-demand', claimId] })
      queryClient.invalidateQueries({ queryKey: ['claim-activities', claimId] })
      setShowMarkSentModal(false)
      setSelectedLetter(null)
    },
  })

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount)
  }

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    alert('Copied to clipboard!')
  }

  const downloadAsText = (content: string, letterId: string) => {
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `rcv-demand-letter-${letterId}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const rcvOutstanding = summary ? summary.ExpectedRCV - summary.TotalRCVReceived : 0
  const canGenerateLetter = summary && rcvOutstanding > 0 && summary.TotalACVReceived > 0

  if (isLoading) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <div className="text-center text-gray-600">Loading RCV demand letters...</div>
      </div>
    )
  }

  return (
    <>
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-5 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-medium text-gray-900">RCV Demand Letters</h3>
              <p className="mt-1 text-sm text-gray-500">
                Generate professional demand letters for outstanding RCV payments
              </p>
            </div>
            {canGenerateLetter && (
              <button
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
              >
                {generateMutation.isPending ? (
                  <>
                    <svg
                      className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Generating...
                  </>
                ) : (
                  'Generate Demand Letter'
                )}
              </button>
            )}
          </div>

          {/* Status banner */}
          {summary && (
            <div className="mt-4">
              {rcvOutstanding > 0 ? (
                <div className="rounded-md bg-yellow-50 p-3">
                  <div className="flex">
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
                    <div className="ml-3">
                      <p className="text-sm text-yellow-800">
                        Outstanding RCV payment: <span className="font-medium">{formatCurrency(rcvOutstanding)}</span>
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-md bg-green-50 p-3">
                  <div className="flex">
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
                    <div className="ml-3">
                      <p className="text-sm text-green-800">All RCV payments received</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-5">
          {letters && letters.length > 0 ? (
            <div className="space-y-6">
              {letters.map((letter) => (
                <div key={letter.id} className="border border-gray-200 rounded-lg p-5">
                  {/* Header */}
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-base font-medium text-gray-900">
                          RCV Demand Letter
                        </h4>
                        {letter.sent_at && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            Sent
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 mt-1">
                        Generated {formatDateTime(letter.created_at)}
                      </p>
                      {letter.sent_at && letter.sent_to_email && (
                        <p className="text-sm text-gray-500">
                          Sent to {letter.sent_to_email} on {formatDateTime(letter.sent_at)}
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => copyToClipboard(letter.content)}
                        className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                      >
                        <svg
                          className="h-4 w-4 mr-1"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                          />
                        </svg>
                        Copy
                      </button>

                      <button
                        onClick={() => downloadAsText(letter.content, letter.id)}
                        className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                      >
                        <svg
                          className="h-4 w-4 mr-1"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                          />
                        </svg>
                        Download
                      </button>

                      {!letter.sent_at && (
                        <button
                          onClick={() => {
                            setSelectedLetter(letter)
                            setShowMarkSentModal(true)
                          }}
                          className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
                        >
                          Mark as Sent
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Payment summary */}
                  {(letter.acv_received || letter.rcv_expected || letter.rcv_outstanding) && (
                    <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        {letter.acv_received !== null && (
                          <div>
                            <span className="text-gray-600">ACV Received:</span>
                            <span className="ml-2 font-medium text-gray-900">
                              {formatCurrency(letter.acv_received)}
                            </span>
                          </div>
                        )}
                        {letter.rcv_expected !== null && (
                          <div>
                            <span className="text-gray-600">RCV Expected:</span>
                            <span className="ml-2 font-medium text-gray-900">
                              {formatCurrency(letter.rcv_expected)}
                            </span>
                          </div>
                        )}
                        {letter.rcv_outstanding !== null && (
                          <div>
                            <span className="text-gray-600">RCV Outstanding:</span>
                            <span className="ml-2 font-medium text-red-600">
                              {formatCurrency(letter.rcv_outstanding)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Letter content */}
                  <div className="mt-4">
                    <div className="bg-white border border-gray-300 rounded-lg p-4 max-h-96 overflow-y-auto">
                      <pre className="whitespace-pre-wrap text-sm text-gray-900 font-sans">
                        {letter.content}
                      </pre>
                    </div>
                  </div>
                </div>
              ))}
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
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">No demand letters generated</h3>
              <p className="mt-1 text-sm text-gray-500">
                {canGenerateLetter
                  ? 'Generate a professional demand letter for the outstanding RCV payment.'
                  : 'RCV demand letters can be generated when RCV payments are outstanding.'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Mark as Sent Modal */}
      {showMarkSentModal && selectedLetter && (
        <MarkAsSentModal
          letter={selectedLetter}
          onClose={() => {
            setShowMarkSentModal(false)
            setSelectedLetter(null)
          }}
          onSubmit={(sent_to_email) =>
            markSentMutation.mutate({ letterId: selectedLetter.id, sent_to_email })
          }
          isLoading={markSentMutation.isPending}
        />
      )}
    </>
  )
}

// Mark as Sent Modal
interface MarkAsSentModalProps {
  letter: RCVDemandLetter
  onClose: () => void
  onSubmit: (sent_to_email: string) => void
  isLoading: boolean
}

function MarkAsSentModal({ onClose, onSubmit, isLoading }: MarkAsSentModalProps) {
  const [sentToEmail, setSentToEmail] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(sentToEmail)
  }

  return (
    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Mark Demand Letter as Sent</h3>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Sent to Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={sentToEmail}
              onChange={(e) => setSentToEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="adjuster@insurancecompany.com"
              required
            />
            <p className="mt-1 text-xs text-gray-500">
              Enter the email address where this letter was sent
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
              disabled={isLoading}
            >
              {isLoading ? 'Saving...' : 'Mark as Sent'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
