import type { ScopeSheet } from '../types/scopeSheet'

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

export default function ScopeSheetSummary({ scopeSheet }: ScopeSheetSummaryProps) {
  return (
    <div
      className="glass-card rounded-2xl p-6 border-2 border-emerald-200 hover:shadow-lg transition-all duration-200"
      role="region"
      aria-label="Scope sheet summary"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center">
            <span className="text-2xl">📋</span>
          </div>
          <div>
            <h4 className="text-lg font-display font-bold text-navy">Scope Sheet Received</h4>
            <p className="text-sm text-slate mt-0.5">
              Submitted on {formatDate(scopeSheet.submitted_at || scopeSheet.created_at)}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-100">
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
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
      </div>

      {/* Content */}
      <div className="space-y-3">
        {scopeSheet.roof_type && (
          <div>
            <label className="text-xs font-medium text-slate/70 uppercase tracking-wider block mb-1">
              Roof Type
            </label>
            <p className="text-sm text-navy font-medium">{scopeSheet.roof_type}</p>
          </div>
        )}

        {scopeSheet.roof_square_footage && (
          <div>
            <label className="text-xs font-medium text-slate/70 uppercase tracking-wider block mb-1">
              Roof Square Footage
            </label>
            <p className="text-sm text-navy font-medium">{scopeSheet.roof_square_footage} sq ft</p>
          </div>
        )}

        {scopeSheet.notes && (
          <div>
            <label className="text-xs font-medium text-slate/70 uppercase tracking-wider block mb-1">
              Contractor Notes
            </label>
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
              <p className="text-sm text-navy whitespace-pre-wrap">{scopeSheet.notes}</p>
            </div>
          </div>
        )}

        <div className="pt-3 border-t border-slate/10">
          <p className="text-xs text-slate">
            Complete scope sheet details are available in the documents section.
          </p>
        </div>
      </div>
    </div>
  )
}
