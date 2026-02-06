interface ClaimStatusBadgeProps {
  status: string
}

export default function ClaimStatusBadge({ status }: ClaimStatusBadgeProps) {
  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'draft':
        return { color: 'bg-gray-100 text-gray-800', label: 'Draft' }
      case 'assessing':
        return { color: 'bg-blue-100 text-blue-800', label: 'Assessing' }
      case 'filed':
        return { color: 'bg-purple-100 text-purple-800', label: 'Filed' }
      case 'field_scheduled':
        return { color: 'bg-indigo-100 text-indigo-800', label: 'Field Scheduled' }
      case 'audit_pending':
        return { color: 'bg-yellow-100 text-yellow-800', label: 'Audit Pending' }
      case 'negotiating':
        return { color: 'bg-orange-100 text-orange-800', label: 'Negotiating' }
      case 'settled':
        return { color: 'bg-green-100 text-green-800', label: 'Settled' }
      case 'closed':
        return { color: 'bg-gray-100 text-gray-800', label: 'Closed' }
      default:
        return { color: 'bg-gray-100 text-gray-800', label: status }
    }
  }

  const config = getStatusConfig(status)

  return (
    <span
      className={`px-2 py-1 rounded-full text-xs font-medium ${config.color}`}
    >
      {config.label}
    </span>
  )
}
