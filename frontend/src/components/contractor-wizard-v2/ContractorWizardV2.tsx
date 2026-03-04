import WizardV2Progress from './WizardV2Progress'
import { useWizardV2State } from './useWizardV2State'
import QuickSetupStep from './steps/QuickSetupStep'

interface ContractorWizardV2Props {
  token: string
}

export default function ContractorWizardV2({ token }: ContractorWizardV2Props) {
  const state = useWizardV2State(token)

  if (state.loading && !state.inspectionId) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{ color: '#6b7280', fontSize: 16 }}>Loading...</div>
      </div>
    )
  }

  if (state.error && !state.inspectionId && state.currentStep === 1 && !state.loading) {
    // Fatal error on initial load (e.g. invalid token)
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: 24 }}>
        <div style={{ textAlign: 'center', color: '#dc2626' }}>
          <p style={{ fontSize: 18, fontWeight: 600 }}>Unable to load inspection</p>
          <p style={{ fontSize: 14, color: '#6b7280', marginTop: 8 }}>{state.error}</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', minHeight: '100vh', background: '#f9fafb' }}>
      <WizardV2Progress currentStep={state.currentStep} />

      {state.currentStep === 1 && (
        <QuickSetupStep
          propertyAddress={state.propertyAddress}
          data={state.quickSetup}
          onChange={state.setQuickSetup}
          onContinue={state.submitQuickSetup}
          loading={state.loading}
          error={state.error}
        />
      )}

      {state.currentStep > 1 && (
        <div style={{ padding: 32, textAlign: 'center', color: '#6b7280' }}>
          <p style={{ fontSize: 18, fontWeight: 600, color: '#374151' }}>Step {state.currentStep}</p>
          <p style={{ marginTop: 8 }}>Coming in the next slice...</p>
        </div>
      )}
    </div>
  )
}
