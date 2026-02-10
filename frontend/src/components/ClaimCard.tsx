import { useNavigate } from 'react-router-dom'
import ClaimStatusBadge from './ClaimStatusBadge'

interface ClaimCardProps {
  claim: {
    id: string
    claim_number: string | null
    property_id: string
    property?: {
      nickname: string
      legal_address: string
    }
    loss_type: string
    status: string
    incident_date: string
  }
}

export default function ClaimCard({ claim }: ClaimCardProps) {
  const navigate = useNavigate()

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
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
          <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
          </svg>
        )
      case 'water':
        return (
          <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
        )
      case 'wind':
        return (
          <svg className="w-5 h-5 text-slate" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )
      case 'hail':
        return (
          <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
          </svg>
        )
      default:
        return (
          <svg className="w-5 h-5 text-slate" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )
    }
  }

  return (
    <div
      onClick={() => navigate(`/claims/${claim.id}`)}
      className="glass-card rounded-2xl p-6 cursor-pointer hover:scale-105 transition-all duration-300 group"
    >
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-display font-semibold text-navy group-hover:text-teal transition-colors">
            {claim.claim_number || 'Draft Claim'}
          </h3>
          <ClaimStatusBadge status={claim.status} />
        </div>

        {/* Property Info */}
        {claim.property && (
          <div className="space-y-1">
            <p className="text-sm font-medium text-navy">{claim.property.nickname}</p>
            <p className="text-sm text-slate">{claim.property.legal_address}</p>
          </div>
        )}

        {/* Claim Details */}
        <div className="space-y-3 pt-2 border-t border-white/60">
          <div className="flex items-center space-x-3">
            {getLossTypeIcon(claim.loss_type)}
            <span className="text-sm text-slate">
              <span className="font-medium text-navy">Loss:</span> {getLossTypeLabel(claim.loss_type)}
            </span>
          </div>
          <div className="flex items-center space-x-3">
            <svg className="w-5 h-5 text-slate" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-sm text-slate">
              <span className="font-medium text-navy">Date:</span> {formatDate(claim.incident_date)}
            </span>
          </div>
        </div>

        {/* Arrow indicator */}
        <div className="flex items-center justify-end pt-2">
          <svg className="w-5 h-5 text-teal group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
          </svg>
        </div>
      </div>
    </div>
  )
}
