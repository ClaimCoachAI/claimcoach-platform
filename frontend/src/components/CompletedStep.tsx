import { useState } from 'react'
import { getStepDefinition } from '../lib/stepUtils'
import type { Claim, ClaimStep } from '../types/claim'

interface CompletedStepProps {
  stepNumber: ClaimStep
  claim: Claim
}

export default function CompletedStep({ stepNumber, claim }: CompletedStepProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const step = getStepDefinition(stepNumber)

  const getStepSummary = () => {
    switch (stepNumber) {
      case 1:
        return {
          icon: '📋',
          title: 'Damage Reported',
          detail: `${claim.loss_type === 'water' ? 'Water' : 'Hail'} damage on ${new Date(
            claim.incident_date
          ).toLocaleDateString()}`,
        }
      case 2:
        return {
          icon: '🔍',
          title: 'Assessment Complete',
          detail: `By: ${claim.contractor_name || 'assessor'}`,
        }
      case 3:
        return {
          icon: '💰',
          title: 'Worth Filing',
          detail:
            claim.deductible_comparison_result === 'worth_filing'
              ? 'Above deductible'
              : 'Below deductible',
        }
      case 4:
        return {
          icon: '📋',
          title: 'Filed with Insurance',
          detail: claim.insurance_claim_number
            ? `Claim #${claim.insurance_claim_number}`
            : 'Filed',
        }
      case 5:
        return {
          icon: '🤖',
          title: 'Insurance Offer Reviewed',
          detail: 'AI comparison completed',
        }
      case 6:
        return {
          icon: '✅',
          title: 'Claim Closed',
          detail: 'All payments received',
        }
      default:
        return {
          icon: '✅',
          title: 'Complete',
          detail: '',
        }
    }
  }

  const summary = getStepSummary()

  return (
    <div className="mb-3">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full text-left p-4 rounded-xl glass-card hover:shadow-md transition-all"
      >
        <div className="flex items-start space-x-3">
          <span className="text-xl flex-shrink-0">{summary.icon}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2">
              <span className="text-green-500">✓</span>
              <h4 className="font-medium text-navy">{summary.title}</h4>
            </div>
            <p className="text-sm text-slate mt-1">{summary.detail}</p>
          </div>
          <svg
            className={`w-5 h-5 text-slate transition-transform ${
              isExpanded ? 'rotate-180' : ''
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      </button>

      {isExpanded && (
        <div className="mt-2 ml-12 p-4 rounded-xl bg-slate/5 border border-slate/10 animate-slide-down">
          <p className="text-sm text-slate mb-2">{step.description}</p>
          {step.learnMore && (
            <p className="text-xs text-slate/70 mt-2 italic">{step.learnMore}</p>
          )}
        </div>
      )}
    </div>
  )
}
