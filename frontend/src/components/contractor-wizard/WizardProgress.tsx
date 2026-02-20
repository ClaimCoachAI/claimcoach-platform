interface WizardProgressProps {
  progressPercent: number
  phaseLabel: string
}

export default function WizardProgress({ progressPercent, phaseLabel }: WizardProgressProps) {
  const pct = Math.max(0, Math.min(100, progressPercent))

  return (
    <div className="sticky top-0 z-50 bg-gradient-to-b from-white via-white to-white/95 backdrop-blur-sm border-b border-teal/10">
      <div className="max-w-md mx-auto px-4 py-4">
        {/* Label row */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-navy/70">{phaseLabel}</span>
          <span className="text-sm font-bold text-teal">{Math.round(pct)}%</span>
        </div>

        {/* Progress bar */}
        <div className="relative h-2.5 bg-slate/10 rounded-full overflow-hidden shadow-inner">
          {/* Shimmer background */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />

          {/* Fill */}
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#3BA090] via-[#52B5A5] to-[#3BA090] transition-all duration-700 ease-out"
            style={{
              width: `${pct}%`,
              boxShadow: '0 0 12px rgba(59, 160, 144, 0.4)',
            }}
          >
            <div className="absolute inset-0 bg-gradient-to-t from-transparent via-white/20 to-white/40 rounded-full" />
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent animate-slide-shine" />
          </div>
        </div>
      </div>

      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        @keyframes slide-shine {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
        .animate-shimmer { animation: shimmer 3s infinite; }
        .animate-slide-shine { animation: slide-shine 2s infinite; }
      `}</style>
    </div>
  )
}
