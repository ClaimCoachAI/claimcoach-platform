import { useNavigate } from 'react-router-dom'
import { Property } from '../types/claim'

interface PropertyCardProps {
  property: Property
}

export default function PropertyCard({ property }: PropertyCardProps) {
  const navigate = useNavigate()

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'draft':
        return 'badge-slate'
      case 'active_monitored':
        return 'badge-success'
      case 'archived':
        return 'badge-error'
      default:
        return 'badge-slate'
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'draft':
        return 'Draft'
      case 'active_monitored':
        return 'Active'
      case 'archived':
        return 'Archived'
      default:
        return status
    }
  }

  return (
    <div
      onClick={() => navigate(`/properties/${property.id}`)}
      className="glass-card rounded-2xl p-6 cursor-pointer hover:scale-105 transition-all duration-300 group"
    >
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-display font-semibold text-navy flex-1 group-hover:text-teal transition-colors">
            {property.nickname}
          </h3>
          <span className={`badge ${getStatusStyle(property.status)} flex-shrink-0`}>
            {getStatusLabel(property.status)}
          </span>
        </div>

        {/* Address */}
        <div className="flex items-start space-x-3">
          <svg className="w-5 h-5 text-slate flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <p className="text-sm text-slate">{property.legal_address}</p>
        </div>

        {/* Owner */}
        <div className="flex items-center space-x-3">
          <svg className="w-5 h-5 text-slate flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          <p className="text-sm text-slate">{property.owner_entity_name}</p>
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
