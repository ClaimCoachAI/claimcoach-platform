import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { getStepDefinition } from '../lib/stepUtils'
import type { ClaimStep, Claim } from '../types/claim'

interface NextStepCardProps {
  stepNumber: ClaimStep
  claim: Claim
}

export default function NextStepCard({ stepNumber, claim }: NextStepCardProps) {
  const [showLearnMore, setShowLearnMore] = useState(false)
  const [showForm, setShowForm] = useState(true) // Auto-show form on load
  const step = getStepDefinition(stepNumber)
  const queryClient = useQueryClient()

  // Step 2 - Contractor
  const [contractorData, setContractorData] = useState({
    contractor_name: '',
    contractor_email: '',
  })

  // Step 3 - Deductible
  const [estimateAmount, setEstimateAmount] = useState('')
  const [comparison, setComparison] = useState<{
    estimate: number
    deductible: number
    worthFiling: boolean
  } | null>(null)
  const deductible = claim.policy?.deductible_calculated || 0

  useEffect(() => {
    if (stepNumber === 3 && estimateAmount) {
      const estimate = parseFloat(estimateAmount)
      if (!isNaN(estimate)) {
        setComparison({
          estimate,
          deductible,
          worthFiling: estimate > deductible,
        })
      } else {
        setComparison(null)
      }
    }
  }, [estimateAmount, deductible, stepNumber])

  // Step 4 - Insurance Filing
  const [filingData, setFilingData] = useState({
    insurance_claim_number: '',
    adjuster_name: '',
    adjuster_phone: '',
    inspection_datetime: '',
  })

  // Mutations for each step
  const step2Mutation = useMutation({
    mutationFn: async () => {
      const response = await api.patch(`/api/claims/${claim.id}/step`, {
        current_step: 3,
        steps_completed: [1, 2],
        contractor_name: contractorData.contractor_name,
        contractor_email: contractorData.contractor_email,
      })
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['claim', claim.id] })
      setContractorData({ contractor_name: '', contractor_email: '' })
    },
  })

  const step3Mutation = useMutation({
    mutationFn: async () => {
      if (!comparison) throw new Error('Invalid estimate')
      const response = await api.patch(`/api/claims/${claim.id}/step`, {
        current_step: 4,
        steps_completed: [1, 2, 3],
        contractor_estimate_total: comparison.estimate,
        deductible_comparison_result: comparison.worthFiling ? 'worth_filing' : 'not_worth_filing',
      })
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['claim', claim.id] })
      setEstimateAmount('')
      setComparison(null)
    },
  })

  const step4Mutation = useMutation({
    mutationFn: async () => {
      const response = await api.patch(`/api/claims/${claim.id}/step`, {
        current_step: 5,
        steps_completed: [1, 2, 3, 4],
        insurance_claim_number: filingData.insurance_claim_number,
        adjuster_name: filingData.adjuster_name || undefined,
        adjuster_phone: filingData.adjuster_phone || undefined,
        inspection_datetime: filingData.inspection_datetime || undefined,
      })
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['claim', claim.id] })
      setFilingData({
        insurance_claim_number: '',
        adjuster_name: '',
        adjuster_phone: '',
        inspection_datetime: '',
      })
    },
  })

  const step5Mutation = useMutation({
    mutationFn: async () => {
      const response = await api.patch(`/api/claims/${claim.id}/step`, {
        current_step: 6,
        steps_completed: [1, 2, 3, 4, 5],
      })
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['claim', claim.id] })
    },
  })

  const step6Mutation = useMutation({
    mutationFn: async () => {
      const response = await api.patch(`/api/claims/${claim.id}/step`, {
        current_step: 6,
        steps_completed: [1, 2, 3, 4, 5, 6],
        status: 'closed',
      })
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['claim', claim.id] })
    },
  })

  const handleStep2Submit = (e: React.FormEvent) => {
    e.preventDefault()
    step2Mutation.mutate()
  }

  const handleStep3Submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (comparison) {
      step3Mutation.mutate()
    }
  }

  const handleStep4Submit = (e: React.FormEvent) => {
    e.preventDefault()
    step4Mutation.mutate()
  }

  const handleStep5Submit = () => {
    step5Mutation.mutate()
  }

  const handleStep6Submit = () => {
    step6Mutation.mutate()
  }

  return (
    <div className="glass-card-strong rounded-2xl p-6 mb-6 animate-scale-in">
      <div className="flex items-start space-x-4 mb-4">
        <div className="text-4xl flex-shrink-0">{step.icon}</div>
        <div className="flex-1">
          <div className="flex items-center space-x-2 mb-2">
            <span className="px-2 py-1 rounded-full bg-teal/20 text-teal text-xs font-semibold">
              CURRENT STEP
            </span>
            <span className="text-xs text-slate">Step {stepNumber} of 6</span>
          </div>
          <h3 className="text-xl font-display font-bold text-navy mb-2">{step.title}</h3>
          <p className="text-slate">{step.description}</p>
        </div>
      </div>

      <button
        onClick={() => setShowLearnMore(!showLearnMore)}
        className="text-sm text-teal hover:text-teal-dark font-medium mb-4"
      >
        {showLearnMore ? '− Show less' : '+ Learn more'}
      </button>

      {showLearnMore && (
        <div className="p-4 rounded-xl bg-teal/5 border border-teal/20 mb-4 animate-slide-down">
          <p className="text-sm text-slate">{step.learnMore}</p>
        </div>
      )}

      {/* Step 2 - Contractor Form */}
      {stepNumber === 2 && showForm && (
        <form onSubmit={handleStep2Submit} className="space-y-4 mt-6">
          <div>
            <label className="block text-sm font-medium text-navy mb-2">
              Contractor Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={contractorData.contractor_name}
              onChange={(e) =>
                setContractorData({ ...contractorData, contractor_name: e.target.value })
              }
              className="glass-input w-full px-4 py-3 rounded-xl text-navy"
              placeholder="ABC Roofing Company"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-navy mb-2">
              Contractor Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              required
              value={contractorData.contractor_email}
              onChange={(e) =>
                setContractorData({ ...contractorData, contractor_email: e.target.value })
              }
              className="glass-input w-full px-4 py-3 rounded-xl text-navy"
              placeholder="contractor@example.com"
            />
          </div>

          {step2Mutation.isError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-sm text-red-700">
                {(step2Mutation.error as any)?.response?.data?.error || 'Failed to send link'}
              </p>
            </div>
          )}

          <button
            type="submit"
            className="w-full btn-primary px-6 py-3 rounded-xl"
            disabled={step2Mutation.isPending}
          >
            {step2Mutation.isPending ? 'Sending...' : 'Send Link'}
          </button>
        </form>
      )}

      {/* Step 3 - Deductible Form */}
      {stepNumber === 3 && showForm && (
        <form onSubmit={handleStep3Submit} className="space-y-4 mt-6">
          <div>
            <label className="block text-sm font-medium text-navy mb-2">
              Contractor Estimate Total <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate">$</span>
              <input
                type="number"
                step="0.01"
                required
                value={estimateAmount}
                onChange={(e) => setEstimateAmount(e.target.value)}
                className="glass-input w-full pl-8 pr-4 py-3 rounded-xl text-navy"
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate/5 border border-slate/10">
            <p className="text-sm font-medium text-navy mb-2">Your Deductible</p>
            <p className="text-2xl font-bold text-navy">
              ${deductible.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
          </div>

          {comparison && (
            <div
              className={`p-4 rounded-xl border ${
                comparison.worthFiling
                  ? 'bg-teal/10 border-teal/20'
                  : 'bg-yellow-50 border-yellow-200'
              }`}
            >
              <p className="text-sm font-semibold mb-2">
                {comparison.worthFiling ? '✅ Worth Filing' : '⚠️ Below Deductible'}
              </p>
              <p className="text-xs text-slate">
                {comparison.worthFiling
                  ? `Estimate is $${(comparison.estimate - comparison.deductible).toLocaleString(
                      'en-US',
                      { minimumFractionDigits: 2 }
                    )} above your deductible`
                  : `Estimate is $${(comparison.deductible - comparison.estimate).toLocaleString(
                      'en-US',
                      { minimumFractionDigits: 2 }
                    )} below your deductible. You'd pay out of pocket anyway.`}
              </p>
            </div>
          )}

          {step3Mutation.isError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-sm text-red-700">
                {(step3Mutation.error as any)?.response?.data?.error || 'Failed to update claim'}
              </p>
            </div>
          )}

          <button
            type="submit"
            className="w-full btn-primary px-6 py-3 rounded-xl"
            disabled={step3Mutation.isPending || !comparison}
          >
            {step3Mutation.isPending ? 'Saving...' : 'Continue'}
          </button>
        </form>
      )}

      {/* Step 4 - Insurance Filing Form */}
      {stepNumber === 4 && showForm && (
        <form onSubmit={handleStep4Submit} className="space-y-4 mt-6">
          <div>
            <label className="block text-sm font-medium text-navy mb-2">
              Insurance Claim Number <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={filingData.insurance_claim_number}
              onChange={(e) =>
                setFilingData({ ...filingData, insurance_claim_number: e.target.value })
              }
              className="glass-input w-full px-4 py-3 rounded-xl text-navy"
              placeholder="e.g., CLM-2024-12345"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-navy mb-2">Adjuster Name</label>
            <input
              type="text"
              value={filingData.adjuster_name}
              onChange={(e) => setFilingData({ ...filingData, adjuster_name: e.target.value })}
              className="glass-input w-full px-4 py-3 rounded-xl text-navy"
              placeholder="John Smith"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-navy mb-2">Adjuster Phone</label>
            <input
              type="tel"
              value={filingData.adjuster_phone}
              onChange={(e) => setFilingData({ ...filingData, adjuster_phone: e.target.value })}
              className="glass-input w-full px-4 py-3 rounded-xl text-navy"
              placeholder="(555) 123-4567"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-navy mb-2">
              Inspection Date & Time
            </label>
            <input
              type="datetime-local"
              value={filingData.inspection_datetime}
              onChange={(e) =>
                setFilingData({ ...filingData, inspection_datetime: e.target.value })
              }
              className="glass-input w-full px-4 py-3 rounded-xl text-navy"
            />
          </div>

          {step4Mutation.isError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-sm text-red-700">
                {(step4Mutation.error as any)?.response?.data?.error || 'Failed to update claim'}
              </p>
            </div>
          )}

          <button
            type="submit"
            className="w-full btn-primary px-6 py-3 rounded-xl"
            disabled={step4Mutation.isPending}
          >
            {step4Mutation.isPending ? 'Saving...' : 'Complete Step'}
          </button>
        </form>
      )}

      {/* Step 5 - Review Offer */}
      {stepNumber === 5 && showForm && (
        <div className="space-y-4 mt-6">
          <div className="p-4 rounded-xl bg-teal/10 border border-teal/20">
            <p className="text-sm font-medium text-teal-dark mb-2">📊 AI Audit Coming Soon</p>
            <p className="text-xs text-slate">
              We're building AI-powered estimate comparison. For now, mark this step complete when
              you've reviewed the insurance offer.
            </p>
          </div>

          {step5Mutation.isError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-sm text-red-700">
                {(step5Mutation.error as any)?.response?.data?.error || 'Failed to update claim'}
              </p>
            </div>
          )}

          <button
            onClick={handleStep5Submit}
            className="w-full btn-primary px-6 py-3 rounded-xl"
            disabled={step5Mutation.isPending}
          >
            {step5Mutation.isPending ? 'Saving...' : 'Mark Complete'}
          </button>
        </div>
      )}

      {/* Step 6 - Close Claim */}
      {stepNumber === 6 && showForm && (
        <div className="space-y-4 mt-6">
          <div className="p-4 rounded-xl bg-teal/10 border border-teal/20">
            <p className="text-sm font-medium text-teal-dark mb-2">💰 Payment Tracking</p>
            <p className="text-xs text-slate mb-3">Insurance usually pays in two parts:</p>
            <ul className="text-xs text-slate space-y-1 ml-4">
              <li>• ACV (Actual Cash Value) - Upfront to start repairs</li>
              <li>• RCV (Recoverable Depreciation) - After repairs are done</li>
            </ul>
          </div>

          {step6Mutation.isError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-sm text-red-700">
                {(step6Mutation.error as any)?.response?.data?.error || 'Failed to close claim'}
              </p>
            </div>
          )}

          <button
            onClick={handleStep6Submit}
            className="w-full btn-primary px-6 py-3 rounded-xl"
            disabled={step6Mutation.isPending}
          >
            {step6Mutation.isPending ? 'Closing...' : 'Close Claim'}
          </button>
        </div>
      )}
    </div>
  )
}
