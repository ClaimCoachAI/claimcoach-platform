// frontend/src/lib/stepUtils.ts

import type { Claim, LossType } from '../types/claim'

const TOTAL_STEPS = 6 as const

export type StepNumber = 1 | 2 | 3 | 4 | 5 | 6

export interface StepDefinition {
  number: StepNumber
  title: string
  description: string
  learnMore: string
  icon: string
}

export const STEP_DEFINITIONS: Record<StepNumber, StepDefinition> = {
  1: {
    number: 1,
    title: 'Report the Damage',
    description: 'Tell us what happened and when',
    learnMore: 'We\'ll create a claim file and start tracking everything for you.',
    icon: '📋'
  },
  2: {
    number: 2,
    title: 'Get Contractor Photos',
    description: 'Send a link to your contractor for photos and estimate',
    learnMore: 'Your contractor will receive an email with a secure link. They can upload photos and their estimate without creating an account. The link works for 7 days. Tip: Give them a heads up that the email is coming!',
    icon: '📸'
  },
  3: {
    number: 3,
    title: 'Check if Worth Filing',
    description: 'See if repairs cost more than your deductible',
    learnMore: 'If repairs cost less than your deductible, you\'ll pay out of pocket anyway, so filing a claim isn\'t worth it. But you can still file if you want - sometimes it makes sense for documentation purposes.',
    icon: '💰'
  },
  4: {
    number: 4,
    title: 'File & Schedule',
    description: 'File with insurance and schedule their inspection',
    learnMore: 'Call your insurance company or use their online portal to file the claim. They\'ll give you a claim number and assign an adjuster. The adjuster will want to inspect the damage - schedule a time that works for you.',
    icon: '📋'
  },
  5: {
    number: 5,
    title: 'Review Insurance Offer',
    description: 'See if their offer is fair (we\'ll help!)',
    learnMore: 'Insurance companies sometimes offer less than repairs actually cost. Our AI compares their estimate to your contractor\'s estimate and current market rates to find discrepancies. If we find issues, we\'ll help you write a rebuttal letter.',
    icon: '🤖'
  },
  6: {
    number: 6,
    title: 'Get Paid & Close',
    description: 'Track payments and wrap up',
    learnMore: 'Insurance usually pays in two parts: ACV (Actual Cash Value) upfront to start repairs, then RCV (Recoverable Depreciation) after repairs are done. We\'ll help you request the second payment and make sure you get everything you\'re owed.',
    icon: '✅'
  }
}

export function getStepDefinition(step: StepNumber): StepDefinition {
  return STEP_DEFINITIONS[step]
}

export function getNextStep(currentStep: StepNumber): StepNumber | null {
  return currentStep < TOTAL_STEPS ? (currentStep + 1) as StepNumber : null
}

export function getProgress(stepsCompleted: number[]): {
  completed: number
  total: number
  percentage: number
} {
  return {
    completed: stepsCompleted.length,
    total: TOTAL_STEPS,
    percentage: Math.round((stepsCompleted.length / TOTAL_STEPS) * 100)
  }
}

export function isStepComplete(stepNumber: StepNumber, stepsCompleted: number[]): boolean {
  return stepsCompleted.includes(stepNumber)
}

export function getDamageTypeIcon(lossType: LossType): string {
  return lossType === 'water' ? '💧' : '🧊'
}

export function getDamageTypeLabel(lossType: LossType): string {
  return lossType === 'water' ? 'Water Damage' : 'Hail Damage'
}

export function getStepStatusText(
  currentStep: StepNumber,
  stepsCompleted: number[],
  claim: Claim
): string {
  if (isStepComplete(currentStep, stepsCompleted)) {
    return getCompletedStepText(currentStep, claim)
  }
  return getInProgressStepText(currentStep, claim)
}

function getCompletedStepText(step: StepNumber, claim: Claim): string {
  switch (step) {
    case 1:
      return `✅ Damage Reported - ${getDamageTypeLabel(claim.loss_type)}`
    case 2:
      return `✅ Photos Received from ${claim.contractor_name || 'contractor'}`
    case 3:
      return claim.deductible_comparison_result === 'worth_filing'
        ? '✅ Worth Filing - Above deductible'
        : '⚠️ Below deductible'
    case 4:
      return `✅ Filed with insurance - Claim #${claim.insurance_claim_number}`
    case 5:
      return '✅ Insurance offer reviewed'
    case 6:
      return '✅ Claim closed'
    default:
      return '✅ Complete'
  }
}

function getInProgressStepText(step: StepNumber, claim: Claim): string {
  switch (step) {
    case 2:
      return claim.contractor_email
        ? `⏳ Waiting for ${claim.contractor_name || 'contractor'} to upload`
        : '🎯 NEXT: Send link to contractor'
    case 3:
      return '🎯 NEXT: Compare estimate to deductible'
    case 4:
      return '🎯 NEXT: File with insurance'
    case 5:
      return '🎯 NEXT: Review insurance offer'
    case 6:
      return '🎯 NEXT: Track payments'
    default:
      return ''
  }
}

export function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString)

  // Validate date
  if (isNaN(date.getTime())) {
    return 'Invalid date'
  }

  const now = new Date()
  const diffMs = now.getTime() - date.getTime()

  // Handle future dates
  if (diffMs < 0) {
    return 'Future date'
  }

  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return '1 day ago'
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
  return `${Math.floor(diffDays / 30)} months ago`
}
