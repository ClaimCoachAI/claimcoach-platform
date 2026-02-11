interface WizardProgressProps {
  currentStep: number
  totalSteps: number
  completedSteps: number[]
}

export default function WizardProgress({
  currentStep,
  totalSteps,
  completedSteps,
}: WizardProgressProps) {
  const progressPercentage = (currentStep / totalSteps) * 100

  return (
    <div className="sticky top-0 z-50 bg-gradient-to-b from-white via-white to-white/95 backdrop-blur-sm border-b border-teal/10">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4">
        {/* Step Counter */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-navy/60">Progress</span>
            <div className="h-1 w-1 rounded-full bg-navy/20" />
            <span className="text-lg font-display font-bold text-navy">
              Step {currentStep} of {totalSteps}
            </span>
          </div>
          <span className="text-sm font-semibold text-teal">
            {Math.round(progressPercentage)}%
          </span>
        </div>

        {/* Progress Bar Container */}
        <div className="relative h-3 bg-gradient-to-r from-slate/10 to-slate/5 rounded-full overflow-hidden shadow-inner">
          {/* Background shimmer effect */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />

          {/* Progress Fill */}
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#3BA090] via-[#52B5A5] to-[#3BA090] shadow-lg transition-all duration-700 ease-out"
            style={{
              width: `${progressPercentage}%`,
              boxShadow: '0 0 20px rgba(59, 160, 144, 0.4), 0 0 40px rgba(59, 160, 144, 0.2)',
            }}
          >
            {/* Glow overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-transparent via-white/20 to-white/40 rounded-full" />

            {/* Animated shine */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent animate-slide-shine" />
          </div>

          {/* Step Markers */}
          <div className="absolute inset-0 flex items-center justify-between px-1">
            {Array.from({ length: totalSteps }, (_, i) => i + 1).map((step) => {
              const isCompleted = completedSteps.includes(step)
              const isCurrent = step === currentStep

              return (
                <div
                  key={step}
                  className="relative flex items-center justify-center"
                  style={{ width: `${100 / totalSteps}%` }}
                >
                  {/* Step Indicator */}
                  <div
                    className={`
                      relative z-10 flex items-center justify-center
                      w-7 h-7 rounded-full transition-all duration-500
                      ${
                        isCompleted || isCurrent
                          ? 'bg-white shadow-lg scale-110'
                          : 'bg-slate/20 scale-90'
                      }
                    `}
                    style={{
                      boxShadow:
                        isCompleted || isCurrent
                          ? '0 4px 12px rgba(59, 160, 144, 0.3)'
                          : 'none',
                    }}
                  >
                    {isCompleted ? (
                      // Checkmark for completed steps
                      <svg
                        className="w-4 h-4 text-teal animate-check-pop"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        strokeWidth={3}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M5 13l4 4L19 7" />
                      </svg>
                    ) : isCurrent ? (
                      // Pulse for current step
                      <div className="relative">
                        <div className="absolute inset-0 rounded-full bg-teal animate-ping opacity-40" />
                        <div className="relative w-3 h-3 rounded-full bg-teal" />
                      </div>
                    ) : (
                      // Empty for future steps
                      <div className="w-2 h-2 rounded-full bg-slate/40" />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Encouraging Message */}
        <div className="mt-3 text-center">
          <p className="text-xs text-slate/60 font-medium">
            {currentStep === 1 && "Let's get started! 🚀"}
            {currentStep > 1 && currentStep < totalSteps && "You're doing great! Keep going 💪"}
            {currentStep === totalSteps && "Almost there! Final step 🎉"}
          </p>
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

        @keyframes check-pop {
          0% {
            transform: scale(0) rotate(-45deg);
            opacity: 0;
          }
          50% {
            transform: scale(1.2) rotate(0deg);
          }
          100% {
            transform: scale(1) rotate(0deg);
            opacity: 1;
          }
        }

        .animate-shimmer {
          animation: shimmer 3s infinite;
        }

        .animate-slide-shine {
          animation: slide-shine 2s infinite;
        }

        .animate-check-pop {
          animation: check-pop 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55);
        }
      `}</style>
    </div>
  )
}
