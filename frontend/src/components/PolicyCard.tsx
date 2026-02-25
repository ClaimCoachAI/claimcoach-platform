import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { Policy } from '../types/claim'

interface PolicyCardProps {
  propertyId: string
  policy: Policy | null
  onSuccess: () => void
  onDelete: () => void
  pdfUrl?: string | null
  isUploadingPdf?: boolean
  uploadPdfError?: unknown
  onUploadPdf?: (file: File) => void
}

export default function PolicyCard({
  propertyId,
  policy,
  onSuccess,
  onDelete,
  pdfUrl,
  isUploadingPdf,
  uploadPdfError,
  onUploadPdf,
}: PolicyCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const queryClient = useQueryClient()

  const [formData, setFormData] = useState({
    carrier_name: policy?.carrier_name || '',
    carrier_phone: policy?.carrier_phone || '',
    carrier_email: policy?.carrier_email || '',
    policy_number: policy?.policy_number || '',
    deductible_value: policy?.deductible_value?.toString() || '',
    exclusions: policy?.exclusions || '',
    effective_date: policy?.effective_date || '',
    expiration_date: policy?.expiration_date || '',
  })

  // Reset form when policy changes
  useEffect(() => {
    if (policy) {
      setFormData({
        carrier_name: policy.carrier_name || '',
        carrier_phone: policy.carrier_phone || '',
        carrier_email: policy.carrier_email || '',
        policy_number: policy.policy_number || '',
        deductible_value: policy.deductible_value?.toString() || '',
        exclusions: policy.exclusions || '',
        effective_date: policy.effective_date || '',
        expiration_date: policy.expiration_date || '',
      })
    }
  }, [policy])

  const mutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const payload = {
        carrier_name: data.carrier_name,
        carrier_phone: data.carrier_phone || undefined,
        carrier_email: data.carrier_email || undefined,
        policy_number: data.policy_number || undefined,
        deductible_value: data.deductible_value ? parseFloat(data.deductible_value) : undefined,
        exclusions: data.exclusions || undefined,
        effective_date: data.effective_date || undefined,
        expiration_date: data.expiration_date || undefined,
      }

      const response = await api.post(`/api/properties/${propertyId}/policy`, payload)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['policy', propertyId] })
      queryClient.invalidateQueries({ queryKey: ['property', propertyId] })
      queryClient.invalidateQueries({ queryKey: ['properties'] })
      setTimeout(() => {
        setIsEditing(false)
        onSuccess()
      }, 100)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    mutation.mutate(formData)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleCancel = () => {
    if (policy) {
      setFormData({
        carrier_name: policy.carrier_name || '',
        carrier_phone: policy.carrier_phone || '',
        carrier_email: policy.carrier_email || '',
        policy_number: policy.policy_number || '',
        deductible_value: policy.deductible_value?.toString() || '',
        exclusions: policy.exclusions || '',
        effective_date: policy.effective_date || '',
        expiration_date: policy.expiration_date || '',
      })
    }
    setIsEditing(false)
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  const formatCurrency = (amount?: number | string) => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount
    if (num === undefined || num === null || isNaN(num as number)) return 'N/A'
    return `$${num.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`
  }

  const getErrorMessage = (error: any): string => {
    const backendError = error?.response?.data?.error
    if (!backendError) {
      return error instanceof Error ? error.message : 'An error occurred while saving the policy'
    }
    if (backendError.includes('DeductibleValue')) {
      if (backendError.includes('required')) return 'Deductible Value is required'
      if (backendError.includes('min')) return 'Deductible Value must be 0 or greater'
    }
    if (backendError.includes('CarrierName')) {
      return 'Insurance Carrier is required'
    }
    return backendError
  }

  // If no policy and not editing, show add form
  if (!policy && !isEditing) {
    return (
      <div className="policy-card-container">
        <style>{policyCardStyles}</style>
        <div className="policy-card-empty">
          <div className="empty-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h4 className="empty-title">No Policy Information</h4>
          <p className="empty-description">Add insurance policy details for this property</p>
          <button
            onClick={() => setIsEditing(true)}
            className="btn-add-policy"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Policy
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="policy-card-container">
      <style>{policyCardStyles}</style>

      {!isEditing && policy ? (
        // Display Mode
        <div className="policy-card-display">
          <div className="policy-card-header">
            <div>
              <h3 className="policy-card-title">Insurance Policy</h3>
              <p className="policy-status">
                <span className="status-dot"></span>
                Active Coverage
              </p>
            </div>
            <div className="policy-card-actions">
              <button onClick={() => setIsEditing(true)} className="btn-edit">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit
              </button>
              <button onClick={onDelete} className="btn-delete" title="Delete Policy">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>

          {/* PDF Row */}
          <div style={{ marginBottom: '20px', paddingBottom: '20px', borderBottom: '1px solid var(--color-sand-200)' }}>
            <label className="policy-label">Policy Document</label>
            {pdfUrl ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'white', border: '1px solid var(--color-sand-200)', borderRadius: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" style={{ color: '#ef4444' }}>
                    <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                  </svg>
                  <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--color-sand-900)' }}>Policy.pdf</span>
                </div>
                <button
                  onClick={async () => {
                    try {
                      const res = await api.get(`/api/properties/${propertyId}/policy/pdf/url`)
                      window.open(res.data.data.url, '_blank', 'noopener,noreferrer')
                    } catch {
                      alert('Could not load PDF. Please try again.')
                    }
                  }}
                  style={{ fontSize: '14px', color: 'var(--color-terracotta-600)', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  View →
                </button>
              </div>
            ) : onUploadPdf ? (
              <div>
                {!!uploadPdfError && (
                  <p style={{ fontSize: '12px', color: '#dc2626', marginBottom: '8px' }}>
                    Failed to upload PDF
                  </p>
                )}
                <label style={{ display: 'inline-block', cursor: isUploadingPdf ? 'not-allowed' : 'pointer', opacity: isUploadingPdf ? 0.5 : 1 }}>
                  <input
                    type="file"
                    accept=".pdf,application/pdf"
                    style={{ display: 'none' }}
                    disabled={isUploadingPdf}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file && onUploadPdf) {
                        if (file.type !== 'application/pdf') { alert('Please select a PDF file'); return }
                        if (file.size > 10 * 1024 * 1024) { alert('File size must be less than 10MB'); return }
                        onUploadPdf(file)
                      }
                    }}
                  />
                  <span className="btn-cancel" style={{ fontSize: '13px', padding: '8px 16px' }}>
                    {isUploadingPdf ? 'Uploading...' : 'Upload PDF'}
                  </span>
                </label>
              </div>
            ) : (
              <p style={{ fontSize: '14px', color: 'var(--color-sand-500)' }}>No document uploaded</p>
            )}
          </div>

          <div className="policy-grid">
            <div className="policy-section">
              <label className="policy-label">Carrier</label>
              <p className="policy-value-large">{policy.carrier_name}</p>
              {policy.carrier_phone && (
                <p className="policy-value" style={{ fontSize: '14px', marginTop: '4px' }}>📞 {policy.carrier_phone}</p>
              )}
              {policy.carrier_email && (
                <p className="policy-value" style={{ fontSize: '14px', marginTop: '2px' }}>✉️ {policy.carrier_email}</p>
              )}
            </div>

            {policy.policy_number && (
              <div className="policy-section">
                <label className="policy-label">Policy Number</label>
                <p className="policy-value-mono">{policy.policy_number}</p>
              </div>
            )}

            <div className="policy-section">
              <label className="policy-label">Start Date</label>
              <p className="policy-value">{formatDate(policy.effective_date ?? undefined)}</p>
            </div>

            <div className="policy-section">
              <label className="policy-label">End Date</label>
              <p className="policy-value">{formatDate(policy.expiration_date ?? undefined)}</p>
            </div>

            {policy.deductible_value !== undefined && (
              <div className="policy-section-full">
                <label className="policy-label">Deductible</label>
                <div className="deductible-display">
                  <span className="deductible-primary">{formatCurrency(policy.deductible_value)}</span>
                </div>
              </div>
            )}

            {policy.exclusions && (
              <div className="policy-section-full">
                <label className="policy-label">Exclusions</label>
                <div style={{
                  background: 'white',
                  border: '1px solid var(--color-sand-200)',
                  borderRadius: '12px',
                  padding: '16px 20px',
                  maxHeight: '200px',
                  overflowY: 'auto',
                  whiteSpace: 'pre-wrap',
                  fontSize: '14px',
                  color: 'var(--color-sand-800)',
                  lineHeight: '1.6',
                }}>
                  {policy.exclusions}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        // Edit Mode
        <form onSubmit={handleSubmit} className="policy-card-edit">
          <div className="policy-card-header">
            <div>
              <h3 className="policy-card-title">
                {policy ? 'Edit Policy' : 'Add Policy'}
              </h3>
              <p className="policy-status-muted">Update insurance information</p>
            </div>
          </div>

          <div className="policy-form-grid">
            <div className="form-group">
              <label htmlFor="carrier_name" className="form-label">
                Insurance Carrier <span className="required">*</span>
              </label>
              <input type="text" id="carrier_name" name="carrier_name" required
                value={formData.carrier_name} onChange={handleChange}
                className="form-input" placeholder="e.g., State Farm, Travelers" />
            </div>

            <div className="form-group">
              <label htmlFor="policy_number" className="form-label">
                Policy Number <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input type="text" id="policy_number" name="policy_number"
                value={formData.policy_number} onChange={handleChange}
                className="form-input" placeholder="Enter policy number" required />
            </div>

            <div className="form-group">
              <label htmlFor="carrier_phone" className="form-label">Carrier Phone</label>
              <input type="tel" id="carrier_phone" name="carrier_phone"
                value={formData.carrier_phone} onChange={handleChange}
                className="form-input" placeholder="e.g., 555-123-4567" />
            </div>

            <div className="form-group">
              <label htmlFor="carrier_email" className="form-label">Carrier Email</label>
              <input type="email" id="carrier_email" name="carrier_email"
                value={formData.carrier_email} onChange={handleChange}
                className="form-input" placeholder="e.g., claims@carrier.com" />
            </div>

            <div className="form-group">
              <label htmlFor="effective_date" className="form-label">
                Policy Start Date <span className="required">*</span>
              </label>
              <input type="date" id="effective_date" name="effective_date" required
                value={formData.effective_date} onChange={handleChange}
                className="form-input" />
            </div>

            <div className="form-group">
              <label htmlFor="expiration_date" className="form-label">
                Policy End Date <span className="required">*</span>
              </label>
              <input type="date" id="expiration_date" name="expiration_date" required
                value={formData.expiration_date} onChange={handleChange}
                className="form-input" />
            </div>

            <div className="form-group">
              <label htmlFor="deductible_value" className="form-label">
                Deductible <span className="required">*</span>
              </label>
              <div className="form-input-group">
                <span className="input-prefix">$</span>
                <input type="number" id="deductible_value" name="deductible_value" required
                  value={formData.deductible_value} onChange={handleChange}
                  className="form-input with-prefix" placeholder="10000" min="0" />
              </div>
            </div>

            <div className="form-group-full">
              <label htmlFor="exclusions" className="form-label">
                Exclusions
              </label>
              <textarea id="exclusions" name="exclusions"
                value={formData.exclusions}
                onChange={(e) => setFormData(prev => ({ ...prev, exclusions: e.target.value }))}
                className="form-input"
                placeholder="Enter policy exclusions..."
                rows={6}
                style={{ resize: 'vertical', fontFamily: 'inherit' }}
              />
            </div>
          </div>

          {mutation.isError && (
            <div className="alert alert-error">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <div>
                <p className="alert-title">Error saving policy</p>
                <p className="alert-message">{getErrorMessage(mutation.error)}</p>
              </div>
            </div>
          )}

          <div className="form-actions">
            <button
              type="button"
              onClick={handleCancel}
              className="btn-cancel"
              disabled={mutation.isPending}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-save"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? (
                <>
                  <svg className="spinner" width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Saving...
                </>
              ) : (
                policy ? 'Update Policy' : 'Save Policy'
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

const policyCardStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,500;0,9..144,700;1,9..144,300&family=Outfit:wght@300;400;500;600;700&display=swap');

  .policy-card-container {
    font-family: 'Outfit', -apple-system, BlinkMacSystemFont, sans-serif;
    --color-sand-50: #faf9f7;
    --color-sand-100: #f5f3ef;
    --color-sand-200: #e8e4db;
    --color-sand-300: #d4cdc0;
    --color-sand-400: #b8ab97;
    --color-sand-500: #9c8872;
    --color-sand-600: #7d6b57;
    --color-sand-700: #5c4f40;
    --color-sand-800: #3d342a;
    --color-sand-900: #2a2319;

    --color-terracotta-50: #fef5f3;
    --color-terracotta-100: #fde8e3;
    --color-terracotta-200: #fbd5cb;
    --color-terracotta-300: #f7b5a3;
    --color-terracotta-400: #f18b6d;
    --color-terracotta-500: #e86840;
    --color-terracotta-600: #d14a24;
    --color-terracotta-700: #b03919;
    --color-terracotta-800: #8f2f18;
    --color-terracotta-900: #75291a;

    --color-sage-50: #f6f8f6;
    --color-sage-100: #e8ede9;
    --color-sage-200: #d3ddd5;
    --color-sage-300: #afc3b3;
    --color-sage-400: #84a089;
    --color-sage-500: #638168;
    --color-sage-600: #4f6854;
    --color-sage-700: #405445;
    --color-sage-800: #364439;
    --color-sage-900: #2e3930;
  }

  .policy-card-display,
  .policy-card-edit,
  .policy-card-empty {
    background: linear-gradient(135deg, var(--color-sand-50) 0%, #ffffff 100%);
    border: 1px solid var(--color-sand-200);
    border-radius: 20px;
    padding: 32px;
    box-shadow: 0 1px 3px rgba(61, 52, 42, 0.03),
                0 8px 24px rgba(61, 52, 42, 0.04);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .policy-card-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 48px 32px;
    text-align: center;
  }

  .empty-icon {
    width: 80px;
    height: 80px;
    background: linear-gradient(135deg, var(--color-terracotta-50), var(--color-sand-100));
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 24px;
    color: var(--color-terracotta-600);
  }

  .empty-title {
    font-family: 'Fraunces', serif;
    font-size: 22px;
    font-weight: 600;
    color: var(--color-sand-900);
    margin: 0 0 8px 0;
    letter-spacing: -0.02em;
  }

  .empty-description {
    font-size: 15px;
    color: var(--color-sand-600);
    margin: 0 0 24px 0;
    line-height: 1.5;
  }

  .btn-add-policy {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: linear-gradient(135deg, var(--color-terracotta-500), var(--color-terracotta-600));
    color: white;
    border: none;
    padding: 14px 28px;
    border-radius: 12px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    box-shadow: 0 2px 8px rgba(232, 104, 64, 0.25);
  }

  .btn-add-policy:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 16px rgba(232, 104, 64, 0.35);
  }

  .policy-card-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 28px;
    padding-bottom: 24px;
    border-bottom: 1px solid var(--color-sand-200);
  }

  .policy-card-title {
    font-family: 'Fraunces', serif;
    font-size: 24px;
    font-weight: 600;
    color: var(--color-sand-900);
    margin: 0 0 6px 0;
    letter-spacing: -0.02em;
  }

  .policy-status {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--color-sage-700);
    font-weight: 500;
    margin: 0;
  }

  .policy-status-muted {
    font-size: 14px;
    color: var(--color-sand-600);
    margin: 0;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    background: var(--color-sage-500);
    border-radius: 50%;
    display: inline-block;
    animation: pulse 2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  .policy-card-actions {
    display: flex;
    gap: 8px;
  }

  .btn-edit,
  .btn-delete {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: white;
    border: 1px solid var(--color-sand-300);
    color: var(--color-sand-700);
    padding: 10px 18px;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .btn-edit:hover {
    background: var(--color-sand-50);
    border-color: var(--color-sand-400);
    color: var(--color-sand-900);
    transform: translateY(-1px);
  }

  .btn-delete {
    padding: 10px;
    color: var(--color-terracotta-600);
    border-color: var(--color-terracotta-200);
  }

  .btn-delete:hover {
    background: var(--color-terracotta-50);
    border-color: var(--color-terracotta-300);
    color: var(--color-terracotta-700);
  }

  .policy-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 24px;
  }

  .policy-section-full {
    grid-column: 1 / -1;
  }

  .policy-label {
    display: block;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--color-sand-600);
    margin-bottom: 8px;
  }

  .policy-value {
    font-size: 16px;
    color: var(--color-sand-900);
    font-weight: 500;
    margin: 0;
    line-height: 1.4;
  }

  .policy-value-large {
    font-family: 'Fraunces', serif;
    font-size: 20px;
    font-weight: 600;
    color: var(--color-sand-900);
    margin: 0;
    letter-spacing: -0.01em;
  }

  .policy-value-mono {
    font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
    font-size: 15px;
    color: var(--color-sand-800);
    font-weight: 500;
    margin: 0;
  }

  .deductible-display {
    display: flex;
    align-items: baseline;
    gap: 12px;
    background: white;
    border: 1px solid var(--color-sand-200);
    border-radius: 12px;
    padding: 16px 20px;
  }

  .deductible-primary {
    font-family: 'Fraunces', serif;
    font-size: 22px;
    font-weight: 700;
    color: var(--color-terracotta-600);
    letter-spacing: -0.01em;
  }

  /* Edit Mode Styles */
  .policy-form-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 20px;
    margin-bottom: 24px;
  }

  .form-group {
    display: flex;
    flex-direction: column;
  }

  .form-group-full {
    grid-column: 1 / -1;
  }

  .form-label {
    font-size: 13px;
    font-weight: 600;
    color: var(--color-sand-700);
    margin-bottom: 8px;
    display: block;
  }

  .required {
    color: var(--color-terracotta-600);
  }

  .form-input {
    width: 100%;
    padding: 12px 16px;
    background: white;
    border: 1px solid var(--color-sand-300);
    border-radius: 10px;
    font-size: 15px;
    font-family: 'Outfit', sans-serif;
    color: var(--color-sand-900);
    transition: all 0.2s ease;
  }

  .form-input:focus {
    outline: none;
    border-color: var(--color-terracotta-400);
    box-shadow: 0 0 0 3px rgba(232, 104, 64, 0.1);
  }

  .form-input::placeholder {
    color: var(--color-sand-400);
  }

  .form-input-group {
    position: relative;
  }

  .input-prefix {
    position: absolute;
    left: 16px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 15px;
    font-weight: 600;
    color: var(--color-sand-600);
    pointer-events: none;
  }

  .form-input.with-prefix {
    padding-left: 38px;
  }

  .alert {
    display: flex;
    gap: 12px;
    padding: 16px;
    border-radius: 12px;
    margin-bottom: 20px;
  }

  .alert-error {
    background: var(--color-terracotta-50);
    border: 1px solid var(--color-terracotta-200);
    color: var(--color-terracotta-800);
  }

  .alert svg {
    flex-shrink: 0;
    color: var(--color-terracotta-600);
  }

  .alert-title {
    font-size: 14px;
    font-weight: 600;
    margin: 0 0 4px 0;
  }

  .alert-message {
    font-size: 13px;
    margin: 0;
    opacity: 0.9;
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    padding-top: 24px;
    border-top: 1px solid var(--color-sand-200);
  }

  .btn-cancel,
  .btn-save {
    padding: 12px 24px;
    border-radius: 10px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    border: none;
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .btn-cancel {
    background: white;
    border: 1px solid var(--color-sand-300);
    color: var(--color-sand-700);
  }

  .btn-cancel:hover:not(:disabled) {
    background: var(--color-sand-50);
    border-color: var(--color-sand-400);
  }

  .btn-save {
    background: linear-gradient(135deg, var(--color-terracotta-500), var(--color-terracotta-600));
    color: white;
    box-shadow: 0 2px 8px rgba(232, 104, 64, 0.25);
  }

  .btn-save:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 16px rgba(232, 104, 64, 0.35);
  }

  .btn-cancel:disabled,
  .btn-save:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .spinner {
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 768px) {
    .policy-grid,
    .policy-form-grid {
      grid-template-columns: 1fr;
    }

    .policy-card-display,
    .policy-card-edit,
    .policy-card-empty {
      padding: 24px;
    }

    .policy-card-header {
      flex-direction: column;
      gap: 16px;
    }

    .policy-card-actions {
      width: 100%;
      justify-content: flex-start;
    }
  }
`
