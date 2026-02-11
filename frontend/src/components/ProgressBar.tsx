import { getProgress } from '../lib/stepUtils'

interface ProgressBarProps {
  stepsCompleted: number[]
  currentStep: number
}

export default function ProgressBar({ stepsCompleted, currentStep }: ProgressBarProps) {
  const progress = getProgress(stepsCompleted)

  return (
    <div className="glass-card rounded-2xl p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium text-navy">
          Progress: {progress.completed} of {progress.total} steps done
        </p>
        <p className="text-xs text-slate">{progress.percentage}%</p>
      </div>

      <div className="flex items-center space-x-1">
        {[1, 2, 3, 4, 5, 6].map((step) => (
          <div
            key={step}
            className={`h-2 flex-1 rounded-full transition-all duration-300 ${
              stepsCompleted.includes(step)
                ? 'bg-teal'
                : step === currentStep
                ? 'bg-teal/50 animate-pulse'
                : 'bg-slate/20'
            }`}
          />
        ))}
      </div>

      <div className="md:hidden mt-3 flex items-center justify-center">
        <div className="flex space-x-1">
          {[1, 2, 3, 4, 5, 6].map((step) => (
            <span
              key={step}
              className={`text-sm ${
                stepsCompleted.includes(step)
                  ? 'text-teal'
                  : step === currentStep
                  ? 'text-teal/70'
                  : 'text-slate/40'
              }`}
            >
              {stepsCompleted.includes(step) ? '●' : step === currentStep ? '◉' : '○'}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
