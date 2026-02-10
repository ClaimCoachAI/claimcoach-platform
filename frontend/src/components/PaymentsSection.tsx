import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'

interface Payment {
  id: string
  claim_id: string
  payment_type: 'ACV' | 'RCV'
  amount: number
  check_number: string | null
  received_date: string | null
  notes: string | null
  status: 'expected' | 'received' | 'reconciled' | 'disputed'
  expected_amount: number | null
  received_by_user_id: string | null
  reconciled_at: string | null
  reconciled_by_user_id: string | null
  dispute_reason: string | null
  check_image_url: string | null
  metadata: any
  created_at: string
  updated_at: string
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

interface PaymentsSectionProps {
  claimId: string
}

const statusColors = {
  expected: 'bg-yellow-100 text-yellow-800',
  received: 'bg-blue-100 text-blue-800',
  reconciled: 'bg-green-100 text-green-800',
  disputed: 'bg-red-100 text-red-800',
}

export default function PaymentsSection({ claimId }: PaymentsSectionProps) {
  const queryClient = useQueryClient()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showRecordModal, setShowRecordModal] = useState(false)
  const [showDisputeModal, setShowDisputeModal] = useState(false)
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null)

  // Fetch payments
  const { data: payments, isLoading: loadingPayments } = useQuery<Payment[]>({
    queryKey: ['payments', claimId],
    queryFn: async () => {
      const response = await api.get(`/api/claims/${claimId}/payments`)
      return response.data.data || []
    },
  })

  // Fetch payment summary
  const { data: summary } = useQuery<PaymentSummary>({
    queryKey: ['payment-summary', claimId],
    queryFn: async () => {
      const response = await api.get(`/api/claims/${claimId}/payment-summary`)
      return response.data.data
    },
  })

  // Create expected payment mutation
  const createPaymentMutation = useMutation({
    mutationFn: (data: any) => api.post(`/api/claims/${claimId}/payments`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments', claimId] })
      queryClient.invalidateQueries({ queryKey: ['payment-summary', claimId] })
      queryClient.invalidateQueries({ queryKey: ['claim-activities', claimId] })
      setShowCreateModal(false)
    },
  })

  // Record payment received mutation
  const recordPaymentMutation = useMutation({
    mutationFn: ({ paymentId, data }: { paymentId: string; data: any }) =>
      api.patch(`/api/payments/${paymentId}/received`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments', claimId] })
      queryClient.invalidateQueries({ queryKey: ['payment-summary', claimId] })
      queryClient.invalidateQueries({ queryKey: ['claim-activities', claimId] })
      setShowRecordModal(false)
      setSelectedPayment(null)
    },
  })

  // Reconcile payment mutation
  const reconcileMutation = useMutation({
    mutationFn: (paymentId: string) => api.patch(`/api/payments/${paymentId}/reconcile`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments', claimId] })
      queryClient.invalidateQueries({ queryKey: ['payment-summary', claimId] })
      queryClient.invalidateQueries({ queryKey: ['claim-activities', claimId] })
    },
  })

  // Dispute payment mutation
  const disputeMutation = useMutation({
    mutationFn: ({ paymentId, dispute_reason }: { paymentId: string; dispute_reason: string }) =>
      api.patch(`/api/payments/${paymentId}/dispute`, { dispute_reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments', claimId] })
      queryClient.invalidateQueries({ queryKey: ['payment-summary', claimId] })
      queryClient.invalidateQueries({ queryKey: ['claim-activities', claimId] })
      setShowDisputeModal(false)
      setSelectedPayment(null)
    },
  })

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  if (loadingPayments) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <div className="text-center text-gray-600">Loading payment information...</div>
      </div>
    )
  }

  return (
    <>
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-5 border-b border-gray-200 flex justify-between items-center">
          <h3 className="text-lg font-medium text-gray-900">Payments</h3>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
          >
            Record Payment
          </button>
        </div>

        {/* Payment Summary */}
        {summary && (
          <div className="px-6 py-5 border-b border-gray-200">
            <div className="grid grid-cols-2 gap-6">
              {/* ACV Column */}
              <div>
                <h4 className="text-sm font-medium text-gray-900 mb-3">ACV Payments</h4>
                <div className="space-y-3">
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className="bg-blue-600 h-3 rounded-full transition-all"
                      style={{
                        width: `${
                          summary.ExpectedACV > 0
                            ? Math.min((summary.TotalACVReceived / summary.ExpectedACV) * 100, 100)
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Received:</span>
                    <span className="font-medium">{formatCurrency(summary.TotalACVReceived)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Expected:</span>
                    <span className="font-medium">{formatCurrency(summary.ExpectedACV)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Delta:</span>
                    <span
                      className={`font-medium ${
                        summary.ACVDelta >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}
                    >
                      {summary.ACVDelta >= 0 ? '+' : ''}
                      {formatCurrency(summary.ACVDelta)}
                    </span>
                  </div>
                </div>
              </div>

              {/* RCV Column */}
              <div>
                <h4 className="text-sm font-medium text-gray-900 mb-3">RCV Payments</h4>
                <div className="space-y-3">
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className="bg-green-600 h-3 rounded-full transition-all"
                      style={{
                        width: `${
                          summary.ExpectedRCV > 0
                            ? Math.min((summary.TotalRCVReceived / summary.ExpectedRCV) * 100, 100)
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Received:</span>
                    <span className="font-medium">{formatCurrency(summary.TotalRCVReceived)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Expected:</span>
                    <span className="font-medium">{formatCurrency(summary.ExpectedRCV)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Delta:</span>
                    <span
                      className={`font-medium ${
                        summary.RCVDelta >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}
                    >
                      {summary.RCVDelta >= 0 ? '+' : ''}
                      {formatCurrency(summary.RCVDelta)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Status badges */}
            <div className="mt-4 flex gap-2">
              {summary.FullyReconciled && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  Fully Reconciled
                </span>
              )}
              {summary.HasDisputes && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                  Has Disputes
                </span>
              )}
            </div>
          </div>
        )}

        {/* Payment Timeline */}
        <div className="px-6 py-5">
          {payments && payments.length > 0 ? (
            <div className="space-y-3">
              {payments.map((payment) => (
                <div
                  key={payment.id}
                  className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h4 className="text-base font-medium text-gray-900">
                          {payment.payment_type} Payment
                        </h4>
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            statusColors[payment.status]
                          }`}
                        >
                          {payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-sm">
                        {payment.expected_amount !== null && (
                          <div>
                            <span className="text-gray-600">Expected:</span>
                            <span className="ml-2 font-medium">
                              {formatCurrency(payment.expected_amount)}
                            </span>
                          </div>
                        )}

                        {payment.amount > 0 && (
                          <div>
                            <span className="text-gray-600">Received:</span>
                            <span className="ml-2 font-medium">{formatCurrency(payment.amount)}</span>
                          </div>
                        )}

                        {payment.check_number && (
                          <div>
                            <span className="text-gray-600">Check #:</span>
                            <span className="ml-2 font-medium">{payment.check_number}</span>
                          </div>
                        )}

                        {payment.received_date && (
                          <div>
                            <span className="text-gray-600">Date:</span>
                            <span className="ml-2 font-medium">{formatDate(payment.received_date)}</span>
                          </div>
                        )}
                      </div>

                      {payment.dispute_reason && (
                        <div className="mt-2 p-2 bg-red-50 rounded text-sm text-red-800">
                          <span className="font-medium">Dispute:</span> {payment.dispute_reason}
                        </div>
                      )}

                      {payment.notes && (
                        <div className="mt-2 p-2 bg-gray-50 rounded text-sm text-gray-700">
                          <span className="font-medium">Notes:</span> {payment.notes}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-2 ml-4">
                      {payment.status === 'expected' && (
                        <button
                          onClick={() => {
                            setSelectedPayment(payment)
                            setShowRecordModal(true)
                          }}
                          className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                        >
                          Record Received
                        </button>
                      )}

                      {payment.status === 'received' && (
                        <>
                          <button
                            onClick={() => reconcileMutation.mutate(payment.id)}
                            disabled={reconcileMutation.isPending}
                            className="text-sm text-green-600 hover:text-green-800 font-medium disabled:opacity-50"
                          >
                            Reconcile
                          </button>
                          <button
                            onClick={() => {
                              setSelectedPayment(payment)
                              setShowDisputeModal(true)
                            }}
                            className="text-sm text-red-600 hover:text-red-800 font-medium"
                          >
                            Dispute
                          </button>
                        </>
                      )}
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
                  d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">No payments recorded</h3>
              <p className="mt-1 text-sm text-gray-500">
                Record expected payments and track when they're received.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Create Expected Payment Modal */}
      {showCreateModal && (
        <CreatePaymentModal
          onClose={() => setShowCreateModal(false)}
          onSubmit={(data) => createPaymentMutation.mutate(data)}
          isLoading={createPaymentMutation.isPending}
        />
      )}

      {/* Record Payment Received Modal */}
      {showRecordModal && selectedPayment && (
        <RecordPaymentModal
          payment={selectedPayment}
          onClose={() => {
            setShowRecordModal(false)
            setSelectedPayment(null)
          }}
          onSubmit={(data) =>
            recordPaymentMutation.mutate({ paymentId: selectedPayment.id, data })
          }
          isLoading={recordPaymentMutation.isPending}
        />
      )}

      {/* Dispute Payment Modal */}
      {showDisputeModal && selectedPayment && (
        <DisputePaymentModal
          payment={selectedPayment}
          onClose={() => {
            setShowDisputeModal(false)
            setSelectedPayment(null)
          }}
          onSubmit={(dispute_reason) =>
            disputeMutation.mutate({ paymentId: selectedPayment.id, dispute_reason })
          }
          isLoading={disputeMutation.isPending}
        />
      )}
    </>
  )
}

// Create Payment Modal
interface CreatePaymentModalProps {
  onClose: () => void
  onSubmit: (data: any) => void
  isLoading: boolean
}

function CreatePaymentModal({ onClose, onSubmit, isLoading }: CreatePaymentModalProps) {
  const [formData, setFormData] = useState({
    payment_type: 'ACV',
    expected_amount: '',
    notes: '',
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit({
      payment_type: formData.payment_type,
      expected_amount: parseFloat(formData.expected_amount),
      notes: formData.notes || null,
    })
  }

  return (
    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Create Expected Payment</h3>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Payment Type</label>
            <select
              value={formData.payment_type}
              onChange={(e) => setFormData({ ...formData, payment_type: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="ACV">ACV (Actual Cash Value)</option>
              <option value="RCV">RCV (Replacement Cost Value)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Expected Amount <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-gray-500">$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.expected_amount}
                onChange={(e) => setFormData({ ...formData, expected_amount: e.target.value })}
                className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0.00"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Additional notes..."
            />
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
              {isLoading ? 'Creating...' : 'Create Payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Record Payment Modal
interface RecordPaymentModalProps {
  payment: Payment
  onClose: () => void
  onSubmit: (data: any) => void
  isLoading: boolean
}

function RecordPaymentModal({ payment, onClose, onSubmit, isLoading }: RecordPaymentModalProps) {
  const [formData, setFormData] = useState({
    amount: payment.expected_amount?.toString() || '',
    check_number: '',
    received_date: new Date().toISOString().split('T')[0],
    notes: '',
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit({
      amount: parseFloat(formData.amount),
      check_number: formData.check_number || null,
      received_date: formData.received_date,
      notes: formData.notes || null,
    })
  }

  return (
    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Record Payment Received</h3>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          <div className="text-sm text-gray-600">
            <p>
              <span className="font-medium">Type:</span> {payment.payment_type}
            </p>
            {payment.expected_amount && (
              <p>
                <span className="font-medium">Expected:</span> $
                {payment.expected_amount.toFixed(2)}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Amount Received <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-gray-500">$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0.00"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Check Number</label>
            <input
              type="text"
              value={formData.check_number}
              onChange={(e) => setFormData({ ...formData, check_number: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Optional"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Received Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={formData.received_date}
              onChange={(e) => setFormData({ ...formData, received_date: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Additional notes..."
            />
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
              {isLoading ? 'Recording...' : 'Record Payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Dispute Payment Modal
interface DisputePaymentModalProps {
  payment: Payment
  onClose: () => void
  onSubmit: (dispute_reason: string) => void
  isLoading: boolean
}

function DisputePaymentModal({ payment, onClose, onSubmit, isLoading }: DisputePaymentModalProps) {
  const [disputeReason, setDisputeReason] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(disputeReason)
  }

  return (
    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Dispute Payment</h3>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          <div className="text-sm text-gray-600">
            <p>
              <span className="font-medium">Type:</span> {payment.payment_type}
            </p>
            <p>
              <span className="font-medium">Amount:</span> ${payment.amount.toFixed(2)}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Dispute Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Explain why this payment is being disputed..."
              required
            />
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
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50"
              disabled={isLoading}
            >
              {isLoading ? 'Disputing...' : 'Dispute Payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
