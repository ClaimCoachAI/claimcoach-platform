import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { fetchApprovalData, respondToApproval, type ApprovalPageData } from '../lib/legalApproval'

export default function LegalApprovalPage() {
  const { token } = useParams<{ token: string }>()
  const [data, setData] = useState<ApprovalPageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [responded, setResponded] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!token) return
    fetchApprovalData(token)
      .then(d => {
        if (!d) {
          setError('This approval link was not found.')
        } else {
          setData(d)
        }
      })
      .catch(() => setError('Failed to load approval details. Please try again.'))
      .finally(() => setLoading(false))
  }, [token])

  const handleRespond = async (action: 'approve' | 'decline') => {
    if (!token) return
    setSubmitting(true)
    try {
      await respondToApproval(token, action)
      setResponded(true)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const fmt = (n: number) =>
    n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const formatDate = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
    })
  }

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <p style={{ color: '#64748b', textAlign: 'center' }}>Loading...</p>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <p style={{ color: '#64748b', textAlign: 'center' }}>
            {error || 'This approval link is no longer active.'}
          </p>
        </div>
      </div>
    )
  }

  // Non-pending status — already responded or expired
  if (data.status !== 'pending') {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <p style={{ color: '#64748b', textAlign: 'center' }}>
            This link is no longer active.
          </p>
        </div>
      </div>
    )
  }

  // Post-response confirmation
  if (responded) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <p style={{ color: '#0f172a', textAlign: 'center', fontSize: 16 }}>
            Thank you, {data.owner_name.split(' ')[0]}. Your decision has been recorded and your property manager has been notified.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        {/* Section A — What happened */}
        <p style={styles.intro}>
          Your property at <strong>{data.property_address}</strong> sustained{' '}
          {data.loss_type.toLowerCase()} damage on{' '}
          {formatDate(data.incident_date)}.
        </p>

        {/* Section B/C — Financial picture */}
        <div style={styles.financialCard}>
          <div style={styles.financialRow}>
            <span style={styles.financialLabel}>Insurance carrier offered:</span>
            <span style={styles.financialValue}>${fmt(data.carrier_estimate)}</span>
          </div>
          <div style={styles.financialRow}>
            <span style={styles.financialLabel}>Industry standard estimate:</span>
            <span style={styles.financialValue}>${fmt(data.industry_estimate)}</span>
          </div>
          <div style={styles.divider} />
          <div style={styles.financialRow}>
            <span style={{ ...styles.financialLabel, fontWeight: 700, color: '#0f172a' }}>Potential underpayment:</span>
            <span style={{ ...styles.financialValue, color: '#d97706', fontWeight: 700, fontSize: 18 }}>
              ${fmt(data.delta)}
            </span>
          </div>
        </div>

        {/* Section D — What happens if you approve */}
        <div style={styles.explainerSection}>
          <p style={styles.explainerTitle}>What happens if you approve:</p>
          <ol style={styles.explainerList}>
            <li>Your property manager will send your full claim file to a legal partner for review.</li>
            <li>The legal partner will assess whether they believe you have grounds for additional compensation.</li>
            <li>If they take your case, they will negotiate with the insurance carrier on your behalf.</li>
            <li>Legal fees are typically contingency-based — you pay nothing unless you recover additional funds.</li>
          </ol>
        </div>

        {/* CTA Row */}
        <div style={styles.ctaRow}>
          <button
            style={styles.declineBtn}
            onClick={() => handleRespond('decline')}
            disabled={submitting}
          >
            Decline
          </button>
          <button
            style={styles.approveBtn}
            onClick={() => handleRespond('approve')}
            disabled={submitting}
          >
            {submitting ? 'Processing...' : 'Approve — Send to Legal Partner'}
          </button>
        </div>

        {error && (
          <p style={{ color: '#dc2626', fontSize: 13, textAlign: 'center', marginTop: 8 }}>{error}</p>
        )}
      </div>
    </div>
  )
}

// Inline styles — no Tailwind dependency, intentional for a standalone public page
const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#f8fafc',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: '40px 16px 80px',
    fontFamily: 'Arial, sans-serif',
  },
  card: {
    background: 'white',
    borderRadius: 12,
    boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
    padding: '36px 40px',
    maxWidth: 560,
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
  },
  intro: {
    fontSize: 15,
    color: '#0f172a',
    lineHeight: 1.6,
    margin: 0,
  },
  financialCard: {
    background: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: 8,
    padding: '16px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  financialRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  financialLabel: {
    fontSize: 14,
    color: '#475569',
  },
  financialValue: {
    fontSize: 15,
    color: '#0f172a',
    fontWeight: 600,
  },
  divider: {
    height: 1,
    background: '#e2e8f0',
    margin: '4px 0',
  },
  explainerSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  explainerTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: '#0f172a',
    margin: 0,
  },
  explainerList: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 1.7,
    paddingLeft: 20,
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  ctaRow: {
    display: 'flex',
    gap: 12,
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
  },
  declineBtn: {
    background: 'none',
    color: '#64748b',
    border: '1px solid #cbd5e1',
    borderRadius: 8,
    padding: '10px 22px',
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
  },
  approveBtn: {
    background: '#111827',
    color: 'white',
    border: 'none',
    borderRadius: 8,
    padding: '10px 22px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
}
