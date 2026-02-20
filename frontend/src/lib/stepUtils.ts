// frontend/src/lib/stepUtils.ts

import type { Claim, LossType } from '../types/claim'

const TOTAL_STEPS = 7 as const

export type StepNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7

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
    title: 'Submit to ClaimCoach',
    description: 'Send your claim details for our team to file on your behalf',
    learnMore: 'Our team will file the claim with your insurance carrier and handle all the paperwork. Provide as much detail about the damage as possible so we can give your carrier a clear picture.',
    icon: '📤'
  },
  5: {
    number: 5,
    title: 'Add Adjuster Info',
    description: 'Enter details once insurance assigns an adjuster',
    learnMore: 'Once your carrier assigns an adjuster, enter their name, phone number, and the scheduled inspection date. This helps us track the timeline and prepare for the inspection.',
    icon: '🔍'
  },
  6: {
    number: 6,
    title: 'Review Insurance Offer',
    description: 'Our AI audits the carrier estimate for discrepancies',
    learnMore: 'Insurance companies sometimes offer less than repairs actually cost. Our AI compares their estimate to your contractor\'s estimate and current market rates to find discrepancies. If we find issues, we\'ll help you write a rebuttal letter.',
    icon: '🤖'
  },
  7: {
    number: 7,
    title: 'Get Paid & Close',
    description: 'Track your ACV and RCV payments',
    learnMore: 'Insurance usually pays in two parts: ACV (Actual Cash Value) upfront to start repairs, then RCV (Recoverable Depreciation) after repairs are done. Log each payment here so you always know where things stand.',
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
      return '✅ Submitted to ClaimCoach'
    case 5:
      return `✅ Adjuster assigned - ${claim.adjuster_name || 'Inspection scheduled'}`
    case 6:
      return '✅ Insurance offer reviewed'
    case 7:
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
      return '🎯 NEXT: Submit claim to ClaimCoach'
    case 5:
      return '🎯 NEXT: Enter adjuster info'
    case 6:
      return '🎯 NEXT: Review insurance offer'
    case 7:
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
