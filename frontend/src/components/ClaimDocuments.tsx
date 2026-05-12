import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api, { uploadClaimDocument, getClaimDocumentDownloadUrl, deleteClaimDocument } from '../lib/api'

interface Document {
  id: string
  claim_id: string
  uploaded_by_user_id: string | null
  document_type: string
  file_url: string
  file_name: string
  file_size_bytes: number
  mime_type: string
  status: string
  created_at: string
}

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  pa_contract: 'PA Contract',
  letter_of_representation: 'Letter of Representation',
  carrier_acknowledgement: 'Carrier Acknowledgement',
  contractor_estimate: 'Contractor Estimate',
  carrier_estimate: 'Carrier Estimate',
  policy_pdf: 'Policy PDF',
  proof_of_repair: 'Proof of Repair',
  other: 'Other',
}

const UPLOAD_TYPE_OPTIONS = [
  { value: 'pa_contract', label: 'PA Contract' },
  { value: 'letter_of_representation', label: 'Letter of Representation' },
  { value: 'carrier_acknowledgement', label: 'Carrier Acknowledgement' },
  { value: 'contractor_estimate', label: 'Contractor Estimate' },
  { value: 'carrier_estimate', label: 'Carrier Estimate' },
  { value: 'policy_pdf', label: 'Policy PDF' },
  { value: 'proof_of_repair', label: 'Proof of Repair' },
  { value: 'other', label: 'Other' },
]

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

interface ClaimDocumentsProps {
  claimId: string
}

export default function ClaimDocuments({ claimId }: ClaimDocumentsProps) {
  const queryClient = useQueryClient()
  const [showUploadForm, setShowUploadForm] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [documentType, setDocumentType] = useState('pa_contract')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const { data: documents, isLoading } = useQuery({
    queryKey: ['claim-documents', claimId],
    queryFn: async () => {
      const response = await api.get(`/api/claims/${claimId}/documents`)
      return response.data.data as Document[]
    },
  })

  const handleUpload = async () => {
    if (!selectedFile) return
    setUploading(true)
    setUploadError(null)
    try {
      await uploadClaimDocument(claimId, selectedFile, documentType)
      await queryClient.invalidateQueries({ queryKey: ['claim-documents', claimId] })
      setShowUploadForm(false)
      setSelectedFile(null)
      setDocumentType('pa_contract')
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleDownload = async (documentId: string) => {
    try {
      const url = await getClaimDocumentDownloadUrl(documentId)
      window.open(url, '_blank')
    } catch {
      alert('Failed to generate download link. Please try again.')
    }
  }

  const handleDelete = async (documentId: string, fileName: string) => {
    if (!window.confirm(`Delete "${fileName}"? This cannot be undone.`)) return
    try {
      await deleteClaimDocument(claimId, documentId)
      await queryClient.invalidateQueries({ queryKey: ['claim-documents', claimId] })
    } catch {
      alert('Failed to delete document. Please try again.')
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-gray-900">Documents</h2>
        {!showUploadForm && (
          <button
            onClick={() => setShowUploadForm(true)}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Upload Document
          </button>
        )}
      </div>

      {/* Upload Form */}
      {showUploadForm && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">File</label>
              <input
                type="file"
                accept=".pdf,image/jpeg,image/png,image/heic"
                onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Document Type</label>
              <select
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value)}
                className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                {UPLOAD_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            {uploadError && (
              <p className="text-sm text-red-600">{uploadError}</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowUploadForm(false)
                  setSelectedFile(null)
                  setUploadError(null)
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={!selectedFile || uploading}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading ? 'Uploading...' : 'Upload'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document List */}
      <div className="bg-white shadow rounded-lg">
        {isLoading ? (
          <div className="px-6 py-8 text-center text-gray-500 text-sm">Loading documents...</div>
        ) : documents && documents.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">File Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Uploaded By</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {documents.map((doc) => (
                  <tr key={doc.id} className="hover:bg-gray-50">
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                        {DOCUMENT_TYPE_LABELS[doc.document_type] ?? doc.document_type}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-900">{doc.file_name}</td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">{doc.uploaded_by_user_id ?? '—'}</td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(doc.created_at)}</td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm space-x-3">
                      <button
                        onClick={() => handleDownload(doc.id)}
                        className="text-blue-600 hover:text-blue-800 font-medium"
                      >
                        Download
                      </button>
                      <button
                        onClick={() => handleDelete(doc.id, doc.file_name)}
                        className="text-red-600 hover:text-red-800 font-medium"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-6 py-12 text-center">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">No documents uploaded yet</h3>
            <p className="mt-1 text-sm text-gray-500">Upload your first document using the button above.</p>
          </div>
        )}
      </div>
    </div>
  )
}
