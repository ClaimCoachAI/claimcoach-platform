interface ContractorStatusBadgeProps {
  hasMagicLink: boolean
  hasScopeSheet: boolean
}

export default function ContractorStatusBadge({
  hasMagicLink,
  hasScopeSheet
}: ContractorStatusBadgeProps) {
  if (!hasMagicLink) {
    return null
  }

  if (hasScopeSheet) {
    return (
      <div className="inline-flex items-center px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200">
        <svg className="w-4 h-4 text-emerald-600 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        <span className="text-sm font-medium text-emerald-700">Completed</span>
      </div>
    )
  }

  return (
    <div className="inline-flex items-center px-3 py-1 rounded-full bg-amber-50 border border-amber-200">
      <svg className="w-4 h-4 text-amber-600 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span className="text-sm font-medium text-amber-700">Waiting on contractor</span>
    </div>
  )
}
