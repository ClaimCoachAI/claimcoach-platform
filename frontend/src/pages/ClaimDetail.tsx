import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api, { updateClaimEstimate, uploadCarrierEstimate, getCarrierEstimates, generateIndustryEstimate, getAuditReport, compareEstimates, generateRebuttal } from '../lib/api'
import Layout from '../components/Layout'
import ClaimStatusBadge from '../components/ClaimStatusBadge'
import MeetingsSection from '../components/MeetingsSection'
import PaymentsSection from '../components/PaymentsSection'
import RCVDemandSection from '../components/RCVDemandSection'
import MagicLinkHistory from '../components/MagicLinkHistory'
import ScopeSheetSummary from '../components/ScopeSheetSummary'
import { Claim, Policy } from '../types/claim'
import type { ScopeSheet } from '../types/scopeSheet'

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

interface CarrierEstimate {
  id: string
  claim_id: string
  uploaded_by_user_id: string
  file_path: string
  file_name: string
  file_size_bytes: number | null
  parsed_data: string | null
  parse_status: 'pending' | 'processing' | 'completed' | 'failed'
  parse_error: string | null
  uploaded_at: string
  parsed_at: string | null
}

interface ComparisonResult {
  deductible: number
  estimate: number
  delta: number
  recommendation: 'worth_filing' | 'not_worth_filing'
}

interface LineItem {
  description: string
  quantity: number
  unit: string
  unit_cost: number
  total: number
  category: string
}

interface GeneratedEstimate {
  line_items: LineItem[]
  subtotal: number
  overhead_profit: number
  total: number
}

interface Discrepancy {
  item: string
  industry_price: number
  carrier_price: number
  delta: number
  justification: string
}

interface ComparisonData {
  discrepancies: Discrepancy[]
  summary: {
    total_industry: number
    total_carrier: number
    total_delta: number
  }
}

interface AuditReport {
  id: string
  claim_id: string
  scope_sheet_id: string
  carrier_estimate_id: string | null
  generated_estimate: string | null
  comparison_data: string | null
  total_contractor_estimate: number | null
  total_carrier_estimate: number | null
  total_delta: number | null
  status: 'pending' | 'processing' | 'completed' | 'failed'
  error_message: string | null
  created_at: string
  updated_at: string
}

interface Rebuttal {
  id: string
  audit_report_id: string
  content: string
  created_at: string
  updated_at: string
}

interface AuditSectionWrapperProps {
  claimId: string
}

function AuditSectionWrapper({ claimId }: AuditSectionWrapperProps) {
  // Check if scope sheet exists
  const { data: scopeSheet, isLoading } = useQuery({
    queryKey: ['scope-sheet', claimId],
    queryFn: async () => {
      try {
        const response = await api.get(`/api/claims/${claimId}/scope-sheet`)
        return response.data.data
      } catch (error: any) {
        if (error.response?.status === 404) {
          return null
        }
        throw error
      }
    },
  })

  if (isLoading) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <div className="text-center text-gray-600">Loading...</div>
      </div>
    )
  }

  if (!scopeSheet) {
    return null
  }

  return <AuditSection claimId={claimId} hasScopeSheet={true} />
}

interface ContractorSubmissionWrapperProps {
  claimId: string
  documents: Document[]
  onDownload: (documentId: string) => void
  formatDate: (dateString?: string) => string
}

function ContractorSubmissionWrapper({ claimId, documents, onDownload, formatDate }: ContractorSubmissionWrapperProps) {
  const { data: scopeSheet, isLoading } = useQuery<ScopeSheet | null>({
    queryKey: ['scope-sheet', claimId],
    queryFn: async () => {
      try {
        const response = await api.get(`/api/claims/${claimId}/scope-sheet`)
        return response.data.data
      } catch (error: any) {
        if (error.response?.status === 404) {
          return null
        }
        throw error
      }
    },
  })

  if (isLoading || !scopeSheet || !scopeSheet.submitted_at) {
    return null
  }

  const contractorPhotos = documents.filter(d => d.document_type === 'contractor_photo')

  return (
    <div className="bg-white shadow rounded-lg">
      <div className="px-6 py-5 border-b border-gray-200">
        <h3 className="text-lg font-medium text-gray-900">Contractor Submission</h3>
      </div>
      <div className="px-6 py-5 space-y-6">
        <ScopeSheetSummary scopeSheet={scopeSheet} />

        {/* Contractor Photos */}
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-3">
            Photos ({contractorPhotos.length})
          </h4>
          {contractorPhotos.length > 0 ? (
            <ul className="divide-y divide-gray-100">
              {contractorPhotos.map(photo => (
                <li key={photo.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-gray-900 truncate max-w-xs">{photo.file_name}</span>
                  <div className="flex items-center gap-4 ml-4 shrink-0">
                    <span className="text-gray-500">{formatDate(photo.uploaded_at)}</span>
                    <button
                      onClick={() => onDownload(photo.id)}
                      className="text-blue-600 hover:text-blue-800 font-medium"
                    >
                      Download
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">No photos uploaded.</p>
          )}
        </div>
      </div>
    </div>
  )
}

interface AuditSectionProps {
  claimId: string
  hasScopeSheet: boolean
}

function AuditSection({ claimId, hasScopeSheet }: AuditSectionProps) {
  const queryClient = useQueryClient()

  // Fetch audit report
  const { data: auditReport, isLoading: loadingAudit } = useQuery<AuditReport | null>({
    queryKey: ['audit-report', claimId],
    queryFn: async () => {
      try {
        return await getAuditReport(claimId)
      } catch (error: any) {
        if (error.response?.status === 404) {
          return null
        }
        throw error
      }
    },
    enabled: hasScopeSheet,
  })

  // Fetch carrier estimates
  const { data: carrierEstimates } = useQuery({
    queryKey: ['carrier-estimates', claimId],
    queryFn: () => getCarrierEstimates(claimId),
    enabled: hasScopeSheet,
  })

  // Fetch rebuttal if audit report has comparison data
  const { data: rebuttal } = useQuery<Rebuttal | null>({
    queryKey: ['rebuttal', auditReport?.id],
    queryFn: async () => {
      if (!auditReport?.comparison_data) return null
      try {
        // Get the latest rebuttal for this audit report
        const response = await api.get(`/api/claims/${claimId}/audit/${auditReport.id}/rebuttal-latest`)
        return response.data.data
      } catch (error: any) {
        if (error.response?.status === 404) {
          return null
        }
        throw error
      }
    },
    enabled: !!auditReport?.comparison_data,
  })

  // Generate industry estimate mutation
  const generateEstimateMutation = useMutation({
    mutationFn: () => generateIndustryEstimate(claimId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audit-report', claimId] })
    },
  })

  // Compare estimates mutation
  const compareMutation = useMutation({
    mutationFn: () => compareEstimates(claimId, auditReport!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audit-report', claimId] })
    },
  })

  // Generate rebuttal mutation
  const rebuttalMutation = useMutation({
    mutationFn: () => generateRebuttal(claimId, auditReport!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rebuttal', auditReport!.id] })
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

  const downloadAsPDF = (content: string) => {
    // Create a simple text file download (PDF generation would require a library)
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `rebuttal-${claimId}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  if (!hasScopeSheet) {
    return null
  }

  if (loadingAudit) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <div className="text-center text-gray-600">Loading audit information...</div>
      </div>
    )
  }

  const generatedEstimate: GeneratedEstimate | null = auditReport?.generated_estimate
    ? JSON.parse(auditReport.generated_estimate)
    : null

  const comparisonData: ComparisonData | null = auditReport?.comparison_data
    ? JSON.parse(auditReport.comparison_data)
    : null

  const latestCarrierEstimate = carrierEstimates?.[0]
  const carrierParsedData = latestCarrierEstimate?.parsed_data
    ? JSON.parse(latestCarrierEstimate.parsed_data)
    : null

  const canGenerateEstimate = !auditReport
  const canCompare = auditReport && generatedEstimate && latestCarrierEstimate?.parse_status === 'completed'
  const canGenerateRebuttal = auditReport && comparisonData && !rebuttal

  return (
    <div className="bg-white shadow rounded-lg">
      <div className="px-6 py-5 border-b border-gray-200">
        <h3 className="text-lg font-medium text-gray-900">Audit & Rebuttal</h3>
        <p className="mt-1 text-sm text-gray-500">
          Generate industry estimates, compare with carrier estimates, and create rebuttal letters
        </p>
      </div>

      <div className="px-6 py-5 space-y-6">
        {/* Status Overview */}
        <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
          <div className="flex-1">
            <span className="text-sm font-medium text-gray-700">Audit Status:</span>
            <span className={`ml-2 px-2 py-1 text-xs font-medium rounded-full ${
              !auditReport
                ? 'bg-gray-100 text-gray-800'
                : auditReport.status === 'completed'
                ? 'bg-green-100 text-green-800'
                : auditReport.status === 'processing'
                ? 'bg-blue-100 text-blue-800'
                : auditReport.status === 'failed'
                ? 'bg-red-100 text-red-800'
                : 'bg-yellow-100 text-yellow-800'
            }`}>
              {!auditReport ? 'Not Started' : auditReport.status.charAt(0).toUpperCase() + auditReport.status.slice(1)}
            </span>
          </div>
        </div>

        {/* Industry Estimate Section */}
        <div className="border-t pt-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-base font-semibold text-gray-900">Industry Estimate</h4>
            {canGenerateEstimate && (
              <button
                onClick={() => generateEstimateMutation.mutate()}
                disabled={generateEstimateMutation.isPending}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm"
              >
                {generateEstimateMutation.isPending ? 'Generating...' : 'Generate Industry Estimate'}
              </button>
            )}
          </div>

          {generateEstimateMutation.isError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-800">
                Failed to generate estimate. Please try again.
              </p>
            </div>
          )}

          {generatedEstimate ? (
            <div className="space-y-4">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quantity</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Unit</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Unit Cost</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {generatedEstimate.line_items.map((item, idx) => (
                      <tr key={idx}>
                        <td className="px-4 py-3 text-sm text-gray-900">{item.description}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{item.quantity}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{item.unit}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{formatCurrency(item.unit_cost)}</td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{formatCurrency(item.total)}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{item.category}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50">
                    <tr>
                      <td colSpan={4} className="px-4 py-3 text-sm font-medium text-gray-900 text-right">Subtotal:</td>
                      <td className="px-4 py-3 text-sm font-semibold text-gray-900">{formatCurrency(generatedEstimate.subtotal)}</td>
                      <td></td>
                    </tr>
                    <tr>
                      <td colSpan={4} className="px-4 py-3 text-sm font-medium text-gray-900 text-right">Overhead & Profit:</td>
                      <td className="px-4 py-3 text-sm font-semibold text-gray-900">{formatCurrency(generatedEstimate.overhead_profit)}</td>
                      <td></td>
                    </tr>
                    <tr>
                      <td colSpan={4} className="px-4 py-3 text-sm font-bold text-gray-900 text-right">Total:</td>
                      <td className="px-4 py-3 text-sm font-bold text-gray-900">{formatCurrency(generatedEstimate.total)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <div className="text-xs text-gray-500">
                Generated: {formatDate(auditReport!.created_at)}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <p className="text-sm">No industry estimate generated yet</p>
            </div>
          )}
        </div>

        {/* Carrier Estimate Section */}
        {latestCarrierEstimate && (
          <div className="border-t pt-6">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-base font-semibold text-gray-900">Carrier Estimate</h4>
              <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                latestCarrierEstimate.parse_status === 'completed'
                  ? 'bg-green-100 text-green-800'
                  : latestCarrierEstimate.parse_status === 'processing'
                  ? 'bg-blue-100 text-blue-800'
                  : latestCarrierEstimate.parse_status === 'failed'
                  ? 'bg-red-100 text-red-800'
                  : 'bg-yellow-100 text-yellow-800'
              }`}>
                {latestCarrierEstimate.parse_status.charAt(0).toUpperCase() + latestCarrierEstimate.parse_status.slice(1)}
              </span>
            </div>

            {carrierParsedData ? (
              <div className="space-y-4">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quantity</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Unit</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Unit Cost</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {carrierParsedData.line_items.map((item: LineItem, idx: number) => (
                        <tr key={idx}>
                          <td className="px-4 py-3 text-sm text-gray-900">{item.description}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{item.quantity}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{item.unit}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{formatCurrency(item.unit_cost)}</td>
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">{formatCurrency(item.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50">
                      <tr>
                        <td colSpan={4} className="px-4 py-3 text-sm font-bold text-gray-900 text-right">Total:</td>
                        <td className="px-4 py-3 text-sm font-bold text-gray-900">{formatCurrency(carrierParsedData.total)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>Parsed: {latestCarrierEstimate.parsed_at ? formatDate(latestCarrierEstimate.parsed_at) : 'N/A'}</span>
                  <a
                    href={`/api/documents/${latestCarrierEstimate.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800"
                  >
                    View Original PDF
                  </a>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <p className="text-sm">
                  {latestCarrierEstimate.parse_status === 'pending' || latestCarrierEstimate.parse_status === 'processing'
                    ? 'Parsing in progress...'
                    : 'Carrier estimate not yet parsed'}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Comparison Section */}
        {generatedEstimate && latestCarrierEstimate && (
          <div className="border-t pt-6">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-base font-semibold text-gray-900">Comparison</h4>
              {canCompare && !comparisonData && (
                <button
                  onClick={() => compareMutation.mutate()}
                  disabled={compareMutation.isPending}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm"
                >
                  {compareMutation.isPending ? 'Comparing...' : 'Compare Estimates'}
                </button>
              )}
            </div>

            {compareMutation.isError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-800">
                  Failed to compare estimates. Please try again.
                </p>
              </div>
            )}

            {comparisonData ? (
              <div className="space-y-4">
                {/* Summary */}
                <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Industry Total</div>
                    <div className="text-lg font-semibold text-gray-900">
                      {formatCurrency(comparisonData.summary.total_industry)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Carrier Total</div>
                    <div className="text-lg font-semibold text-gray-900">
                      {formatCurrency(comparisonData.summary.total_carrier)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Delta</div>
                    <div className={`text-lg font-semibold ${
                      comparisonData.summary.total_delta > 0 ? 'text-red-600' : 'text-green-600'
                    }`}>
                      {comparisonData.summary.total_delta > 0 ? '+' : ''}{formatCurrency(comparisonData.summary.total_delta)}
                    </div>
                  </div>
                </div>

                {/* Discrepancies Table */}
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Industry Price</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Carrier Price</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Delta</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Justification</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {comparisonData.discrepancies.map((disc, idx) => (
                        <tr key={idx}>
                          <td className="px-4 py-3 text-sm text-gray-900">{disc.item}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{formatCurrency(disc.industry_price)}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{formatCurrency(disc.carrier_price)}</td>
                          <td className={`px-4 py-3 text-sm font-medium ${
                            disc.delta > 0 ? 'text-red-600' : 'text-green-600'
                          }`}>
                            {disc.delta > 0 ? '+' : ''}{formatCurrency(disc.delta)}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700">{disc.justification}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <p className="text-sm">No comparison generated yet</p>
              </div>
            )}
          </div>
        )}

        {/* Rebuttal Section */}
        {comparisonData && (
          <div className="border-t pt-6">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-base font-semibold text-gray-900">Rebuttal Letter</h4>
              {canGenerateRebuttal && (
                <button
                  onClick={() => rebuttalMutation.mutate()}
                  disabled={rebuttalMutation.isPending}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm"
                >
                  {rebuttalMutation.isPending ? 'Generating...' : 'Generate Rebuttal'}
                </button>
              )}
            </div>

            {rebuttalMutation.isError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-800">
                  Failed to generate rebuttal. Please try again.
                </p>
              </div>
            )}

            {rebuttal ? (
              <div className="space-y-4">
                <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <pre className="text-sm text-gray-800 whitespace-pre-wrap font-sans">{rebuttal.content}</pre>
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-xs text-gray-500">
                    Generated: {formatDate(rebuttal.created_at)}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => copyToClipboard(rebuttal.content)}
                      className="px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
                    >
                      Copy to Clipboard
                    </button>
                    <button
                      onClick={() => downloadAsPDF(rebuttal.content)}
                      className="px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
                    >
                      Download as Text
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <p className="text-sm">No rebuttal generated yet</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

interface CarrierEstimateUploadProps {
  claimId: string
}

function CarrierEstimateUpload({ claimId }: CarrierEstimateUploadProps) {
  const queryClient = useQueryClient()
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)

  // Fetch carrier estimates
  const { data: estimates, isLoading } = useQuery({
    queryKey: ['carrier-estimates', claimId],
    queryFn: () => getCarrierEstimates(claimId),
  })

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadCarrierEstimate(claimId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['carrier-estimates', claimId] })
      setSelectedFile(null)
      setUploadProgress(0)
    },
  })

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      // Validate file type
      if (file.type !== 'application/pdf') {
        alert('Only PDF files are allowed')
        return
      }
      // Validate file size (10MB max)
      if (file.size > 10 * 1024 * 1024) {
        alert('File size must be less than 10MB')
        return
      }
      setSelectedFile(file)
    }
  }

  const handleUpload = async () => {
    if (!selectedFile) {
      alert('Please select a file first')
      return
    }

    setUploadProgress(25)
    uploadMutation.mutate(selectedFile)
    setUploadProgress(100)
  }

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return 'N/A'
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { color: string; label: string }> = {
      pending: { color: 'bg-yellow-100 text-yellow-800', label: 'Pending' },
      processing: { color: 'bg-blue-100 text-blue-800', label: 'Processing' },
      completed: { color: 'bg-green-100 text-green-800', label: 'Completed' },
      failed: { color: 'bg-red-100 text-red-800', label: 'Failed' },
    }
    const config = statusConfig[status] || statusConfig.pending
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${config.color}`}>
        {config.label}
      </span>
    )
  }

  return (
    <div className="bg-white shadow rounded-lg">
      <div className="px-6 py-5 border-b border-gray-200">
        <h3 className="text-lg font-medium text-gray-900">Carrier Estimate</h3>
        <p className="mt-1 text-sm text-gray-500">
          Upload carrier estimate PDFs for comparison and analysis
        </p>
      </div>

      <div className="px-6 py-5">
        {/* Upload Section */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Upload Carrier Estimate PDF
          </label>
          <div className="flex items-center space-x-3">
            <input
              type="file"
              accept=".pdf,application/pdf"
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              disabled={uploadMutation.isPending}
            />
            <button
              onClick={handleUpload}
              disabled={!selectedFile || uploadMutation.isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {uploadMutation.isPending ? 'Uploading...' : 'Upload'}
            </button>
          </div>
          {selectedFile && (
            <p className="mt-2 text-sm text-gray-600">
              Selected: {selectedFile.name} ({formatFileSize(selectedFile.size)})
            </p>
          )}
          {uploadMutation.isPending && uploadProgress > 0 && (
            <div className="mt-2">
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}
          {uploadMutation.isError && (
            <p className="mt-2 text-sm text-red-600">
              Upload failed. Please try again.
            </p>
          )}
          {uploadMutation.isSuccess && (
            <p className="mt-2 text-sm text-green-600">
              Upload successful!
            </p>
          )}
        </div>

        {/* Estimates List */}
        <div>
          <h4 className="text-sm font-medium text-gray-900 mb-3">Uploaded Estimates</h4>
          {isLoading ? (
            <div className="text-center py-4 text-gray-600">
              Loading estimates...
            </div>
          ) : estimates && estimates.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      File Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Size
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Uploaded
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {estimates.map((estimate: CarrierEstimate) => (
                    <tr key={estimate.id} className="hover:bg-gray-50">
                      <td className="px-4 py-4 text-sm text-gray-900">
                        {estimate.file_name}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-600">
                        {formatFileSize(estimate.file_size_bytes)}
                      </td>
                      <td className="px-4 py-4">
                        {getStatusBadge(estimate.parse_status)}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-600">
                        {formatDate(estimate.uploaded_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
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
              <p className="mt-2 text-sm">No carrier estimates uploaded yet</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface DeductibleAnalysisProps {
  claim: Claim
  policy: Policy
  onEstimateUpdated: () => void
}

function DeductibleAnalysis({ claim, policy, onEstimateUpdated }: DeductibleAnalysisProps) {
  const [estimateInput, setEstimateInput] = useState('')
  const [comparison, setComparison] = useState<ComparisonResult | null>(null)

  const updateEstimateMutation = useMutation({
    mutationFn: (estimateTotal: number) =>
      updateClaimEstimate(claim.id, estimateTotal),
    onSuccess: (response) => {
      setComparison(response.data.data.comparison)
      onEstimateUpdated()
      // Clear input on success
      setEstimateInput('')
    }
  })

  const handleCalculate = () => {
    const amount = parseFloat(estimateInput)
    if (isNaN(amount) || amount <= 0) {
      alert('Please enter a valid amount')
      return
    }
    updateEstimateMutation.mutate(amount)
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount)
  }

  // Load existing estimate if it exists
  useEffect(() => {
    if (claim.contractor_estimate_total && policy.deductible_calculated) {
      const delta = claim.contractor_estimate_total - policy.deductible_calculated
      setComparison({
        deductible: policy.deductible_calculated,
        estimate: claim.contractor_estimate_total,
        delta,
        recommendation: delta > 0 ? 'worth_filing' : 'not_worth_filing'
      })
    }
  }, [claim.contractor_estimate_total, policy.deductible_calculated])

  return (
    <div className="bg-white rounded-lg shadow p-6 mb-6">
      <h2 className="text-xl font-semibold mb-4">Deductible Analysis</h2>

      <div className="space-y-4">
        {/* Deductible display */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Policy Deductible
          </label>
          <div className="text-2xl font-bold text-gray-900">
            {formatCurrency(policy.deductible_calculated || 0)}
          </div>
        </div>

        {/* Estimate input */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Contractor Estimate Total
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              value={estimateInput}
              onChange={(e) => setEstimateInput(e.target.value)}
              placeholder="0.00"
              className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              disabled={updateEstimateMutation.isPending}
            />
            <button
              onClick={handleCalculate}
              disabled={updateEstimateMutation.isPending || !estimateInput}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {updateEstimateMutation.isPending ? 'Calculating...' : 'Calculate'}
            </button>
          </div>
        </div>

        {/* Comparison result */}
        {comparison && (
          <div className={`mt-4 p-4 rounded-lg border-2 ${
            comparison.recommendation === 'worth_filing'
              ? 'bg-green-50 border-green-200'
              : 'bg-red-50 border-red-200'
          }`}>
            <div className="flex items-start gap-3">
              <div className="text-2xl">
                {comparison.recommendation === 'worth_filing' ? '\u2705' : '\u26A0\uFE0F'}
              </div>
              <div className="flex-1">
                <h3 className={`text-lg font-semibold mb-2 ${
                  comparison.recommendation === 'worth_filing'
                    ? 'text-green-800'
                    : 'text-red-800'
                }`}>
                  {comparison.recommendation === 'worth_filing'
                    ? 'WORTH FILING'
                    : 'NOT WORTH FILING'}
                </h3>

                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Contractor Estimate:</span>
                    <span className="font-medium">{formatCurrency(comparison.estimate)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Policy Deductible:</span>
                    <span className="font-medium">{formatCurrency(comparison.deductible)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-1 mt-1">
                    <span className="text-gray-600">
                      {comparison.recommendation === 'worth_filing'
                        ? 'Expected Payout:'
                        : 'Amount Below Deductible:'}
                    </span>
                    <span className={`font-bold ${
                      comparison.recommendation === 'worth_filing'
                        ? 'text-green-700'
                        : 'text-red-700'
                    }`}>
                      {formatCurrency(Math.abs(comparison.delta))}
                    </span>
                  </div>
                </div>

                <p className={`mt-3 text-sm ${
                  comparison.recommendation === 'worth_filing'
                    ? 'text-green-700'
                    : 'text-red-700'
                }`}>
                  {comparison.recommendation === 'worth_filing'
                    ? 'The estimate exceeds your deductible. Proceeding with this claim should result in a payout.'
                    : 'The estimate is below your deductible. Filing this claim would result in $0 payout.'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Error display */}
        {updateEstimateMutation.isError && (
          <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-800">
              Failed to update estimate. Please try again.
            </p>
          </div>
        )}
      </div>
    </div>
  )
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

// Main Claim Detail Component
export default function ClaimDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [selectedStatus, setSelectedStatus] = useState<string>('')
  const [showSuccessMessage, setShowSuccessMessage] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string>('')

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

  // Auto-dismiss success message
  useEffect(() => {
    if (showSuccessMessage) {
      const timer = setTimeout(() => setShowSuccessMessage(false), 3000)
      return () => clearTimeout(timer)
    }
  }, [showSuccessMessage])

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
    },
  })

  // Document download handler
  const handleDocumentDownload = async (documentId: string) => {
    try {
      const response = await api.get(`/api/documents/${documentId}`)
      const downloadUrl = response.data.data.download_url

      // Validate URL is HTTPS or from our API domain
      const isValid = downloadUrl.startsWith('https://') ||
                      downloadUrl.startsWith(import.meta.env.VITE_API_URL || '')

      if (!isValid) {
        throw new Error('Invalid download URL received')
      }

      window.open(downloadUrl, '_blank', 'noopener,noreferrer')
    } catch (error) {
      setErrorMessage(
        error instanceof Error && error.message.includes('Invalid')
          ? 'Invalid download URL. Please contact support.'
          : 'Failed to download document. Please try again.'
      )
      setTimeout(() => setErrorMessage(''), 5000)
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

        {/* Error Message */}
        {errorMessage && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-4">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-800">{errorMessage}</p>
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

            {/* Contractor Submission - scope sheet + photos */}
            {claim && documents && (
              <ContractorSubmissionWrapper
                claimId={claim.id}
                documents={documents}
                onDownload={handleDocumentDownload}
                formatDate={formatDate}
              />
            )}

            {/* Magic Link History */}
            {claim && <MagicLinkHistory claimId={claim.id} />}

            {/* Carrier Estimate Upload - show for audit_pending and negotiating status */}
            {claim && ['audit_pending', 'negotiating'].includes(claim.status) && (
              <CarrierEstimateUpload claimId={claim.id} />
            )}

            {/* Audit Section - show for audit_pending and negotiating status */}
            {claim && ['audit_pending', 'negotiating'].includes(claim.status) && (
              <AuditSectionWrapper claimId={claim.id} />
            )}

            {/* Phase 7: Meetings Section - show in field_scheduled status */}
            {claim && ['field_scheduled'].includes(claim.status) && (
              <MeetingsSection claimId={claim.id} />
            )}

            {/* Phase 7: Payments Section - show after filed status */}
            {claim && !['draft', 'assessing'].includes(claim.status) && (
              <PaymentsSection claimId={claim.id} />
            )}

            {/* Phase 7: RCV Demand Section - show after filed status */}
            {claim && !['draft', 'assessing'].includes(claim.status) && (
              <RCVDemandSection claimId={claim.id} />
            )}

            {/* Deductible Analysis - only show in draft/assessing status */}
            {claim && claim.policy && ['draft', 'assessing'].includes(claim.status) && (
              <DeductibleAnalysis
                claim={claim}
                policy={claim.policy}
                onEstimateUpdated={() => {
                  queryClient.invalidateQueries({ queryKey: ['claim', id] })
                  queryClient.invalidateQueries({ queryKey: ['claim-activities', id] })
                }}
              />
            )}

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
