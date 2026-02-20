import { useWizardState } from './useWizardState'
import WizardProgress from './WizardProgress'
import Step1Welcome from './Step1Welcome'
import TriageScreen from './TriageScreen'
import TourStep from './TourStep'
import ReviewScreen from './ReviewScreen'
import { CATEGORY_MAP } from './taxonomy'
import type { Claim } from '../../types/claim'

interface ValidationResult {
  valid: boolean
  reason?: string
  magic_link_id?: string
  claim?: Claim
}

interface ContractorWizardProps {
  token: string
  validationResult: ValidationResult
}

function computeProgress(
  phase: string,
  currentTourStep: number,
  totalAreas: number
): { percent: number; label: string } {
  switch (phase) {
    case 'welcome':
      return { percent: 5, label: 'Welcome' }
    case 'triage':
      return { percent: 15, label: 'Triage — select affected areas' }
    case 'tour': {
      const total = totalAreas || 1
      const pct = 20 + Math.round(((currentTourStep + 1) / (total + 1)) * 65)
      return { percent: Math.min(pct, 85), label: `Walkthrough — area ${currentTourStep + 1} of ${total}` }
    }
    case 'review':
      return { percent: 90, label: 'Review & Submit' }
    default:
      return { percent: 5, label: '' }
  }
}

export default function ContractorWizard({ token, validationResult }: ContractorWizardProps) {
  const {
    wizardState,
    loading,
    saving,
    goToTriage,
    startTour,
    completeTourStep,
    goBackInTour,
    goBackToTour,
    submit,
  } = useWizardState(token)

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-white to-slate/5 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-teal border-t-transparent" />
          <p className="text-slate text-sm">Loading your progress...</p>
        </div>
      </div>
    )
  }

  const { percent, label } = computeProgress(
    wizardState.phase,
    wizardState.currentTourStep,
    wizardState.areas.length
  )

  const renderPhase = () => {
    switch (wizardState.phase) {
      case 'welcome':
        return (
          <Step1Welcome
            claim={validationResult.claim!}
            onNext={goToTriage}
            submitting={saving}
          />
        )

      case 'triage':
        return (
          <TriageScreen
            selections={wizardState.triageSelections}
            onStartTour={startTour}
            onBack={() => {/* welcome phase has no back */}}
          />
        )

      case 'tour': {
        const area = wizardState.areas[wizardState.currentTourStep]
        if (!area) return null
        const catDef = CATEGORY_MAP[area.category_key]
        if (!catDef) return null
        return (
          <TourStep
            area={area}
            areaIndex={wizardState.currentTourStep}
            totalAreas={wizardState.areas.length}
            categoryDef={catDef}
            token={token}
            onComplete={completeTourStep}
            onBack={goBackInTour}
            saving={saving}
          />
        )
      }

      case 'review':
        return (
          <ReviewScreen
            areas={wizardState.areas}
            generalNotes={wizardState.generalNotes}
            onSubmit={submit}
            onBack={goBackToTour}
            saving={saving}
          />
        )
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate/5">
      <WizardProgress progressPercent={percent} phaseLabel={label} />
      <div className="pb-8">
        {renderPhase()}
      </div>
    </div>
  )
}
