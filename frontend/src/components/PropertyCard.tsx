import { useNavigate } from 'react-router-dom'

interface PropertyCardProps {
  property: {
    id: string
    nickname: string
    legal_address: string
    status: string
    owner_entity_name: string
  }
}

export default function PropertyCard({ property }: PropertyCardProps) {
  const navigate = useNavigate()

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft':
        return 'bg-gray-100 text-gray-800'
      case 'active_monitored':
        return 'bg-green-100 text-green-800'
      case 'archived':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'draft':
        return 'Draft'
      case 'active_monitored':
        return 'Active Monitored'
      case 'archived':
        return 'Archived'
      default:
        return status
    }
  }

  return (
    <div
      onClick={() => navigate(`/properties/${property.id}`)}
      className="bg-white p-6 rounded-lg shadow hover:shadow-lg transition-shadow cursor-pointer border border-gray-200"
    >
      <div className="flex justify-between items-start mb-3">
        <h3 className="text-lg font-semibold text-gray-900 truncate flex-1">
          {property.nickname}
        </h3>
        <span
          className={`px-2 py-1 rounded-full text-xs font-medium ml-2 ${getStatusColor(
            property.status
          )}`}
        >
          {getStatusLabel(property.status)}
        </span>
      </div>
      <div className="space-y-2">
        <div className="flex items-start">
          <svg
            className="w-4 h-4 text-gray-400 mt-0.5 mr-2 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
          <p className="text-sm text-gray-600">{property.legal_address}</p>
        </div>
        <div className="flex items-center">
          <svg
            className="w-4 h-4 text-gray-400 mr-2 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
            />
          </svg>
          <p className="text-sm text-gray-600">{property.owner_entity_name}</p>
        </div>
      </div>
    </div>
  )
}
