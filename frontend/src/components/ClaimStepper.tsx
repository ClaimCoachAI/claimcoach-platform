import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { getStepDefinition } from '../lib/stepUtils'
import Toast from './Toast'
import type { Claim } from '../types/claim'

interface ClaimStepperProps {
  claim: Claim
}

export default function ClaimStepper({ claim }: ClaimStepperProps) {
  const [activeStep, setActiveStep] = useState(claim.current_step || 1)
  const queryClient = useQueryClient()

  // Toast state
  const [toast, setToast] = useState<{
    message: string
    type: 'success' | 'error'
  } | null>(null)

  // Form states - pre-populate with existing claim data
  const [contractorData, setContractorData] = useState({
    contractor_name: claim.contractor_name || '',
    contractor_email: claim.contractor_email || '',
  })

  const [estimateAmount, setEstimateAmount] = useState(
    claim.contractor_estimate_total?.toString() || ''
  )
  const [comparison, setComparison] = useState<{
    estimate: number
    deductible: number
    worthFiling: boolean
  } | null>(null)
  const deductible = claim.policy?.deductible_calculated || 0

  // Initialize comparison if estimate exists
  useEffect(() => {
    if (claim.contractor_estimate_total) {
      setComparison({
        estimate: claim.contractor_estimate_total,
        deductible,
        worthFiling: claim.contractor_estimate_total > deductible,
      })
    }
  }, [claim.contractor_estimate_total, deductible])

  useEffect(() => {
    if (activeStep === 3 && estimateAmount) {
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
  }, [estimateAmount, deductible, activeStep])

  const [filingData, setFilingData] = useState({
    insurance_claim_number: claim.insurance_claim_number || '',
    adjuster_name: claim.adjuster_name || '',
    adjuster_phone: claim.adjuster_phone || '',
    inspection_datetime: claim.inspection_datetime || '',
  })

  // Mutations
  const step2Mutation = useMutation({
    mutationFn: async () => {
      // Generate magic link and send email to contractor
      const magicLinkResponse = await api.post(`/api/claims/${claim.id}/magic-link`, {
        contractor_name: contractorData.contractor_name,
        contractor_email: contractorData.contractor_email,
      })

      // Update claim step progress
      await api.patch(`/api/claims/${claim.id}/step`, {
        current_step: 3,
        steps_completed: [1, 2],
        contractor_name: contractorData.contractor_name,
        contractor_email: contractorData.contractor_email,
      })

      return magicLinkResponse.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['claim', claim.id] })
      setToast({
        message: `✓ Email sent successfully to ${contractorData.contractor_email}`,
        type: 'success',
      })
      setContractorData({ contractor_name: '', contractor_email: '' })
    },
    onError: () => {
      setToast({
        message: 'Failed to send email. Please try again.',
        type: 'error',
      })
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
      setToast({
        message: '✓ Estimate saved successfully',
        type: 'success',
      })
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
      setToast({
        message: '✓ Insurance information saved',
        type: 'success',
      })
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
      setToast({
        message: '✓ Step marked complete',
        type: 'success',
      })
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
      setToast({
        message: '✓ Claim closed successfully',
        type: 'success',
      })
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

  const getStepStatus = (stepNum: number): 'completed' | 'current' | 'upcoming' => {
    if (claim.steps_completed?.includes(stepNum)) return 'completed'
    if (stepNum === claim.current_step) return 'current'
    return 'upcoming'
  }

  const renderStepContent = (stepNum: number) => {
    if (activeStep !== stepNum) return null

    switch (stepNum) {
      case 1:
        return (
          <div className="step-content">
            <div className="claim-details-grid">
              <div className="detail-item">
                <span className="detail-label">Loss Type</span>
                <span className="detail-value">
                  {claim.loss_type === 'water' ? '💧 Water Damage' : '🧊 Hail Damage'}
                </span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Incident Date</span>
                <span className="detail-value">
                  {new Date(claim.incident_date).toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Property</span>
                <span className="detail-value">
                  {claim.property?.nickname || claim.property?.legal_address || 'N/A'}
                </span>
              </div>
              {claim.claim_number && (
                <div className="detail-item">
                  <span className="detail-label">Claim Number</span>
                  <span className="detail-value">{claim.claim_number}</span>
                </div>
              )}
              {claim.description && (
                <div className="detail-item full-width">
                  <span className="detail-label">Description</span>
                  <span className="detail-value description">{claim.description}</span>
                </div>
              )}
              <div className="detail-item full-width">
                <span className="detail-label">Created</span>
                <span className="detail-value">
                  {new Date(claim.created_at).toLocaleString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            </div>
          </div>
        )

      case 2:
        return (
          <form onSubmit={handleStep2Submit} className="step-content step-form">
            <div className="form-field">
              <label>
                Contractor Name <span className="required">*</span>
              </label>
              <input
                type="text"
                required
                value={contractorData.contractor_name}
                onChange={(e) =>
                  setContractorData({ ...contractorData, contractor_name: e.target.value })
                }
                placeholder="ABC Roofing Company"
              />
            </div>
            <div className="form-field">
              <label>
                Contractor Email <span className="required">*</span>
              </label>
              <input
                type="email"
                required
                value={contractorData.contractor_email}
                onChange={(e) =>
                  setContractorData({ ...contractorData, contractor_email: e.target.value })
                }
                placeholder="contractor@example.com"
              />
            </div>
            {step2Mutation.isError && (
              <div className="error">
                {(step2Mutation.error as any)?.response?.data?.error || 'Failed to send link'}
              </div>
            )}
            <button type="submit" disabled={step2Mutation.isPending}>
              {step2Mutation.isPending ? 'Sending...' : 'Send Link to Contractor'}
            </button>
          </form>
        )

      case 3:
        return (
          <form onSubmit={handleStep3Submit} className="step-content step-form">
            <div className="form-field">
              <label>
                Contractor Estimate <span className="required">*</span>
              </label>
              <div className="input-with-prefix">
                <span className="prefix">$</span>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={estimateAmount}
                  onChange={(e) => setEstimateAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="info-box">
              <div className="info-row">
                <span>Your Deductible</span>
                <strong>${deductible.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
              </div>
            </div>

            {comparison && (
              <div className={`result-box ${comparison.worthFiling ? 'success' : 'warning'}`}>
                <div className="result-icon">{comparison.worthFiling ? '✓' : '⚠'}</div>
                <div>
                  <div className="result-title">
                    {comparison.worthFiling ? 'Worth Filing' : 'Below Deductible'}
                  </div>
                  <div className="result-text">
                    {comparison.worthFiling
                      ? `$${(comparison.estimate - comparison.deductible).toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                        })} above your deductible`
                      : `$${(comparison.deductible - comparison.estimate).toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                        })} below your deductible`}
                  </div>
                </div>
              </div>
            )}

            {step3Mutation.isError && (
              <div className="error">
                {(step3Mutation.error as any)?.response?.data?.error || 'Failed to update'}
              </div>
            )}
            <button type="submit" disabled={step3Mutation.isPending || !comparison}>
              {step3Mutation.isPending ? 'Saving...' : 'Continue to Next Step'}
            </button>
          </form>
        )

      case 4:
        return (
          <form onSubmit={handleStep4Submit} className="step-content step-form">
            <div className="form-field">
              <label>
                Insurance Claim Number <span className="required">*</span>
              </label>
              <input
                type="text"
                required
                value={filingData.insurance_claim_number}
                onChange={(e) =>
                  setFilingData({ ...filingData, insurance_claim_number: e.target.value })
                }
                placeholder="CLM-2024-12345"
              />
            </div>
            <div className="form-grid">
              <div className="form-field">
                <label>Adjuster Name</label>
                <input
                  type="text"
                  value={filingData.adjuster_name}
                  onChange={(e) => setFilingData({ ...filingData, adjuster_name: e.target.value })}
                  placeholder="John Smith"
                />
              </div>
              <div className="form-field">
                <label>Adjuster Phone</label>
                <input
                  type="tel"
                  value={filingData.adjuster_phone}
                  onChange={(e) =>
                    setFilingData({ ...filingData, adjuster_phone: e.target.value })
                  }
                  placeholder="(555) 123-4567"
                />
              </div>
            </div>
            <div className="form-field">
              <label>Inspection Date & Time</label>
              <input
                type="datetime-local"
                value={filingData.inspection_datetime}
                onChange={(e) =>
                  setFilingData({ ...filingData, inspection_datetime: e.target.value })
                }
              />
            </div>
            {step4Mutation.isError && (
              <div className="error">
                {(step4Mutation.error as any)?.response?.data?.error || 'Failed to update'}
              </div>
            )}
            <button type="submit" disabled={step4Mutation.isPending}>
              {step4Mutation.isPending ? 'Saving...' : 'Complete This Step'}
            </button>
          </form>
        )

      case 5:
        return (
          <div className="step-content">
            <div className="info-box">
              <div className="info-icon">📊</div>
              <div>
                <strong>AI Audit Coming Soon</strong>
                <p>
                  We're building AI-powered estimate comparison. Mark complete when you've reviewed
                  the insurance offer.
                </p>
              </div>
            </div>
            {step5Mutation.isError && (
              <div className="error">
                {(step5Mutation.error as any)?.response?.data?.error || 'Failed to update'}
              </div>
            )}
            <button onClick={handleStep5Submit} disabled={step5Mutation.isPending}>
              {step5Mutation.isPending ? 'Saving...' : 'Mark as Complete'}
            </button>
          </div>
        )

      case 6:
        return (
          <div className="step-content">
            <div className="info-box">
              <div className="info-icon">💰</div>
              <div>
                <strong>Payment Tracking</strong>
                <p>Insurance typically pays in two parts:</p>
                <ul>
                  <li>ACV (Actual Cash Value) - Upfront to start repairs</li>
                  <li>RCV (Recoverable Depreciation) - After repairs complete</li>
                </ul>
              </div>
            </div>
            {step6Mutation.isError && (
              <div className="error">
                {(step6Mutation.error as any)?.response?.data?.error || 'Failed to close'}
              </div>
            )}
            <button onClick={handleStep6Submit} disabled={step6Mutation.isPending} className="final">
              {step6Mutation.isPending ? 'Closing...' : 'Close Claim'}
            </button>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Work+Sans:wght@400;500;600;700;800&family=DM+Sans:wght@400;500;600;700&display=swap');

        .claim-stepper {
          font-family: 'DM Sans', -apple-system, system-ui, sans-serif;
          position: relative;
        }

        /* Step Item - Grid Layout */
        .step-item {
          display: grid;
          grid-template-columns: 80px 1fr;
          gap: 24px;
          margin-bottom: 16px;
          position: relative;
        }

        .step-item:last-child .step-timeline::after {
          display: none;
        }

        /* Timeline Column */
        .step-timeline {
          display: flex;
          flex-direction: column;
          align-items: center;
          position: relative;
        }

        /* Connecting Line */
        .step-timeline::after {
          content: '';
          position: absolute;
          top: 56px;
          left: 50%;
          transform: translateX(-50%);
          width: 2px;
          height: calc(100% + 16px);
          background: linear-gradient(180deg, #0d9488 0%, rgba(148, 163, 184, 0.2) 100%);
        }

        .step-item.upcoming .step-timeline::after {
          background: rgba(148, 163, 184, 0.2);
        }

        /* Step Icon */
        .step-icon {
          width: 56px;
          height: 56px;
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
          position: relative;
          z-index: 2;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          flex-shrink: 0;
        }

        .step-icon.completed {
          background: linear-gradient(135deg, #0d9488 0%, #14b8a6 100%);
          box-shadow: 0 4px 12px rgba(13, 148, 136, 0.25);
          color: white;
          font-weight: 700;
        }

        .step-icon.current {
          background: white;
          border: 3px solid #0d9488;
          box-shadow: 0 0 0 4px rgba(13, 148, 136, 0.1), 0 4px 12px rgba(13, 148, 136, 0.15);
          font-size: 28px;
        }

        .step-icon.upcoming {
          background: rgba(148, 163, 184, 0.15);
          color: #64748b;
          font-family: 'Work Sans', sans-serif;
          font-weight: 700;
          font-size: 20px;
          border: 2px solid rgba(148, 163, 184, 0.2);
        }

        /* Content Column */
        .step-main {
          padding-top: 4px;
        }

        /* Step Header */
        .step-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          padding: 20px 24px;
          background: rgba(255, 255, 255, 0.6);
          backdrop-filter: blur(12px);
          border-radius: 16px;
          border: 1px solid rgba(148, 163, 184, 0.15);
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .step-item.accessible .step-header:hover {
          background: rgba(255, 255, 255, 0.9);
          border-color: #0d9488;
          box-shadow: 0 4px 20px rgba(13, 148, 136, 0.08);
        }

        .step-item.current .step-header {
          background: rgba(255, 255, 255, 0.95);
          border-color: #0d9488;
          box-shadow: 0 4px 20px rgba(13, 148, 136, 0.12);
        }

        .step-item.completed .step-header {
          background: rgba(240, 253, 250, 0.6);
          border-color: rgba(13, 148, 136, 0.2);
        }

        .step-item.upcoming .step-header {
          background: rgba(255, 255, 255, 0.5);
        }

        /* Step Info */
        .step-info {
          flex: 1;
          min-width: 0;
        }

        .step-title-row {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 6px;
          flex-wrap: wrap;
        }

        .step-title {
          font-family: 'Work Sans', sans-serif;
          font-size: 18px;
          font-weight: 700;
          color: #0f172a;
          letter-spacing: -0.01em;
        }

        .step-badge {
          padding: 3px 10px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.03em;
          text-transform: uppercase;
        }

        .step-badge.done {
          background: rgba(13, 148, 136, 0.12);
          color: #0d9488;
        }

        .step-badge.current-badge {
          background: #0d9488;
          color: white;
        }

        .step-description {
          color: #64748b;
          font-size: 14px;
          line-height: 1.5;
        }

        .expand-btn {
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #94a3b8;
          transition: all 0.3s ease;
          flex-shrink: 0;
        }

        .step-item.expanded .expand-btn {
          transform: rotate(180deg);
          color: #0d9488;
        }

        /* Step Content */
        .step-content {
          margin-top: 16px;
          padding: 24px;
          background: white;
          border-radius: 14px;
          border: 1px solid rgba(148, 163, 184, 0.12);
          animation: slideDown 0.3s ease;
        }

        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        /* Forms */
        .step-form {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .form-field {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .form-field label {
          font-size: 14px;
          font-weight: 600;
          color: #334155;
        }

        .required {
          color: #ef4444;
        }

        .form-field input {
          padding: 12px 14px;
          border: 2px solid rgba(148, 163, 184, 0.25);
          border-radius: 10px;
          font-size: 15px;
          font-family: inherit;
          transition: all 0.2s ease;
          background: white;
        }

        .form-field input:focus {
          outline: none;
          border-color: #0d9488;
          box-shadow: 0 0 0 3px rgba(13, 148, 136, 0.1);
        }

        .input-with-prefix {
          position: relative;
        }

        .prefix {
          position: absolute;
          left: 14px;
          top: 50%;
          transform: translateY(-50%);
          color: #64748b;
          font-weight: 600;
        }

        .input-with-prefix input {
          padding-left: 32px;
        }

        .form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }

        /* Info Box */
        .info-box {
          padding: 16px;
          background: rgba(241, 245, 249, 0.6);
          border: 1px solid rgba(148, 163, 184, 0.2);
          border-radius: 10px;
          display: flex;
          gap: 12px;
        }

        .info-icon {
          font-size: 32px;
          flex-shrink: 0;
        }

        .info-box strong {
          display: block;
          font-weight: 700;
          color: #0f172a;
          margin-bottom: 4px;
        }

        .info-box p {
          font-size: 14px;
          color: #64748b;
          line-height: 1.5;
          margin: 0;
        }

        .info-box ul {
          margin: 8px 0 0 0;
          padding-left: 20px;
          font-size: 13px;
          color: #64748b;
          line-height: 1.6;
        }

        .info-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 14px;
          color: #64748b;
        }

        .info-row strong {
          font-family: 'Work Sans', sans-serif;
          font-size: 20px;
          font-weight: 800;
          color: #0f172a;
        }

        /* Result Box */
        .result-box {
          display: flex;
          gap: 14px;
          padding: 16px;
          border-radius: 10px;
          animation: fadeIn 0.4s ease;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.98); }
          to { opacity: 1; transform: scale(1); }
        }

        .result-box.success {
          background: rgba(13, 148, 136, 0.08);
          border: 2px solid rgba(13, 148, 136, 0.25);
        }

        .result-box.warning {
          background: rgba(251, 191, 36, 0.08);
          border: 2px solid rgba(251, 191, 36, 0.25);
        }

        .result-icon {
          width: 36px;
          height: 36px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          font-weight: 700;
          flex-shrink: 0;
        }

        .result-box.success .result-icon {
          background: #0d9488;
          color: white;
        }

        .result-box.warning .result-icon {
          background: #fbbf24;
          color: white;
        }

        .result-title {
          font-weight: 700;
          color: #0f172a;
          margin-bottom: 2px;
        }

        .result-text {
          font-size: 13px;
          color: #64748b;
        }

        /* Claim Details Grid */
        .claim-details-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
        }

        .detail-item {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .detail-item.full-width {
          grid-column: 1 / -1;
        }

        .detail-label {
          font-size: 12px;
          font-weight: 600;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .detail-value {
          font-size: 15px;
          font-weight: 600;
          color: #0f172a;
        }

        .detail-value.description {
          font-weight: 500;
          color: #334155;
          line-height: 1.6;
        }

        /* Error */
        .error {
          padding: 12px 14px;
          background: rgba(239, 68, 68, 0.08);
          border: 1px solid rgba(239, 68, 68, 0.25);
          border-radius: 10px;
          color: #dc2626;
          font-size: 14px;
          font-weight: 600;
        }

        /* Buttons */
        button {
          padding: 14px 24px;
          background: linear-gradient(135deg, #0d9488 0%, #14b8a6 100%);
          color: white;
          border: none;
          border-radius: 10px;
          font-family: 'Work Sans', sans-serif;
          font-size: 15px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 2px 8px rgba(13, 148, 136, 0.25);
        }

        button:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(13, 148, 136, 0.35);
        }

        button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
        }

        button.final {
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          box-shadow: 0 2px 8px rgba(16, 185, 129, 0.25);
        }

        button.final:hover:not(:disabled) {
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.35);
        }

        /* Responsive */
        @media (max-width: 768px) {
          .step-item {
            grid-template-columns: 64px 1fr;
            gap: 16px;
          }

          .step-icon {
            width: 48px;
            height: 48px;
            font-size: 20px;
          }

          .step-timeline::after {
            top: 48px;
          }

          .step-title {
            font-size: 16px;
          }

          .form-grid {
            grid-template-columns: 1fr;
          }

          .claim-details-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <div className="claim-stepper">
        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        )}

        {[1, 2, 3, 4, 5, 6].map((stepNum) => {
          const step = getStepDefinition(stepNum as 1 | 2 | 3 | 4 | 5 | 6)
          const status = getStepStatus(stepNum)
          const isExpanded = activeStep === stepNum

          return (
            <div
              key={stepNum}
              className={`step-item ${status} accessible ${
                isExpanded ? 'expanded' : ''
              }`}
            >
              {/* Timeline Column */}
              <div className="step-timeline">
                <div className={`step-icon ${status}`}>
                  {status === 'completed' ? (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M5 13l4 4L19 7"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : status === 'current' ? (
                    step.icon
                  ) : (
                    stepNum
                  )}
                </div>
              </div>

              {/* Content Column */}
              <div className="step-main">
                <div
                  className="step-header"
                  onClick={() => setActiveStep(isExpanded ? 0 : stepNum)}
                  role="button"
                  tabIndex={0}
                >
                  <div className="step-info">
                    <div className="step-title-row">
                      <h3 className="step-title">{step.title}</h3>
                      {status === 'completed' && <span className="step-badge done">DONE</span>}
                      {status === 'current' && (
                        <span className="step-badge current-badge">CURRENT</span>
                      )}
                    </div>
                    <p className="step-description">{step.description}</p>
                  </div>

                  <div className="expand-btn">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M19 9l-7 7-7-7"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                </div>

                {isExpanded && renderStepContent(stepNum)}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
