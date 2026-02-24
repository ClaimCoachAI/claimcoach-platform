import { useState, useEffect } from 'react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import api from '../lib/api'
import { getStepDefinition } from '../lib/stepUtils'
import Toast from './Toast'
import ContractorStatusBadge from './ContractorStatusBadge'
import ScopeSheetSummary from './ScopeSheetSummary'
import type { Claim, Payment } from '../types/claim'

interface ContractorPhoto {
  id: string
  file_name: string
  document_type: string
  uploaded_at: string
}

interface CarrierEstimateData {
  id: string
  file_name: string
  file_size_bytes: number | null
  parse_status: 'pending' | 'processing' | 'completed' | 'failed'
  parse_error: string | null
  uploaded_at: string
  parsed_at: string | null
}

interface DiscrepancyItem {
  item: string
  industry_price: number
  carrier_price: number
  delta: number
  justification: string
}

interface ComparisonData {
  discrepancies: DiscrepancyItem[]
  summary: {
    total_industry: number
    total_carrier: number
    total_delta: number
  }
}

interface AuditReportData {
  id: string
  generated_estimate: string | null
  comparison_data: string | null
  total_contractor_estimate: number | null
  total_carrier_estimate: number | null
  total_delta: number | null
  status: 'pending' | 'processing' | 'completed' | 'failed'
  error_message: string | null
}

interface ClaimStepperProps {
  claim: Claim
}

export default function ClaimStepper({ claim }: ClaimStepperProps) {
  const [activeStep, setActiveStep] = useState(claim.current_step || 1)
  const queryClient = useQueryClient()

  // AI Audit states (Step 6) — declared early because carrier estimate query uses isPollingCarrierEstimate
  const [carrierEstimateFile, setCarrierEstimateFile] = useState<File | null>(null)
  const [isPollingCarrierEstimate, setIsPollingCarrierEstimate] = useState(false)
  const [rebuttalText, setRebuttalText] = useState<string | null>(null)
  const [auditLoadingStep, setAuditLoadingStep] = useState(0)
  const [photosOpen, setPhotosOpen] = useState(false)

  // Scope sheet query
  const {
    data: scopeSheet,
    isLoading: loadingScopeSheet,
  } = useQuery({
    queryKey: ['scope-sheet', claim.id],
    queryFn: async () => {
      try {
        const response = await api.get(`/api/claims/${claim.id}/scope-sheet`)
        return response.data.data
      } catch (error: any) {
        if (error.response?.status === 404) {
          return null
        }
        // Return null for other errors instead of throwing
        console.error('Error fetching scope sheet:', error)
        return null
      }
    },
    enabled: !!claim.id,
    retry: false,
  })

  // Contractor photos query
  const { data: contractorPhotos = [] } = useQuery<ContractorPhoto[]>({
    queryKey: ['claim-documents', claim.id],
    queryFn: async () => {
      const response = await api.get(`/api/claims/${claim.id}/documents`)
      const docs = response.data.data as ContractorPhoto[]
      return docs.filter(d => d.document_type === 'contractor_photo')
    },
    enabled: !!claim.id,
  })

  useEffect(() => {
    if (contractorPhotos.length > 0 && contractorPhotos.length <= 2) {
      setPhotosOpen(true)
    }
  }, [contractorPhotos.length])

  const handlePhotoDownload = async (documentId: string) => {
    try {
      const response = await api.get(`/api/documents/${documentId}`)
      const downloadUrl = response.data.data.download_url
      const isValid = downloadUrl.startsWith('https://') ||
                      downloadUrl.startsWith(import.meta.env.VITE_API_URL || '')
      if (!isValid) throw new Error('Invalid download URL received')
      window.open(downloadUrl, '_blank', 'noopener,noreferrer')
    } catch (err) {
      console.error('Download failed:', err)
    }
  }

  // Payments query
  const {
    data: payments,
  } = useQuery<Payment[]>({
    queryKey: ['payments', claim.id],
    queryFn: async () => {
      try {
        const response = await api.get(`/api/claims/${claim.id}/payments`)
        return response.data.data || []
      } catch (error: any) {
        if (error.response?.status === 404) return []
        console.error('Error fetching payments:', error)
        return []
      }
    },
    enabled: !!claim.id,
    retry: false,
  })

  // Carrier estimate query (Step 6 - with polling)
  const {
    data: carrierEstimates,
    refetch: refetchCarrierEstimates,
  } = useQuery<CarrierEstimateData[]>({
    queryKey: ['carrier-estimates', claim.id],
    queryFn: async () => {
      try {
        const response = await api.get(`/api/claims/${claim.id}/carrier-estimate`)
        return response.data.data || []
      } catch {
        return []
      }
    },
    enabled: !!claim.id,
    retry: false,
    refetchInterval: isPollingCarrierEstimate ? 3000 : false,
  })

  // Audit report query (Step 6)
  const {
    data: auditReport,
    refetch: refetchAuditReport,
  } = useQuery<AuditReportData | null>({
    queryKey: ['audit-report', claim.id],
    queryFn: async () => {
      try {
        const response = await api.get(`/api/claims/${claim.id}/audit`)
        return response.data.data
      } catch (error: any) {
        if (error.response?.status === 404) return null
        return null
      }
    },
    enabled: !!claim.id,
    retry: false,
  })

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
  const [isEditingContractor, setIsEditingContractor] = useState(!claim.contractor_name)

  const [estimateAmount, setEstimateAmount] = useState(
    claim.contractor_estimate_total?.toString() || ''
  )
  const [isEditingEstimate, setIsEditingEstimate] = useState(!claim.contractor_estimate_total)
  const [comparison, setComparison] = useState<{
    estimate: number
    deductible: number
    worthFiling: boolean
  } | null>(null)
  const deductible = claim.policy?.deductible_calculated || 0

  const [step4Description, setStep4Description] = useState<string>(claim.description || '')
  const [isEditingDescription, setIsEditingDescription] = useState<boolean>(false)

  // Payment form states
  const [acvForm, setAcvForm] = useState({ amount: '', received_date: '', check_number: '' })
  const [rcvForm, setRcvForm] = useState({ amount: '', received_date: '', check_number: '' })
  const [isEditingAcv, setIsEditingAcv] = useState(true)
  const [isEditingRcv, setIsEditingRcv] = useState(true)
  const [confirmingClose, setConfirmingClose] = useState(false)

  // Derive payment records from query data
  const acvPayment = payments?.find(p => p.payment_type === 'acv' && (p.status === 'received' || p.status === 'reconciled'))
  const rcvPayment = payments?.find(p => p.payment_type === 'rcv' && (p.status === 'received' || p.status === 'reconciled'))
  const totalReceived = (acvPayment?.amount || 0) + (rcvPayment?.amount || 0)

  // Sync locked state with loaded payment data
  useEffect(() => {
    if (acvPayment) setIsEditingAcv(false)
  }, [acvPayment?.id])

  useEffect(() => {
    if (rcvPayment) setIsEditingRcv(false)
  }, [rcvPayment?.id])

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

  // Stop polling when carrier estimate parse completes or fails
  useEffect(() => {
    const latest = carrierEstimates?.[0]
    if (latest?.parse_status === 'completed' || latest?.parse_status === 'failed') {
      setIsPollingCarrierEstimate(false)
    }
  }, [carrierEstimates])


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
      setIsEditingContractor(false)
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
      setIsEditingEstimate(false)
    },
  })

  const step4Mutation = useMutation({
    mutationFn: async (data: { description: string }) => {
      const alreadyCompleted = (claim.steps_completed || []).includes(4)
      const updatedStepsCompleted = alreadyCompleted
        ? claim.steps_completed
        : [...(claim.steps_completed || []), 4]

      await api.patch(`/api/claims/${claim.id}/step`, {
        ...(alreadyCompleted ? {} : { current_step: 5 }),
        steps_completed: updatedStepsCompleted,
        description: data.description,
      })

      await api.post(`/api/claims/${claim.id}/notify-claimcoach`)
      return data
    },
    onSuccess: (data) => {
      setStep4Description(data.description)
      setIsEditingDescription(false)
      setToast({
        message: '✓ Claim submitted to ClaimCoach team',
        type: 'success',
      })
      queryClient.invalidateQueries({ queryKey: ['claim', claim.id] })
    },
    onError: (error: any) => {
      console.error('Step 4 submission error:', error)
      setToast({
        message: 'Failed to submit claim. Please try again.',
        type: 'error',
      })
    }
  })

  const step5Mutation = useMutation({
    mutationFn: async () => {
      const response = await api.patch(`/api/claims/${claim.id}/step`, {
        current_step: 6,
        steps_completed: [1, 2, 3, 4, 5],
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

  const step6Mutation = useMutation({
    mutationFn: async () => {
      const updatedStepsCompleted = [...new Set([...(claim.steps_completed || []), 6])]
      const response = await api.patch(`/api/claims/${claim.id}/step`, {
        current_step: 7,
        steps_completed: updatedStepsCompleted,
      })
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['claim', claim.id] })
      setToast({
        message: '✓ Insurance offer reviewed',
        type: 'success',
      })
    },
  })

  const step7Mutation = useMutation({
    mutationFn: async () => {
      const response = await api.patch(`/api/claims/${claim.id}/step`, {
        current_step: 7,
        steps_completed: [1, 2, 3, 4, 5, 6, 7],
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

  const acvMutation = useMutation({
    mutationFn: async (data: { amount: number; received_date: string; check_number?: string }) => {
      const createRes = await api.post(`/api/claims/${claim.id}/payments`, {
        payment_type: 'acv',
        amount: data.amount,
        expected_amount: data.amount,
      })
      const paymentId = createRes.data.data?.id || createRes.data.id
      await api.patch(`/api/payments/${paymentId}/received`, {
        amount: data.amount,
        received_date: data.received_date,
        check_number: data.check_number,
      })
      return createRes.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments', claim.id] })
      setToast({ message: '✓ ACV payment logged', type: 'success' })
      setIsEditingAcv(false)
    },
    onError: () => {
      setToast({ message: 'Failed to log ACV payment. Please try again.', type: 'error' })
    },
  })

  const rcvMutation = useMutation({
    mutationFn: async (data: { amount: number; received_date: string; check_number?: string }) => {
      const createRes = await api.post(`/api/claims/${claim.id}/payments`, {
        payment_type: 'rcv',
        amount: data.amount,
        expected_amount: data.amount,
      })
      const paymentId = createRes.data.data?.id || createRes.data.id
      await api.patch(`/api/payments/${paymentId}/received`, {
        amount: data.amount,
        received_date: data.received_date,
        check_number: data.check_number,
      })
      return createRes.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments', claim.id] })
      setToast({ message: '✓ RCV payment logged', type: 'success' })
      setIsEditingRcv(false)
    },
    onError: () => {
      setToast({ message: 'Failed to log RCV payment. Please try again.', type: 'error' })
    },
  })

  const uploadCarrierEstimateMutation = useMutation({
    mutationFn: async (file: File) => {
      const urlRes = await api.post(`/api/claims/${claim.id}/carrier-estimate/upload-url`, {
        file_name: file.name,
        file_size: file.size,
        mime_type: 'application/pdf',
      })
      const { upload_url, estimate_id } = urlRes.data.data
      await fetch(upload_url, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': 'application/pdf' },
      })
      await api.post(`/api/claims/${claim.id}/carrier-estimate/${estimate_id}/confirm`)
      await api.post(`/api/claims/${claim.id}/carrier-estimate/${estimate_id}/parse`)
      return estimate_id
    },
    onSuccess: () => {
      setCarrierEstimateFile(null)
      setIsPollingCarrierEstimate(true)
      refetchCarrierEstimates()
      setToast({ message: '✓ PDF uploaded — parsing in progress', type: 'success' })
    },
    onError: (err: any) => {
      setToast({
        message: err?.response?.data?.error || 'Failed to upload PDF. Please try again.',
        type: 'error',
      })
    },
  })

  const generateAuditMutation = useMutation({
    mutationFn: async () => {
      const genRes = await api.post(`/api/claims/${claim.id}/audit/generate`)
      const auditReportId = genRes.data.data.audit_report_id
      await api.post(`/api/claims/${claim.id}/audit/${auditReportId}/compare`)
      return auditReportId
    },
    onSuccess: () => {
      refetchAuditReport()
      setToast({ message: '✓ AI analysis complete', type: 'success' })
    },
    onError: (err: any) => {
      setToast({
        message: err?.response?.data?.error || 'Analysis failed. Please try again.',
        type: 'error',
      })
    },
  })

  // Cycle through loading steps while AI analysis runs
  useEffect(() => {
    if (!generateAuditMutation.isPending) {
      setAuditLoadingStep(0)
      return
    }
    const interval = setInterval(() => {
      setAuditLoadingStep(s => (s + 1) % 4)
    }, 3500)
    return () => clearInterval(interval)
  }, [generateAuditMutation.isPending])

  const generateRebuttalMutation = useMutation({
    mutationFn: async (auditReportId: string) => {
      const res = await api.post(`/api/claims/${claim.id}/audit/${auditReportId}/rebuttal`)
      return res.data.data.content as string
    },
    onSuccess: (content) => {
      setRebuttalText(content)
      setToast({ message: '✓ Rebuttal letter generated', type: 'success' })
    },
    onError: () => {
      setToast({ message: 'Failed to generate rebuttal. Please try again.', type: 'error' })
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
    if (step4Description.trim().length < 20) {
      setToast({
        message: 'Please provide a detailed description (at least 20 characters)',
        type: 'error',
      })
      return
    }
    step4Mutation.mutate({ description: step4Description.trim() })
  }

  const handleStep5Submit = (e: React.FormEvent) => {
    e.preventDefault()
    step5Mutation.mutate()
  }

  const handleStep6Submit = () => {
    step6Mutation.mutate()
  }

  const handleCarrierEstimateUpload = () => {
    if (carrierEstimateFile) {
      uploadCarrierEstimateMutation.mutate(carrierEstimateFile)
    }
  }

  const handleAcvSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const amount = parseFloat(acvForm.amount)
    if (!acvForm.amount || isNaN(amount) || amount <= 0) {
      setToast({ message: 'Please enter a valid payment amount', type: 'error' })
      return
    }
    if (!acvForm.received_date) {
      setToast({ message: 'Please enter the payment date', type: 'error' })
      return
    }
    acvMutation.mutate({ amount, received_date: acvForm.received_date, check_number: acvForm.check_number || undefined })
  }

  const handleRcvSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const amount = parseFloat(rcvForm.amount)
    if (!rcvForm.amount || isNaN(amount) || amount <= 0) {
      setToast({ message: 'Please enter a valid payment amount', type: 'error' })
      return
    }
    if (!rcvForm.received_date) {
      setToast({ message: 'Please enter the payment date', type: 'error' })
      return
    }
    rcvMutation.mutate({ amount, received_date: rcvForm.received_date, check_number: rcvForm.check_number || undefined })
  }

  const handleStep7Submit = () => {
    step7Mutation.mutate()
  }

  const getStepStatus = (stepNum: number): 'completed' | 'current' | 'upcoming' => {
    if (claim.steps_completed?.includes(stepNum)) return 'completed'
    if (stepNum === claim.current_step) return 'current'
    return 'upcoming'
  }

  // Calculate status flags
  const hasMagicLink = claim.contractor_email !== null
  const hasScopeSheet = scopeSheet !== null

  const renderStepContent = (stepNum: number) => {
    if (activeStep !== stepNum) return null

    const isLocked = !claim.steps_completed?.includes(stepNum) && stepNum !== claim.current_step

    // Derived values for Step 6 audit flow
    const latestCarrierEstimate = carrierEstimates?.[0]
    const isParsed = latestCarrierEstimate?.parse_status === 'completed'
    const isParsing = isPollingCarrierEstimate ||
      latestCarrierEstimate?.parse_status === 'pending' ||
      latestCarrierEstimate?.parse_status === 'processing'
    const parseFailed = latestCarrierEstimate?.parse_status === 'failed'
    const hasAuditResult = auditReport?.status === 'completed' && !!auditReport?.comparison_data

    let comparisonData: ComparisonData | null = null
    if (auditReport?.comparison_data) {
      try {
        comparisonData = JSON.parse(auditReport.comparison_data) as ComparisonData
      } catch {
        comparisonData = null
      }
    }

    const content = (() => {
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
            {!isEditingContractor ? (
              <div className="contractor-view-card">
                <div className="contractor-view-fields">
                  <div className="contractor-view-field">
                    <span className="contractor-view-label">Contractor Name</span>
                    <span className="contractor-view-value">{contractorData.contractor_name}</span>
                  </div>
                  <div className="contractor-view-field">
                    <span className="contractor-view-label">Contractor Email</span>
                    <span className="contractor-view-value">{contractorData.contractor_email}</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="edit-contractor-btn"
                  onClick={() => setIsEditingContractor(true)}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                  Edit
                </button>
              </div>
            ) : (
              <>
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
                {!!claim.contractor_name && (
                  <button
                    type="button"
                    className="cancel-edit-btn"
                    onClick={() => {
                      setIsEditingContractor(false)
                      setContractorData({
                        contractor_name: claim.contractor_name || '',
                        contractor_email: claim.contractor_email || '',
                      })
                    }}
                  >
                    Cancel
                  </button>
                )}
              </>
            )}

            {/* Contractor Status */}
            {loadingScopeSheet ? (
              <div className="mt-3 animate-pulse">
                <div className="h-8 w-48 bg-slate-200 rounded-full"></div>
              </div>
            ) : (
              <>
                <div className="mt-3">
                  <ContractorStatusBadge
                    hasMagicLink={hasMagicLink}
                    hasScopeSheet={hasScopeSheet}
                  />
                </div>

                {hasScopeSheet && scopeSheet && (
                  <>
                    <ScopeSheetSummary scopeSheet={scopeSheet} />
                    <div className="mt-4 rounded-lg border border-gray-200 overflow-hidden">
                      {/* Accordion header */}
                      <button
                        type="button"
                        onClick={() => setPhotosOpen(prev => !prev)}
                        className="w-full flex items-center justify-between px-4 py-2.5 bg-white hover:bg-gray-50 transition-colors text-sm"
                      >
                        <span className="flex items-center gap-2 font-medium text-gray-700">
                          <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          Photos ({contractorPhotos.length})
                        </span>
                        <svg
                          className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${photosOpen ? 'rotate-90' : ''}`}
                          fill="none" stroke="currentColor" viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>

                      {/* Accordion body */}
                      <div
                        className={`transition-all duration-200 ease-in-out overflow-hidden ${
                          photosOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                        }`}
                      >
                        {contractorPhotos.length > 0 ? (
                          <ul className="divide-y divide-gray-100 border-t border-gray-200">
                            {contractorPhotos.map(photo => (
                              <li key={photo.id} className="flex items-center justify-between px-4 py-2 text-sm bg-white">
                                <span className="text-gray-700 truncate max-w-xs">{photo.file_name}</span>
                                <button
                                  type="button"
                                  onClick={() => handlePhotoDownload(photo.id)}
                                  title={`Download ${photo.file_name}`}
                                  className="ml-4 shrink-0 p-1 rounded text-slate-400 hover:text-teal-600 hover:bg-teal-50 transition-colors"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                  </svg>
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="px-4 py-3 text-sm text-gray-400 border-t border-gray-100">No photos uploaded.</p>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </>
            )}

            {step2Mutation.isError && (
              <div className="error">
                {(step2Mutation.error as any)?.response?.data?.error || 'Failed to send link'}
              </div>
            )}
            <button type="submit" disabled={step2Mutation.isPending}>
              {step2Mutation.isPending
                ? 'Sending...'
                : !!claim.contractor_name && !isEditingContractor
                  ? 'Resend Link to Contractor'
                  : 'Send Link to Contractor'}
            </button>
          </form>
        )

      case 3:
        return (
          <form onSubmit={handleStep3Submit} className="step-content step-form">
            {!isEditingEstimate ? (
              <div className="contractor-view-card">
                <div className="contractor-view-fields">
                  <span className="contractor-view-label">Contractor Estimate</span>
                  <span className="estimate-view-amount">
                    ${(comparison?.estimate ?? claim.contractor_estimate_total ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <button
                  type="button"
                  className="edit-contractor-btn"
                  onClick={() => setIsEditingEstimate(true)}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                  Edit
                </button>
              </div>
            ) : (
              <>
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
                {!!claim.contractor_estimate_total && (
                  <button
                    type="button"
                    className="cancel-edit-btn"
                    onClick={() => {
                      setIsEditingEstimate(false)
                      const saved = claim.contractor_estimate_total!
                      setEstimateAmount(saved.toString())
                      setComparison({
                        estimate: saved,
                        deductible,
                        worthFiling: saved > deductible,
                      })
                    }}
                  >
                    Cancel
                  </button>
                )}
              </>
            )}

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
            {isEditingEstimate && (
              <button type="submit" disabled={step3Mutation.isPending || !comparison}>
                {step3Mutation.isPending
                  ? 'Saving...'
                  : !!claim.contractor_estimate_total
                    ? 'Save Changes'
                    : 'Continue to Next Step'}
              </button>
            )}
          </form>
        )

      case 4: {
        const isStep4Done = claim.steps_completed?.includes(4)
        const showReadOnly = isStep4Done && !isEditingDescription

        if (showReadOnly) {
          return (
            <div className="step-content">
              {/* Submitted confirmation banner */}
              <div className="filing-notice" style={{ borderLeftColor: '#10b981' }}>
                <div className="filing-notice-icon" style={{ background: '#10b981' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div className="filing-notice-body">
                  <strong className="filing-notice-title">Submitted to ClaimCoach team</strong>
                  <p className="filing-notice-text">
                    Your claim details have been sent. Our team will file this on your behalf.
                  </p>
                </div>
              </div>

              {/* Submitted description */}
              <div className="glass-card">
                <h4 className="review-heading" style={{ marginBottom: '12px' }}>Your Damage Description</h4>
                <p style={{
                  color: '#374151',
                  lineHeight: '1.6',
                  whiteSpace: 'pre-wrap',
                  margin: 0,
                  fontSize: '14px',
                }}>
                  {claim.description || '—'}
                </p>
              </div>

              {/* Edit & Resend */}
              <button
                type="button"
                onClick={() => setIsEditingDescription(true)}
                className="edit-contractor-btn"
              >
                Edit & Resend
              </button>
            </div>
          )
        }

        return (
          <form onSubmit={handleStep4Submit} className="step-content step-form">
            {/* Review Card */}
            <div className="glass-card">
              <h4 className="review-heading">Claim Details Review</h4>
              <div className="review-grid">
                <div className="review-item">
                  <span className="review-label">Loss Type</span>
                  <span className="review-value">
                    {claim.loss_type === 'water' ? '💧 Water Damage' : '🧊 Hail Damage'}
                  </span>
                </div>
                <div className="review-item">
                  <span className="review-label">Incident Date</span>
                  <span className="review-value">
                    {new Date(claim.incident_date).toLocaleDateString('en-US', {
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                </div>
                <div className="review-item">
                  <span className="review-label">Property</span>
                  <span className="review-value">
                    {claim.property?.nickname || claim.property?.legal_address || 'N/A'}
                  </span>
                </div>
                <div className="review-item">
                  <span className="review-label">Your Deductible</span>
                  <span className="review-value">
                    ${(claim.policy?.deductible_calculated || 0).toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>
                {!!claim.contractor_estimate_total && (
                  <div className="review-item">
                    <span className="review-label">Contractor Estimate</span>
                    <span className="review-value">
                      ${claim.contractor_estimate_total.toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Filing Notice Banner */}
            <div className="filing-notice">
              <div className="filing-notice-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="filing-notice-body">
                <strong className="filing-notice-title">ClaimCoach will file this claim on your behalf</strong>
                <p className="filing-notice-text">
                  Our team submits your claim directly to the insurance carrier. The more detail you provide
                  about the damage below — what was affected, how severe it is, and when it occurred —
                  the stronger your case will be.
                </p>
              </div>
            </div>

            {/* Description Field */}
            <div className="form-field">
              <label>
                Damage Description <span className="required">*</span>
              </label>
              <textarea
                required
                minLength={20}
                maxLength={2000}
                value={step4Description}
                onChange={(e) => setStep4Description(e.target.value)}
                placeholder="Describe the damage in detail. What happened? What was affected? Any additional information that would help the ClaimCoach team understand your situation..."
                rows={6}
                className="description-textarea"
              />
              <div className="char-count">
                {step4Description.length} / 2000 characters
                {step4Description.length < 20 && (
                  <span className="char-count-warning"> (minimum 20 required)</span>
                )}
              </div>
            </div>

            {step4Mutation.isError && (
              <div className="error">
                {(step4Mutation.error as any)?.response?.data?.error || 'Failed to submit claim'}
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              {isStep4Done && (
                <button
                  type="button"
                  onClick={() => {
                    setIsEditingDescription(false)
                    setStep4Description(claim.description || '')
                  }}
                  className="cancel-edit-btn"
                >
                  Cancel
                </button>
              )}
              <button
                type="submit"
                disabled={step4Mutation.isPending || step4Description.trim().length < 20}
              >
                {step4Mutation.isPending
                  ? 'Submitting...'
                  : isStep4Done
                  ? 'Resend to ClaimCoach Team'
                  : 'Submit to ClaimCoach Team'}
              </button>
            </div>
          </form>
        )
      }

      case 5:
        return (
          <form onSubmit={handleStep5Submit} className="step-content step-form">
            <div className="claimcoach-notice">
              <div className="claimcoach-notice-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M12 8v4m0 4h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div>
                <strong className="claimcoach-notice-title">This info comes from the ClaimCoach team</strong>
                <p className="claimcoach-notice-text">
                  Once your carrier assigns an adjuster, ClaimCoach will notify you with the claim number,
                  adjuster details, and inspection date. Enter those details here when you receive them.
                </p>
              </div>
            </div>
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
            {step5Mutation.isError && (
              <div className="error">
                {(step5Mutation.error as any)?.response?.data?.error || 'Failed to update'}
              </div>
            )}
            <button type="submit" disabled={step5Mutation.isPending}>
              {step5Mutation.isPending ? 'Saving...' : 'Complete This Step'}
            </button>
          </form>
        )

      case 6:
        return (
          <div className="step-content step-form">
            {/* Adjuster summary */}
            {claim.insurance_claim_number && (
              <div className="adjuster-summary-card">
                <div className="adjuster-summary-row">
                  <span className="adjuster-summary-label">Claim Number</span>
                  <span className="adjuster-summary-value">{claim.insurance_claim_number}</span>
                </div>
                {claim.adjuster_name && (
                  <div className="adjuster-summary-row">
                    <span className="adjuster-summary-label">Adjuster</span>
                    <span className="adjuster-summary-value">{claim.adjuster_name}{claim.adjuster_phone ? ` · ${claim.adjuster_phone}` : ''}</span>
                  </div>
                )}
                {claim.inspection_datetime && (
                  <div className="adjuster-summary-row">
                    <span className="adjuster-summary-label">Inspection</span>
                    <span className="adjuster-summary-value">
                      {new Date(claim.inspection_datetime).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* AI Audit header */}
            <div className="audit-section-header">
              <div className="audit-section-icon">🤖</div>
              <div>
                <strong className="audit-section-title">AI Estimate Audit</strong>
                <p className="audit-section-subtitle">Upload the carrier's PDF estimate to compare against your contractor's scope</p>
              </div>
            </div>

            {/* Phase 1: Upload zone */}
            {!latestCarrierEstimate && !uploadCarrierEstimateMutation.isPending && (
              <div className="audit-upload-zone">
                <div className="audit-upload-icon">📄</div>
                <div className="audit-upload-label">Insurance Carrier Estimate (PDF only)</div>
                <div className="audit-upload-hint">The estimate document your insurance company sent after the adjuster inspection</div>
                <label className="audit-file-btn">
                  {carrierEstimateFile ? `✓ ${carrierEstimateFile.name}` : 'Choose PDF File'}
                  <input
                    type="file"
                    accept=".pdf,application/pdf"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) setCarrierEstimateFile(file)
                    }}
                  />
                </label>
                {carrierEstimateFile && (
                  <button
                    type="button"
                    onClick={handleCarrierEstimateUpload}
                    disabled={uploadCarrierEstimateMutation.isPending}
                  >
                    Upload &amp; Parse PDF
                  </button>
                )}
                {uploadCarrierEstimateMutation.isError && (
                  <div className="error">
                    {(uploadCarrierEstimateMutation.error as any)?.response?.data?.error || 'Upload failed. Please try again.'}
                  </div>
                )}
              </div>
            )}

            {/* Uploading progress */}
            {uploadCarrierEstimateMutation.isPending && (
              <div className="audit-progress-card">
                <div className="audit-spinner" />
                <div>
                  <span className="audit-progress-label">Uploading PDF...</span>
                  <span className="audit-progress-sub">Sending file to storage</span>
                </div>
              </div>
            )}

            {/* Parsing progress */}
            {isParsing && !uploadCarrierEstimateMutation.isPending && (
              <div className="audit-progress-card">
                <div className="audit-spinner" />
                <div>
                  <span className="audit-progress-label">Parsing insurance document</span>
                  <span className="audit-progress-sub">Extracting line items from PDF — this takes about 30 seconds</span>
                </div>
              </div>
            )}

            {/* Parse failed */}
            {parseFailed && (
              <div className="audit-error-card">
                <span className="audit-error-text">Failed to parse PDF. The file may be corrupted or in an unsupported format. Try uploading a different file.</span>
                <button
                  type="button"
                  className="audit-retry-btn"
                  onClick={() => queryClient.setQueryData(['carrier-estimates', claim.id], [])}
                >
                  Try Again
                </button>
              </div>
            )}

            {/* Parsed — ready to run analysis */}
            {isParsed && !hasAuditResult && !generateAuditMutation.isPending && (
              <>
                <div className="audit-file-card">
                  <span className="audit-file-icon">📄</span>
                  <div className="audit-file-info">
                    <span className="audit-file-name">{latestCarrierEstimate?.file_name}</span>
                    <span className="audit-file-status">✓ Document parsed successfully</span>
                  </div>
                </div>
                <div className="audit-run-card">
                  <div className="audit-run-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <div className="audit-run-body">
                    <strong className="audit-run-title">Ready to analyze</strong>
                    <p className="audit-run-text">AI will compare the carrier's estimate against your contractor's scope sheet and flag any underpayments or missing items.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => generateAuditMutation.mutate()}
                  disabled={generateAuditMutation.isPending}
                >
                  Run AI Analysis
                </button>
                {generateAuditMutation.isError && (
                  <div className="error">
                    {(generateAuditMutation.error as any)?.response?.data?.error || 'Analysis failed. Please try again.'}
                  </div>
                )}
              </>
            )}

            {/* AI analyzing — fun loading screen */}
            {generateAuditMutation.isPending && (
              <div className="audit-loading-screen">
                <div className="audit-loading-orb">
                  <div className="audit-orb-ring audit-orb-ring-1" />
                  <div className="audit-orb-ring audit-orb-ring-2" />
                  <div className="audit-orb-ring audit-orb-ring-3" />
                  <div className="audit-orb-core">🤖</div>
                </div>
                <div className="audit-loading-steps">
                  {[
                    { icon: '📄', label: 'Reading carrier estimate' },
                    { icon: '🔍', label: 'Comparing against contractor scope' },
                    { icon: '⚡', label: 'Identifying discrepancies' },
                    { icon: '📊', label: 'Calculating delta amounts' },
                  ].map((s, i) => (
                    <div
                      key={i}
                      className={`audit-loading-step ${i < auditLoadingStep ? 'done' : i === auditLoadingStep ? 'active' : 'pending'}`}
                    >
                      <div className="audit-loading-step-icon">
                        {i < auditLoadingStep ? '✓' : s.icon}
                      </div>
                      <span className="audit-loading-step-label">{s.label}</span>
                    </div>
                  ))}
                </div>
                <p className="audit-loading-note">This takes about 60 seconds</p>
              </div>
            )}

            {/* Audit failed */}
            {auditReport?.status === 'failed' && (
              <div className="audit-error-card">
                <span className="audit-error-text">{auditReport.error_message || 'Analysis failed. Please try again.'}</span>
                <button
                  type="button"
                  className="audit-retry-btn"
                  onClick={() => generateAuditMutation.mutate()}
                  disabled={generateAuditMutation.isPending}
                >
                  Retry Analysis
                </button>
              </div>
            )}

            {/* Audit results */}
            {hasAuditResult && comparisonData && (
              <div className="audit-results">
                {/* Summary totals */}
                <div className="audit-summary-grid">
                  <div className="audit-summary-cell">
                    <span className="audit-summary-label">Industry Estimate</span>
                    <span className="audit-summary-value">
                      ${(comparisonData.summary.total_industry || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="audit-summary-cell">
                    <span className="audit-summary-label">Carrier Estimate</span>
                    <span className="audit-summary-value carrier-value">
                      ${(comparisonData.summary.total_carrier || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className={`audit-summary-cell ${(comparisonData.summary.total_delta || 0) > 0 ? 'delta-positive' : ''}`}>
                    <span className="audit-summary-label">Delta (Underpaid)</span>
                    <span className="audit-summary-delta">
                      ${Math.abs(comparisonData.summary.total_delta || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                {/* Discrepancies list */}
                {comparisonData.discrepancies.length > 0 ? (
                  <div className="audit-discrepancies">
                    <div className="audit-disc-header-row">
                      <span className="audit-disc-count">{comparisonData.discrepancies.length} Discrepanc{comparisonData.discrepancies.length === 1 ? 'y' : 'ies'} Found</span>
                    </div>
                    {comparisonData.discrepancies.map((disc, i) => (
                      <div key={i} className="audit-disc-item">
                        <div className="audit-disc-top">
                          <span className="audit-disc-item-name">{disc.item}</span>
                          <span className="audit-disc-delta-badge">+${(disc.delta || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="audit-disc-prices">
                          <span className="audit-disc-price">Industry: ${(disc.industry_price || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                          <span className="audit-disc-sep">·</span>
                          <span className="audit-disc-price carrier-price">Carrier: ${(disc.carrier_price || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                        </div>
                        {disc.justification && (
                          <p className="audit-disc-justification">{disc.justification}</p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="audit-no-disc">
                    <span>✓ No significant discrepancies found. The carrier estimate appears to be in line with industry standards.</span>
                  </div>
                )}

                {/* Rebuttal section */}
                {!rebuttalText && comparisonData.discrepancies.length > 0 && (
                  <div className="audit-rebuttal-cta">
                    <div>
                      <strong className="audit-rebuttal-cta-title">Generate a rebuttal letter?</strong>
                      <p className="audit-rebuttal-cta-text">Our AI will draft a professional letter addressing each discrepancy that you can send to your carrier to request additional payment.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => generateRebuttalMutation.mutate(auditReport!.id)}
                      disabled={generateRebuttalMutation.isPending}
                    >
                      {generateRebuttalMutation.isPending ? 'Generating...' : 'Generate Rebuttal Letter'}
                    </button>
                    {generateRebuttalMutation.isError && (
                      <div className="error">Failed to generate rebuttal. Please try again.</div>
                    )}
                  </div>
                )}

                {rebuttalText && (
                  <div className="audit-rebuttal">
                    <div className="audit-rebuttal-header">
                      <span className="audit-rebuttal-title">Rebuttal Letter</span>
                      <button
                        type="button"
                        className="audit-copy-btn"
                        onClick={() => {
                          navigator.clipboard.writeText(rebuttalText)
                          setToast({ message: '✓ Copied to clipboard', type: 'success' })
                        }}
                      >
                        Copy
                      </button>
                    </div>
                    <pre className="audit-rebuttal-text">{rebuttalText}</pre>
                  </div>
                )}
              </div>
            )}

            {/* Continue CTA — only shown after audit is complete */}
            {hasAuditResult && (
              <>
                {step6Mutation.isError && (
                  <div className="error">
                    {(step6Mutation.error as any)?.response?.data?.error || 'Failed to advance'}
                  </div>
                )}
                <button onClick={handleStep6Submit} disabled={step6Mutation.isPending} className="audit-continue-btn">
                  {step6Mutation.isPending ? 'Saving...' : 'Review Complete — Continue to Payments →'}
                </button>
              </>
            )}
          </div>
        )

      case 7:
        return (
          <div className="step-content step-form">
            {/* Mortgage bank endorsement warning */}
            {claim.property?.mortgage_bank_id && (
              <div className="mortgage-warning">
                <div className="mortgage-warning-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div>
                  <strong className="mortgage-warning-title">Mortgage Bank Endorsement Required</strong>
                  <p className="mortgage-warning-text">
                    Your property has a mortgage. Insurance checks are typically made out to both you
                    and your lender. Contact your mortgage servicer to endorse the check before depositing.
                  </p>
                </div>
              </div>
            )}

            {/* Payment summary bar */}
            {(acvPayment || rcvPayment) && (
              <div className="payment-summary-bar">
                <span className="payment-summary-label">Total Received</span>
                <span className="payment-summary-total">
                  ${totalReceived.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}

            {/* ACV Payment Card */}
            <div className="payment-section">
              <div className="payment-section-header">
                <div className="payment-type-badge acv-badge">ACV</div>
                <div>
                  <span className="payment-section-title">Actual Cash Value</span>
                  <span className="payment-section-subtitle">First check — received before or during repairs</span>
                </div>
              </div>

              {!isEditingAcv && acvPayment ? (
                <div className="contractor-view-card">
                  <div className="contractor-view-fields">
                    <div className="contractor-view-field">
                      <span className="contractor-view-label">Amount Received</span>
                      <span className="estimate-view-amount">
                        ${acvPayment.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="payment-view-meta">
                      {acvPayment.received_date && (
                        <span className="payment-meta-item">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                          </svg>
                          {new Date(acvPayment.received_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      )}
                      {acvPayment.check_number && (
                        <span className="payment-meta-item">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
                          </svg>
                          #{acvPayment.check_number}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="edit-contractor-btn"
                    onClick={() => setIsEditingAcv(true)}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                    Edit
                  </button>
                </div>
              ) : (
                <form onSubmit={handleAcvSubmit} className="payment-form">
                  <div className="form-grid">
                    <div className="form-field">
                      <label>Amount Received <span className="required">*</span></label>
                      <div className="input-with-prefix">
                        <span className="prefix">$</span>
                        <input
                          type="number"
                          step="0.01"
                          required
                          value={acvForm.amount}
                          onChange={e => setAcvForm({ ...acvForm, amount: e.target.value })}
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                    <div className="form-field">
                      <label>Date Received <span className="required">*</span></label>
                      <input
                        type="date"
                        required
                        value={acvForm.received_date}
                        onChange={e => setAcvForm({ ...acvForm, received_date: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="form-field">
                    <label>Check Number</label>
                    <input
                      type="text"
                      value={acvForm.check_number}
                      onChange={e => setAcvForm({ ...acvForm, check_number: e.target.value })}
                      placeholder="e.g. 10042"
                    />
                  </div>
                  {acvMutation.isError && (
                    <div className="error">
                      {(acvMutation.error as any)?.response?.data?.error || 'Failed to log payment'}
                    </div>
                  )}
                  <div className="payment-form-actions">
                    {acvPayment && (
                      <button type="button" className="cancel-edit-btn" onClick={() => setIsEditingAcv(false)}>
                        Cancel
                      </button>
                    )}
                    <button type="submit" className="payment-log-btn" disabled={acvMutation.isPending}>
                      {acvMutation.isPending ? 'Logging...' : 'Log ACV Payment'}
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* RCV Payment Card */}
            <div className="payment-section">
              <div className="payment-section-header">
                <div className="payment-type-badge rcv-badge">RCV</div>
                <div>
                  <span className="payment-section-title">Recoverable Cash Value</span>
                  <span className="payment-section-subtitle">Second check — received after repairs are complete</span>
                </div>
              </div>

              {!isEditingRcv && rcvPayment ? (
                <div className="contractor-view-card">
                  <div className="contractor-view-fields">
                    <div className="contractor-view-field">
                      <span className="contractor-view-label">Amount Received</span>
                      <span className="estimate-view-amount">
                        ${rcvPayment.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="payment-view-meta">
                      {rcvPayment.received_date && (
                        <span className="payment-meta-item">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                          </svg>
                          {new Date(rcvPayment.received_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      )}
                      {rcvPayment.check_number && (
                        <span className="payment-meta-item">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
                          </svg>
                          #{rcvPayment.check_number}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="edit-contractor-btn"
                    onClick={() => setIsEditingRcv(true)}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                    Edit
                  </button>
                </div>
              ) : (
                <form onSubmit={handleRcvSubmit} className="payment-form">
                  <div className="form-grid">
                    <div className="form-field">
                      <label>Amount Received <span className="required">*</span></label>
                      <div className="input-with-prefix">
                        <span className="prefix">$</span>
                        <input
                          type="number"
                          step="0.01"
                          required
                          value={rcvForm.amount}
                          onChange={e => setRcvForm({ ...rcvForm, amount: e.target.value })}
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                    <div className="form-field">
                      <label>Date Received <span className="required">*</span></label>
                      <input
                        type="date"
                        required
                        value={rcvForm.received_date}
                        onChange={e => setRcvForm({ ...rcvForm, received_date: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="form-field">
                    <label>Check Number</label>
                    <input
                      type="text"
                      value={rcvForm.check_number}
                      onChange={e => setRcvForm({ ...rcvForm, check_number: e.target.value })}
                      placeholder="e.g. 10043"
                    />
                  </div>
                  {rcvMutation.isError && (
                    <div className="error">
                      {(rcvMutation.error as any)?.response?.data?.error || 'Failed to log payment'}
                    </div>
                  )}
                  <div className="payment-form-actions">
                    {rcvPayment && (
                      <button type="button" className="cancel-edit-btn" onClick={() => setIsEditingRcv(false)}>
                        Cancel
                      </button>
                    )}
                    <button type="submit" className="payment-log-btn" disabled={rcvMutation.isPending}>
                      {rcvMutation.isPending ? 'Logging...' : 'Log RCV Payment'}
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* Close Claim */}
            {step7Mutation.isError && (
              <div className="error">
                {(step7Mutation.error as any)?.response?.data?.error || 'Failed to close claim'}
              </div>
            )}
            {confirmingClose ? (
              <div className="close-confirm">
                <div className="close-confirm-body">
                  <div className="close-confirm-icon">⚠️</div>
                  <div>
                    <strong className="close-confirm-title">Close this claim?</strong>
                    <p className="close-confirm-text">This will mark the claim as fully closed. Make sure all payments have been received before proceeding.</p>
                  </div>
                </div>
                <div className="close-confirm-actions">
                  <button
                    type="button"
                    className="cancel-edit-btn"
                    onClick={() => setConfirmingClose(false)}
                    disabled={step7Mutation.isPending}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="final"
                    onClick={handleStep7Submit}
                    disabled={step7Mutation.isPending}
                  >
                    {step7Mutation.isPending ? 'Closing...' : 'Yes, Close Claim'}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingClose(true)}
                className="final"
              >
                Close Claim
              </button>
            )}
          </div>
        )

      default:
        return null
    }
    })()

    if (!isLocked) return content

    return (
      <fieldset disabled className="step-locked-fieldset">
        {content}
      </fieldset>
    )
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

        /* Loading Skeleton */
        .animate-pulse {
          animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }

        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }

        .mt-3 {
          margin-top: 0.75rem;
        }

        .h-8 {
          height: 2rem;
        }

        .w-48 {
          width: 12rem;
        }

        .bg-slate-200 {
          background-color: #e2e8f0;
        }

        .rounded-full {
          border-radius: 9999px;
        }

        /* Glass Card (Step 4 Review) */
        .glass-card {
          background: rgba(255, 255, 255, 0.7);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(148, 163, 184, 0.2);
          border-radius: 12px;
          padding: 20px;
        }

        .review-heading {
          font-family: 'Work Sans', sans-serif;
          font-size: 16px;
          font-weight: 700;
          color: #0f172a;
          margin: 0 0 16px 0;
          letter-spacing: -0.01em;
        }

        .review-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }

        .review-item {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .review-label {
          font-size: 11px;
          font-weight: 600;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .review-value {
          font-size: 14px;
          font-weight: 600;
          color: #0f172a;
        }

        /* Description Textarea */
        .description-textarea {
          padding: 12px 14px;
          border: 2px solid rgba(148, 163, 184, 0.25);
          border-radius: 10px;
          font-size: 15px;
          font-family: inherit;
          transition: all 0.2s ease;
          background: white;
          resize: vertical;
          line-height: 1.5;
        }

        .description-textarea:focus {
          outline: none;
          border-color: #0d9488;
          box-shadow: 0 0 0 3px rgba(13, 148, 136, 0.1);
        }

        .char-count {
          font-size: 12px;
          color: #94a3b8;
          text-align: right;
        }

        .char-count-warning {
          color: #ef4444;
          font-weight: 600;
        }

        /* Filing Notice Banner (Step 4) */
        .filing-notice {
          display: flex;
          gap: 14px;
          align-items: flex-start;
          padding: 16px 18px;
          background: rgba(13, 148, 136, 0.05);
          border: 1px solid rgba(13, 148, 136, 0.18);
          border-left: 3px solid #0d9488;
          border-radius: 10px;
        }

        .filing-notice-icon {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          background: linear-gradient(135deg, #0d9488 0%, #14b8a6 100%);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          box-shadow: 0 2px 8px rgba(13, 148, 136, 0.25);
        }

        .filing-notice-body {
          flex: 1;
          min-width: 0;
        }

        .filing-notice-title {
          display: block;
          font-family: 'Work Sans', sans-serif;
          font-size: 14px;
          font-weight: 700;
          color: #0f172a;
          margin-bottom: 5px;
        }

        .filing-notice-text {
          font-size: 13px;
          color: #475569;
          line-height: 1.6;
          margin: 0;
        }

        /* Estimate amount display in locked view */
        .estimate-view-amount {
          font-family: 'Work Sans', sans-serif;
          font-size: 26px;
          font-weight: 800;
          color: #334155;
          letter-spacing: -0.02em;
          margin-top: 4px;
        }

        /* Contractor View Card (Step 2 locked state) */
        .contractor-view-card {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 18px 20px;
          background: rgba(241, 245, 249, 0.7);
          border: 1.5px solid rgba(148, 163, 184, 0.25);
          border-radius: 12px;
        }

        .contractor-view-fields {
          display: flex;
          flex-direction: column;
          gap: 14px;
          flex: 1;
          min-width: 0;
        }

        .contractor-view-field {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .contractor-view-label {
          font-size: 11px;
          font-weight: 600;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }

        .contractor-view-value {
          font-size: 15px;
          font-weight: 500;
          color: #475569;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .edit-contractor-btn {
          padding: 8px 14px;
          background: white;
          color: #64748b;
          border: 1.5px solid rgba(148, 163, 184, 0.35);
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          font-family: 'DM Sans', sans-serif;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          gap: 6px;
          flex-shrink: 0;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
        }

        .edit-contractor-btn:hover:not(:disabled) {
          background: rgba(13, 148, 136, 0.05);
          border-color: #0d9488;
          color: #0d9488;
          transform: none;
          box-shadow: 0 2px 8px rgba(13, 148, 136, 0.12);
        }

        .cancel-edit-btn {
          padding: 12px 20px;
          background: transparent;
          color: #64748b;
          border: 1.5px solid rgba(148, 163, 184, 0.35);
          border-radius: 10px;
          font-size: 14px;
          font-weight: 600;
          font-family: 'DM Sans', sans-serif;
          box-shadow: none;
        }

        .cancel-edit-btn:hover:not(:disabled) {
          background: rgba(241, 245, 249, 0.8);
          border-color: #94a3b8;
          color: #334155;
          transform: none;
          box-shadow: none;
        }

        /* Adjuster Summary Card (Step 6) */
        .adjuster-summary-card {
          background: rgba(241, 245, 249, 0.6);
          border: 1px solid rgba(148, 163, 184, 0.2);
          border-radius: 10px;
          padding: 16px 18px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .adjuster-summary-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
        }

        .adjuster-summary-label {
          font-size: 12px;
          font-weight: 600;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          white-space: nowrap;
        }

        .adjuster-summary-value {
          font-size: 14px;
          font-weight: 600;
          color: #334155;
          text-align: right;
        }

        /* AI Audit Section (Step 6) */
        .audit-section-header {
          display: flex;
          gap: 12px;
          align-items: flex-start;
        }

        .audit-section-icon {
          font-size: 24px;
          flex-shrink: 0;
          margin-top: 2px;
        }

        .audit-section-title {
          display: block;
          font-family: 'Work Sans', sans-serif;
          font-size: 15px;
          font-weight: 700;
          color: #0f172a;
          margin-bottom: 3px;
        }

        .audit-section-subtitle {
          font-size: 13px;
          color: #64748b;
          margin: 0;
          line-height: 1.5;
        }

        /* Upload zone */
        .audit-upload-zone {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          padding: 28px 24px;
          background: rgba(248, 250, 252, 0.8);
          border: 1.5px dashed rgba(148, 163, 184, 0.4);
          border-radius: 14px;
          text-align: center;
        }

        .audit-upload-icon {
          font-size: 36px;
        }

        .audit-upload-label {
          font-size: 15px;
          font-weight: 600;
          color: #334155;
        }

        .audit-upload-hint {
          font-size: 13px;
          color: #94a3b8;
          max-width: 340px;
          line-height: 1.5;
        }

        .audit-file-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 18px;
          background: white;
          color: #334155;
          border: 1.5px solid rgba(148, 163, 184, 0.4);
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 1px 3px rgba(0,0,0,0.06);
          font-family: 'DM Sans', sans-serif;
        }

        .audit-file-btn:hover {
          border-color: #0d9488;
          color: #0d9488;
          background: rgba(13, 148, 136, 0.04);
        }

        /* Progress card */
        .audit-progress-card {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 18px 20px;
          background: rgba(241, 245, 249, 0.7);
          border: 1px solid rgba(148, 163, 184, 0.2);
          border-radius: 12px;
        }

        .audit-analyzing {
          background: rgba(13, 148, 136, 0.04);
          border-color: rgba(13, 148, 136, 0.2);
        }

        .audit-spinner {
          width: 24px;
          height: 24px;
          border: 3px solid rgba(148, 163, 184, 0.3);
          border-top-color: #94a3b8;
          border-radius: 50%;
          flex-shrink: 0;
          animation: spin 0.8s linear infinite;
        }

        .audit-spinner-teal {
          border-color: rgba(13, 148, 136, 0.2);
          border-top-color: #0d9488;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .audit-progress-label {
          display: block;
          font-size: 14px;
          font-weight: 600;
          color: #334155;
          margin-bottom: 2px;
        }

        .audit-progress-sub {
          display: block;
          font-size: 12px;
          color: #94a3b8;
        }

        /* Error card */
        .audit-error-card {
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding: 16px 18px;
          background: rgba(239, 68, 68, 0.05);
          border: 1px solid rgba(239, 68, 68, 0.2);
          border-radius: 10px;
        }

        .audit-error-text {
          font-size: 13px;
          color: #dc2626;
          line-height: 1.5;
        }

        .audit-retry-btn {
          align-self: flex-start;
          padding: 8px 16px;
          font-size: 13px;
        }

        /* File card (after upload success) */
        .audit-file-card {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 16px;
          background: rgba(240, 253, 250, 0.7);
          border: 1px solid rgba(13, 148, 136, 0.2);
          border-radius: 10px;
        }

        .audit-file-icon {
          font-size: 24px;
          flex-shrink: 0;
        }

        .audit-file-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }

        .audit-file-name {
          font-size: 14px;
          font-weight: 600;
          color: #334155;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .audit-file-status {
          font-size: 12px;
          color: #0d9488;
          font-weight: 500;
        }

        /* Run analysis card */
        .audit-run-card {
          display: flex;
          gap: 14px;
          align-items: flex-start;
          padding: 16px 18px;
          background: rgba(249, 250, 251, 0.8);
          border: 1px solid rgba(148, 163, 184, 0.2);
          border-radius: 10px;
        }

        .audit-run-icon {
          width: 36px;
          height: 36px;
          border-radius: 8px;
          background: rgba(13, 148, 136, 0.1);
          color: #0d9488;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .audit-run-body {
          flex: 1;
          min-width: 0;
        }

        .audit-run-title {
          display: block;
          font-size: 14px;
          font-weight: 700;
          color: #0f172a;
          margin-bottom: 4px;
        }

        .audit-run-text {
          font-size: 13px;
          color: #64748b;
          line-height: 1.5;
          margin: 0;
        }

        /* Results section */
        .audit-results {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        /* Summary grid */
        .audit-summary-grid {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 1px;
          background: rgba(148, 163, 184, 0.15);
          border-radius: 12px;
          overflow: hidden;
          border: 1px solid rgba(148, 163, 184, 0.15);
        }

        .audit-summary-cell {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 14px 16px;
          background: white;
        }

        .audit-summary-label {
          font-size: 11px;
          font-weight: 600;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .audit-summary-value {
          font-family: 'Work Sans', sans-serif;
          font-size: 18px;
          font-weight: 800;
          color: #0f172a;
          letter-spacing: -0.02em;
        }

        .carrier-value {
          color: #64748b;
        }

        .delta-positive .audit-summary-label {
          color: #d97706;
        }

        .audit-summary-delta {
          font-family: 'Work Sans', sans-serif;
          font-size: 18px;
          font-weight: 800;
          color: #d97706;
          letter-spacing: -0.02em;
        }

        /* Discrepancies */
        .audit-discrepancies {
          display: flex;
          flex-direction: column;
          gap: 1px;
          border-radius: 12px;
          overflow: hidden;
          border: 1px solid rgba(148, 163, 184, 0.15);
        }

        .audit-disc-header-row {
          padding: 10px 16px;
          background: rgba(241, 245, 249, 0.7);
          border-bottom: 1px solid rgba(148, 163, 184, 0.15);
        }

        .audit-disc-count {
          font-size: 12px;
          font-weight: 700;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .audit-disc-item {
          display: flex;
          flex-direction: column;
          gap: 6px;
          padding: 14px 16px;
          background: white;
          border-bottom: 1px solid rgba(148, 163, 184, 0.1);
        }

        .audit-disc-item:last-child {
          border-bottom: none;
        }

        .audit-disc-top {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
        }

        .audit-disc-item-name {
          font-size: 14px;
          font-weight: 600;
          color: #0f172a;
          flex: 1;
          min-width: 0;
        }

        .audit-disc-delta-badge {
          padding: 2px 8px;
          background: rgba(217, 119, 6, 0.1);
          color: #d97706;
          border-radius: 5px;
          font-family: 'Work Sans', sans-serif;
          font-size: 12px;
          font-weight: 700;
          white-space: nowrap;
          flex-shrink: 0;
        }

        .audit-disc-prices {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .audit-disc-price {
          font-size: 12px;
          font-weight: 500;
          color: #64748b;
        }

        .carrier-price {
          color: #94a3b8;
        }

        .audit-disc-sep {
          color: #cbd5e1;
          font-size: 12px;
        }

        .audit-disc-justification {
          font-size: 12px;
          color: #64748b;
          line-height: 1.5;
          margin: 2px 0 0 0;
          padding-left: 10px;
          border-left: 2px solid rgba(148, 163, 184, 0.3);
        }

        /* No discrepancies */
        .audit-no-disc {
          padding: 14px 16px;
          background: rgba(240, 253, 250, 0.6);
          border: 1px solid rgba(13, 148, 136, 0.2);
          border-radius: 10px;
          font-size: 13px;
          color: #0d9488;
          font-weight: 500;
        }

        /* Rebuttal CTA */
        .audit-rebuttal-cta {
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding: 18px 20px;
          background: rgba(249, 250, 251, 0.8);
          border: 1px solid rgba(148, 163, 184, 0.2);
          border-radius: 12px;
        }

        .audit-rebuttal-cta-title {
          display: block;
          font-size: 14px;
          font-weight: 700;
          color: #0f172a;
          margin-bottom: 4px;
        }

        .audit-rebuttal-cta-text {
          font-size: 13px;
          color: #64748b;
          line-height: 1.5;
          margin: 0;
        }

        /* Rebuttal letter display */
        .audit-rebuttal {
          display: flex;
          flex-direction: column;
          gap: 0;
          border: 1px solid rgba(148, 163, 184, 0.2);
          border-radius: 12px;
          overflow: hidden;
        }

        .audit-rebuttal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          background: rgba(241, 245, 249, 0.7);
          border-bottom: 1px solid rgba(148, 163, 184, 0.15);
        }

        .audit-rebuttal-title {
          font-size: 13px;
          font-weight: 700;
          color: #334155;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .audit-copy-btn {
          padding: 6px 12px;
          background: white;
          color: #64748b;
          border: 1.5px solid rgba(148, 163, 184, 0.35);
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
          font-family: 'DM Sans', sans-serif;
          cursor: pointer;
          box-shadow: none;
        }

        .audit-copy-btn:hover:not(:disabled) {
          border-color: #0d9488;
          color: #0d9488;
          background: rgba(13, 148, 136, 0.04);
          transform: none;
          box-shadow: none;
        }

        .audit-rebuttal-text {
          padding: 18px 20px;
          background: white;
          font-size: 13px;
          font-family: 'DM Sans', monospace;
          color: #334155;
          line-height: 1.7;
          white-space: pre-wrap;
          word-break: break-word;
          margin: 0;
          max-height: 400px;
          overflow-y: auto;
        }

        /* AI Analysis Loading Screen */
        .audit-loading-screen {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 28px;
          padding: 36px 24px;
          background: linear-gradient(135deg, rgba(13, 148, 136, 0.03) 0%, rgba(99, 102, 241, 0.03) 100%);
          border: 1px solid rgba(13, 148, 136, 0.12);
          border-radius: 16px;
        }

        /* Animated orb */
        .audit-loading-orb {
          position: relative;
          width: 80px;
          height: 80px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .audit-orb-ring {
          position: absolute;
          border-radius: 50%;
          border: 2px solid transparent;
          border-top-color: #0d9488;
          animation: orb-spin linear infinite;
        }

        .audit-orb-ring-1 {
          width: 80px;
          height: 80px;
          animation-duration: 1.8s;
          border-top-color: rgba(13, 148, 136, 0.7);
        }

        .audit-orb-ring-2 {
          width: 60px;
          height: 60px;
          animation-duration: 1.2s;
          animation-direction: reverse;
          border-top-color: rgba(99, 102, 241, 0.5);
        }

        .audit-orb-ring-3 {
          width: 40px;
          height: 40px;
          animation-duration: 2.4s;
          border-top-color: rgba(20, 184, 166, 0.4);
        }

        @keyframes orb-spin {
          to { transform: rotate(360deg); }
        }

        .audit-orb-core {
          font-size: 20px;
          position: relative;
          z-index: 2;
          animation: orb-pulse 2s ease-in-out infinite;
        }

        @keyframes orb-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.15); }
        }

        /* Step list */
        .audit-loading-steps {
          display: flex;
          flex-direction: column;
          gap: 10px;
          width: 100%;
          max-width: 320px;
        }

        .audit-loading-step {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 14px;
          border-radius: 10px;
          transition: all 0.4s ease;
        }

        .audit-loading-step.pending {
          opacity: 0.35;
        }

        .audit-loading-step.active {
          background: rgba(13, 148, 136, 0.07);
          border: 1px solid rgba(13, 148, 136, 0.18);
          opacity: 1;
        }

        .audit-loading-step.done {
          opacity: 0.6;
        }

        .audit-loading-step-icon {
          width: 30px;
          height: 30px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 15px;
          flex-shrink: 0;
          transition: all 0.3s ease;
        }

        .audit-loading-step.active .audit-loading-step-icon {
          background: rgba(13, 148, 136, 0.12);
          animation: step-bounce 0.6s ease infinite alternate;
        }

        .audit-loading-step.done .audit-loading-step-icon {
          background: rgba(13, 148, 136, 0.1);
          color: #0d9488;
          font-size: 14px;
          font-weight: 700;
        }

        @keyframes step-bounce {
          from { transform: translateY(0); }
          to { transform: translateY(-3px); }
        }

        .audit-loading-step-label {
          font-size: 14px;
          font-weight: 500;
          color: #334155;
        }

        .audit-loading-step.active .audit-loading-step-label {
          font-weight: 600;
          color: #0d9488;
        }

        .audit-loading-note {
          font-size: 12px;
          color: #94a3b8;
          margin: 0;
        }

        /* Continue button after audit complete */
        .audit-continue-btn {
          background: linear-gradient(135deg, #0d9488 0%, #14b8a6 100%);
          font-size: 15px;
          font-weight: 700;
        }

        /* Mortgage Bank Warning */
        .mortgage-warning {
          display: flex;
          gap: 12px;
          align-items: flex-start;
          padding: 14px 16px;
          background: rgba(251, 191, 36, 0.06);
          border: 1px solid rgba(251, 191, 36, 0.3);
          border-left: 3px solid #f59e0b;
          border-radius: 10px;
        }

        .mortgage-warning-icon {
          width: 30px;
          height: 30px;
          border-radius: 8px;
          background: rgba(251, 191, 36, 0.15);
          color: #d97706;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .mortgage-warning-title {
          display: block;
          font-size: 13px;
          font-weight: 700;
          color: #92400e;
          margin-bottom: 4px;
        }

        .mortgage-warning-text {
          font-size: 12px;
          color: #78350f;
          line-height: 1.5;
          margin: 0;
        }

        /* Payment Summary Bar */
        .payment-summary-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 14px 18px;
          background: linear-gradient(135deg, rgba(13, 148, 136, 0.06) 0%, rgba(20, 184, 166, 0.04) 100%);
          border: 1px solid rgba(13, 148, 136, 0.15);
          border-radius: 10px;
        }

        .payment-summary-label {
          font-size: 13px;
          font-weight: 600;
          color: #0d9488;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }

        .payment-summary-total {
          font-family: 'Work Sans', sans-serif;
          font-size: 22px;
          font-weight: 800;
          color: #0d9488;
          letter-spacing: -0.02em;
        }

        /* Payment Section */
        .payment-section {
          display: flex;
          flex-direction: column;
          gap: 14px;
          padding: 18px 20px;
          background: rgba(248, 250, 252, 0.6);
          border: 1px solid rgba(148, 163, 184, 0.15);
          border-radius: 12px;
        }

        .payment-section-header {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .payment-type-badge {
          padding: 4px 10px;
          border-radius: 6px;
          font-family: 'Work Sans', sans-serif;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.08em;
          flex-shrink: 0;
        }

        .acv-badge {
          background: rgba(13, 148, 136, 0.12);
          color: #0d9488;
        }

        .rcv-badge {
          background: rgba(99, 102, 241, 0.1);
          color: #6366f1;
        }

        .payment-section-title {
          display: block;
          font-size: 14px;
          font-weight: 700;
          color: #0f172a;
        }

        .payment-section-subtitle {
          display: block;
          font-size: 12px;
          color: #94a3b8;
          margin-top: 1px;
        }

        .payment-form {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .payment-form-actions {
          display: flex;
          gap: 10px;
          align-items: center;
        }

        .payment-log-btn {
          padding: 12px 20px;
          font-size: 14px;
        }

        /* Payment view meta (date + check number chips) */
        .payment-view-meta {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          margin-top: 2px;
        }

        .payment-meta-item {
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 12px;
          font-weight: 500;
          color: #64748b;
        }

        /* ClaimCoach notice banner (Step 5) */
        .claimcoach-notice {
          display: flex;
          gap: 12px;
          align-items: flex-start;
          padding: 14px 16px;
          background: rgba(13, 148, 136, 0.05);
          border: 1px solid rgba(13, 148, 136, 0.18);
          border-left: 3px solid #0d9488;
          border-radius: 10px;
        }

        .claimcoach-notice-icon {
          width: 28px;
          height: 28px;
          border-radius: 8px;
          background: linear-gradient(135deg, #0d9488 0%, #14b8a6 100%);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          margin-top: 1px;
        }

        .claimcoach-notice-title {
          display: block;
          font-size: 13px;
          font-weight: 700;
          color: #0f172a;
          margin-bottom: 3px;
        }

        .claimcoach-notice-text {
          font-size: 13px;
          color: #475569;
          line-height: 1.55;
          margin: 0;
        }

        /* Close Claim confirmation */
        .close-confirm {
          display: flex;
          flex-direction: column;
          gap: 16px;
          padding: 18px 20px;
          background: rgba(251, 191, 36, 0.06);
          border: 1.5px solid rgba(251, 191, 36, 0.35);
          border-radius: 12px;
          animation: fadeIn 0.2s ease;
        }

        .close-confirm-body {
          display: flex;
          gap: 12px;
          align-items: flex-start;
        }

        .close-confirm-icon {
          font-size: 20px;
          flex-shrink: 0;
          margin-top: 1px;
        }

        .close-confirm-title {
          display: block;
          font-size: 14px;
          font-weight: 700;
          color: #92400e;
          margin-bottom: 4px;
        }

        .close-confirm-text {
          font-size: 13px;
          color: #78350f;
          line-height: 1.5;
          margin: 0;
        }

        .close-confirm-actions {
          display: flex;
          gap: 10px;
          justify-content: flex-end;
        }

        /* Step Locked — disable only interactive elements */
        .step-locked-fieldset {
          border: none;
          padding: 0;
          margin: 0;
          min-width: 0;
        }

        .step-locked-fieldset input,
        .step-locked-fieldset textarea,
        .step-locked-fieldset select,
        .step-locked-fieldset button,
        .step-locked-fieldset label {
          opacity: 0.45;
          cursor: not-allowed;
          pointer-events: none;
        }

        .step-locked-fieldset .required {
          display: none;
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

          .review-grid {
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

        {[1, 2, 3, 4, 5, 6, 7].map((stepNum) => {
          const step = getStepDefinition(stepNum as 1 | 2 | 3 | 4 | 5 | 6 | 7)
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
                  onClick={() => setActiveStep((isExpanded ? 0 : stepNum) as 1 | 2 | 3 | 4 | 5 | 6 | 7)}
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
