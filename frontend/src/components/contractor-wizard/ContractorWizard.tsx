import { useEffect } from 'react'
import { useWizardState } from './useWizardState'
import WizardProgress from './WizardProgress'
import Step1Welcome from './Step1Welcome'
import Step2Photos from './Step2Photos'
import Step3MainRoof from './Step3MainRoof'
import Step4SecondaryRoof from './Step4SecondaryRoof'
import { Step5FrontExterior, Step6RightExterior, Step7BackExterior, Step8LeftExterior } from './Step5678Exterior'
import Step9Dimensions from './Step9Dimensions'
import Step10Review from './Step10Review'
import type { Claim } from '../../types/claim'

interface ValidationResult {
  valid: boolean
  reason?: string
  magic_link_id?: string
  claim?: Claim
  contractor_name?: string
  expires_at?: string
  status?: string
}

interface ContractorWizardProps {
  token: string
  validationResult: ValidationResult
}

export default function ContractorWizard({ token, validationResult }: ContractorWizardProps) {
  const {
    wizardState,
    loadDraft,
    goNext,
    goBack,
    updateData,
    setHasSecondaryRoof,
    saving,
  } = useWizardState(token)

  // Load draft on mount
  useEffect(() => {
    loadDraft()
  }, [loadDraft])

  // Render current step
  const renderStep = () => {
    const stepProps = {
      wizardState,
      onNext: goNext,
      onBack: goBack,
      onUpdateData: updateData,
      submitting: saving,
    }

    switch (wizardState.currentStep) {
      case 1:
        return <Step1Welcome {...stepProps} claim={validationResult.claim!} />
      case 2:
        return <Step2Photos {...stepProps} token={token} />
      case 3:
        return <Step3MainRoof {...stepProps} setHasSecondaryRoof={setHasSecondaryRoof} />
      case 4:
        // Only render if hasSecondaryRoof is true
        if (wizardState.hasSecondaryRoof) {
          return <Step4SecondaryRoof {...stepProps} />
        }
        // Skip to step 5 if no secondary roof
        return <Step5FrontExterior {...stepProps} />
      case 5:
        return <Step5FrontExterior {...stepProps} />
      case 6:
        return <Step6RightExterior {...stepProps} />
      case 7:
        return <Step7BackExterior {...stepProps} />
      case 8:
        return <Step8LeftExterior {...stepProps} />
      case 9:
        return <Step9Dimensions {...stepProps} />
      case 10:
        return <Step10Review {...stepProps} token={token} />
      default:
        return <Step1Welcome {...stepProps} claim={validationResult.claim!} />
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate/5">
      <WizardProgress
        currentStep={wizardState.currentStep}
        totalSteps={wizardState.totalSteps}
        completedSteps={wizardState.completedSteps}
      />

      <div className="pb-24">
        {renderStep()}
      </div>
    </div>
  )
}
