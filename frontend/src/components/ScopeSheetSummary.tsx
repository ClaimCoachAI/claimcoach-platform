import type { ScopeSheet } from '../types/scopeSheet'
import { CATEGORY_MAP } from './contractor-wizard/taxonomy'

interface ScopeSheetSummaryProps {
  scopeSheet: ScopeSheet
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatDimensions(dims: Record<string, number>): string {
  if (!dims || Object.keys(dims).length === 0) return ''
  if (dims.square_footage) return `${dims.square_footage.toLocaleString()} sq ft`
  if (dims.length && dims.width) {
    return `${dims.length} × ${dims.width} ft`
  }
  return ''
}

export default function ScopeSheetSummary({ scopeSheet }: ScopeSheetSummaryProps) {
  const areas = scopeSheet.areas ?? []

  return (
    <div
      className="glass-card rounded-2xl p-6 border-2 border-emerald-200 hover:shadow-lg transition-all duration-200"
      role="region"
      aria-label="Scope sheet summary"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center">
            <span className="text-2xl">📋</span>
          </div>
          <div>
            <h4 className="text-lg font-display font-bold text-navy">Scope Sheet Received</h4>
            <p className="text-sm text-slate mt-0.5">
              Submitted {formatDate(scopeSheet.submitted_at || scopeSheet.created_at)}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-100">
          <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
      </div>

      {/* Areas */}
      {areas.length > 0 ? (
        <div className="space-y-4">
          {areas.map((area, idx) => {
            const cat = CATEGORY_MAP[area.category_key]
            const dimStr = formatDimensions(area.dimensions)

            return (
              <div key={area.id || idx} className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-base leading-none">{cat?.emoji ?? '📌'}</span>
                  <span className="text-sm font-bold text-navy">{area.category}</span>
                  {dimStr && (
                    <span className="text-xs text-slate/60 ml-auto">{dimStr}</span>
                  )}
                </div>
                {area.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pl-6">
                    {area.tags.map(tag => (
                      <span key={tag} className="px-2 py-0.5 rounded-md bg-teal/10 text-teal text-xs font-medium">
                        {tag.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                )}
                {area.notes !== '' && (
                  <p className="text-xs text-slate/70 pl-6 mt-1 italic whitespace-pre-wrap">{area.notes}</p>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <p className="text-sm text-slate">No damage areas recorded.</p>
      )}

      {/* General notes */}
      {scopeSheet.general_notes && (
        <div className="mt-4 pt-4 border-t border-slate/10">
          <label className="text-xs font-medium text-slate/70 uppercase tracking-wider block mb-1">
            General Notes
          </label>
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <p className="text-sm text-navy whitespace-pre-wrap">{scopeSheet.general_notes}</p>
          </div>
        </div>
      )}

    </div>
  )
}
