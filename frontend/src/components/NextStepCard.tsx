import { useState } from 'react'
import { getStepDefinition } from '../lib/stepUtils'
import type { ClaimStep } from '../types/claim'

interface NextStepCardProps {
  stepNumber: ClaimStep
}

export default function NextStepCard({ stepNumber }: NextStepCardProps) {
  const [showLearnMore, setShowLearnMore] = useState(false)
  const step = getStepDefinition(stepNumber)

  return (
    <div className="glass-card-strong rounded-2xl p-6 mb-6 animate-scale-in">
      <div className="flex items-start space-x-4 mb-4">
        <div className="text-4xl flex-shrink-0">{step.icon}</div>
        <div className="flex-1">
          <div className="flex items-center space-x-2 mb-2">
            <span className="px-2 py-1 rounded-full bg-teal/20 text-teal text-xs font-semibold">
              CURRENT STEP
            </span>
            <span className="text-xs text-slate">Step {stepNumber} of 6</span>
          </div>
          <h3 className="text-xl font-display font-bold text-navy mb-2">{step.title}</h3>
          <p className="text-slate">{step.description}</p>
        </div>
      </div>

      <button
        onClick={() => setShowLearnMore(!showLearnMore)}
        className="text-sm text-teal hover:text-teal-dark font-medium mb-4"
      >
        {showLearnMore ? '− Show less' : '+ Learn more'}
      </button>

      {showLearnMore && (
        <div className="p-4 rounded-xl bg-teal/5 border border-teal/20 mb-4 animate-slide-down">
          <p className="text-sm text-slate">{step.learnMore}</p>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <button className="flex-1 btn-primary px-6 py-3 rounded-xl text-sm font-semibold">
          Start This Step →
        </button>
      </div>
    </div>
  )
}
