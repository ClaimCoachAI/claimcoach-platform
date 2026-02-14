// frontend/src/components/ScopeSheetSummary.tsx

interface ScopeSheet {
  id: string
  claim_id: string
  damage_type: string
  affected_areas: string[]
  urgency_level: string
  contractor_notes?: string
  photos_count?: number
  created_at: string
}

interface ScopeSheetSummaryProps {
  scopeSheet: ScopeSheet
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  })
}

function getUrgencyColor(urgency: string): string {
  const normalized = urgency.toLowerCase()

  if (normalized === 'high' || normalized === 'urgent') {
    return 'bg-red-100 text-red-700 border-red-200'
  }

  if (normalized === 'medium' || normalized === 'moderate') {
    return 'bg-amber-100 text-amber-700 border-amber-200'
  }

  // low or routine
  return 'bg-slate-100 text-slate-700 border-slate-200'
}

export default function ScopeSheetSummary({ scopeSheet }: ScopeSheetSummaryProps) {
  const summaryId = `scope-summary-${scopeSheet.id}`
  const damageTypeId = `${summaryId}-damage-type`
  const urgencyId = `${summaryId}-urgency`
  const areasId = `${summaryId}-areas`
  const photosId = `${summaryId}-photos`
  const notesId = `${summaryId}-notes`

  return (
    <div
      className="glass-card rounded-2xl p-6 border-2 border-emerald-200 hover:shadow-lg transition-all duration-200"
      role="region"
      aria-label="Scope sheet summary"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-100">
            <span className="text-2xl">📋</span>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-navy">Scope Sheet Received</h3>
            <p className="text-sm text-slate">
              Completed on {formatDate(scopeSheet.created_at)}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <svg
            className="w-5 h-5 text-emerald-600"
            fill="currentColor"
            viewBox="0 0 20 20"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      </div>

      {/* Damage Type */}
      <div className="mb-4" aria-labelledby={damageTypeId}>
        <label
          id={damageTypeId}
          className="text-xs font-medium text-slate/70 uppercase tracking-wider block mb-2"
        >
          Damage Type
        </label>
        <p className="text-base font-medium text-navy">
          {scopeSheet.damage_type}
        </p>
      </div>

      {/* Urgency Level */}
      <div className="mb-4" aria-labelledby={urgencyId}>
        <label
          id={urgencyId}
          className="text-xs font-medium text-slate/70 uppercase tracking-wider block mb-2"
        >
          Urgency Level
        </label>
        <span
          className={`inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-medium border ${getUrgencyColor(
            scopeSheet.urgency_level
          )}`}
        >
          {scopeSheet.urgency_level}
        </span>
      </div>

      {/* Affected Areas */}
      <div className="mb-4" aria-labelledby={areasId}>
        <label
          id={areasId}
          className="text-xs font-medium text-slate/70 uppercase tracking-wider block mb-2"
        >
          Affected Areas
        </label>
        <div className="flex flex-wrap gap-2">
          {scopeSheet.affected_areas.map((area, index) => (
            <span
              key={index}
              className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-medium bg-emerald-50 text-emerald-700 border border-emerald-200"
            >
              {area}
            </span>
          ))}
        </div>
      </div>

      {/* Photos Count */}
      {scopeSheet.photos_count !== undefined && scopeSheet.photos_count > 0 && (
        <div className="mb-4" aria-labelledby={photosId}>
          <label
            id={photosId}
            className="text-xs font-medium text-slate/70 uppercase tracking-wider block mb-2"
          >
            Photos
          </label>
          <div className="flex items-center space-x-2">
            <svg
              className="w-5 h-5 text-emerald-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <span className="text-sm font-medium text-navy">
              {scopeSheet.photos_count} {scopeSheet.photos_count === 1 ? 'photo' : 'photos'} attached
            </span>
          </div>
        </div>
      )}

      {/* Contractor Notes */}
      {scopeSheet.contractor_notes && (
        <div aria-labelledby={notesId}>
          <label
            id={notesId}
            className="text-xs font-medium text-slate/70 uppercase tracking-wider block mb-2"
          >
            Contractor Notes
          </label>
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <p className="text-sm text-navy whitespace-pre-wrap">
              {scopeSheet.contractor_notes}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
