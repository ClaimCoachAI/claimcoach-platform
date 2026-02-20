import { useState } from 'react'
import { CATEGORIES } from './taxonomy'

interface TriageScreenProps {
  selections: string[]
  onStartTour: (selections: string[]) => void
  onBack: () => void
}

export default function TriageScreen({ selections: initialSelections, onStartTour, onBack }: TriageScreenProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelections))

  const toggle = (key: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  return (
    <div className="min-h-[calc(100vh-200px)] px-4 py-8 pb-36">
      <div className="max-w-md mx-auto space-y-6">
        {/* Header */}
        <div className="space-y-2 animate-fade-in">
          <h2 className="text-3xl font-display font-bold text-navy">What was affected?</h2>
          <p className="text-slate leading-relaxed">
            Select everything that applies. We'll create one step per area.
          </p>
        </div>

        {/* Category tiles */}
        <div className="space-y-3 animate-slide-up">
          {CATEGORIES.map(cat => {
            const isSelected = selected.has(cat.key)
            return (
              <button
                key={cat.key}
                type="button"
                onClick={() => toggle(cat.key)}
                className={`
                  w-full flex items-center gap-4 p-4 rounded-2xl
                  border-2 transition-all duration-200 text-left active:scale-[0.98]
                  ${isSelected
                    ? 'border-teal bg-teal/10 shadow-md'
                    : 'border-slate/20 bg-white hover:border-teal/40 hover:bg-teal/5'
                  }
                `}
              >
                <span className="text-3xl flex-shrink-0 leading-none">{cat.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-base font-bold ${isSelected ? 'text-teal' : 'text-navy'}`}>
                    {cat.label}
                  </p>
                  <p className="text-xs text-slate/60 mt-0.5">{cat.tags.length} damage tags</p>
                </div>
                <div className={`
                  w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0
                  transition-all duration-200
                  ${isSelected ? 'border-teal bg-teal' : 'border-slate/30 bg-white'}
                `}>
                  {isSelected && (
                    <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        {/* Selected count */}
        {selected.size > 0 && (
          <p className="text-center text-sm text-teal font-semibold animate-fade-in">
            {selected.size} area{selected.size !== 1 ? 's' : ''} selected
          </p>
        )}

        {/* Actions — sticky footer */}
        <div className="fixed bottom-0 left-0 right-0 px-4 py-5 bg-gradient-to-t from-white via-white to-white/0 space-y-3">
          <div className="max-w-md mx-auto space-y-3">
            <button
              type="button"
              onClick={() => onStartTour(Array.from(selected))}
              disabled={selected.size === 0}
              className="w-full btn-primary py-5 px-6 rounded-2xl text-lg font-bold shadow-xl
                hover:shadow-2xl transition-all duration-300
                disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span className="flex items-center justify-center gap-2">
                Start Walkthrough
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </span>
            </button>

            <button
              type="button"
              onClick={onBack}
              className="w-full py-3 px-6 rounded-2xl text-sm font-medium text-slate hover:text-navy transition-colors"
            >
              ← Back to Welcome
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
