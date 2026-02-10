interface ClaimStatusBadgeProps {
  status: string
}

export default function ClaimStatusBadge({ status }: ClaimStatusBadgeProps) {
  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'draft':
        return { class: 'badge-slate', label: 'Draft' }
      case 'assessing':
        return { class: 'badge-teal', label: 'Assessing' }
      case 'filed':
        return { class: 'badge bg-purple-50 text-purple-700 border-purple-200', label: 'Filed' }
      case 'field_scheduled':
        return { class: 'badge bg-indigo-50 text-indigo-700 border-indigo-200', label: 'Field Scheduled' }
      case 'audit_pending':
        return { class: 'badge-warning', label: 'Audit Pending' }
      case 'negotiating':
        return { class: 'badge bg-orange-50 text-orange-700 border-orange-200', label: 'Negotiating' }
      case 'settled':
        return { class: 'badge-success', label: 'Settled' }
      case 'closed':
        return { class: 'badge-slate', label: 'Closed' }
      default:
        return { class: 'badge-slate', label: status }
    }
  }

  const config = getStatusConfig(status)

  return (
    <span className={config.class}>
      {config.label}
    </span>
  )
}
