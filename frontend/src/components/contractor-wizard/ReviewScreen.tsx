import { useState } from 'react'
import { ScopeArea } from './types'
import { CATEGORY_MAP } from './taxonomy'

interface ReviewScreenProps {
  areas: ScopeArea[]
  generalNotes: string
  onSubmit: (finalNotes: string) => Promise<void>
  onBack: () => void
  saving: boolean
}

function formatDimensions(dims: Record<string, number>): string {
  if (!dims || Object.keys(dims).length === 0) return ''
  if (dims.square_footage) return `${dims.square_footage.toLocaleString()} sq ft`
  if (dims.length && dims.width) {
    const sqft = Math.round(dims.length * dims.width)
    return `${dims.length} × ${dims.width} ft (${sqft.toLocaleString()} sq ft)`
  }
  return ''
}

export default function ReviewScreen({
  areas,
  generalNotes: initialNotes,
  onSubmit,
  onBack,
  saving,
}: ReviewScreenProps) {
  const [notes, setNotes] = useState(initialNotes)
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = async () => {
    await onSubmit(notes)
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <div className="min-h-[calc(100vh-200px)] flex items-center justify-center px-4">
        <div className="max-w-md mx-auto text-center space-y-6 animate-fade-in">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-teal/20 to-teal/5 mb-2">
            <svg className="w-10 h-10 text-teal" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h2 className="text-3xl font-display font-bold text-navy">All done!</h2>
            <p className="text-slate mt-2 leading-relaxed">
              Your scope sheet has been submitted. The property manager will review it and follow up shortly.
            </p>
          </div>
          <div className="glass-card rounded-2xl p-4 text-sm text-slate">
            You can close this tab now. 👋
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[calc(100vh-200px)] px-4 py-6 pb-36">
      <div className="max-w-md mx-auto space-y-6">

        {/* Header */}
        <div className="space-y-1 animate-fade-in">
          <h2 className="text-3xl font-display font-bold text-navy">Review & Submit</h2>
          <p className="text-slate text-sm">Here's a summary of what you recorded.</p>
        </div>

        {/* Area summary cards */}
        {areas.map((area, idx) => {
          const cat = CATEGORY_MAP[area.category_key]
          const dimStr = formatDimensions(area.dimensions)

          return (
            <div
              key={area.id}
              className="glass-card rounded-2xl p-5 space-y-3 border border-slate/10 animate-slide-up"
              style={{ animationDelay: `${idx * 60}ms` }}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl leading-none">{cat?.emoji ?? '📋'}</span>
                <div>
                  <p className="text-xs font-semibold text-slate/50 uppercase tracking-wider">Area {idx + 1}</p>
                  <h3 className="text-base font-bold text-navy">{area.category}</h3>
                </div>
              </div>

              {area.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {area.tags.map(tag => (
                    <span key={tag} className="px-2.5 py-1 rounded-lg bg-teal/10 text-teal text-xs font-semibold">
                      {tag.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
              )}

              {dimStr && (
                <p className="text-xs text-slate flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                  </svg>
                  {dimStr}
                </p>
              )}

              {area.photo_ids.length > 0 && (
                <p className="text-xs text-slate flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  {area.photo_ids.length} photo{area.photo_ids.length !== 1 ? 's' : ''}
                </p>
              )}

              {area.notes && (
                <p className="text-xs text-slate italic bg-slate/5 rounded-lg px-3 py-2">
                  "{area.notes}"
                </p>
              )}
            </div>
          )
        })}

        {/* General Notes */}
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-navy">
            General Notes <span className="text-slate/50 font-normal">(optional)</span>
          </h3>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Anything else we should know? How water entered, unusual conditions, etc."
            rows={4}
            className="w-full px-4 py-3 rounded-xl border-2 border-slate/20
              focus:border-teal focus:outline-none text-navy resize-none
              placeholder:text-slate/40"
          />
        </div>

        {/* Spacer for sticky footer */}
        <div className="h-4" />
      </div>

      {/* Sticky footer */}
      <div className="fixed bottom-0 left-0 right-0 px-4 py-5 bg-gradient-to-t from-white via-white to-white/0">
        <div className="max-w-md mx-auto space-y-3">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="w-full btn-primary py-5 px-6 rounded-2xl text-lg font-bold shadow-xl
              hover:shadow-2xl transition-all duration-300
              disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Submitting...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                Submit Scope Sheet
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={onBack}
            disabled={saving}
            className="w-full py-3 px-6 rounded-2xl text-sm font-medium text-slate hover:text-navy transition-colors disabled:opacity-50"
          >
            ← Back to Walkthrough
          </button>
        </div>
      </div>
    </div>
  )
}
