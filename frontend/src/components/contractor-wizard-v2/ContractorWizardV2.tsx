import WizardV2Progress from './WizardV2Progress'
import { useWizardV2State } from './useWizardV2State'
import QuickSetupStep from './steps/QuickSetupStep'
import ElevationsStep from './steps/ElevationsStep'
import RoofStep from './steps/RoofStep'
import RoomsStep from './steps/RoomsStep'
import DataCheckStep from './steps/DataCheckStep'

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

      {state.currentStep === 2 && (
        <ElevationsStep
          token={state.token}
          elevations={state.elevations}
          onSaveElevation={state.saveElevation}
          onContinue={() => state.setCurrentStep(state.computeNextStep(2))}
          onBack={() => state.setCurrentStep(state.computePrevStep(2))}
          loading={state.elevationLoading}
          error={state.error}
        />
      )}

      {state.currentStep === 3 && (
        <RoofStep
          token={state.token}
          roof={state.roof}
          damageSpots={state.roofDamageSpots}
          onSaveRoof={state.saveRoof}
          onAddDamageSpot={state.addDamageSpot}
          onDeleteDamageSpot={state.deleteDamageSpot}
          onContinue={() => state.setCurrentStep(state.computeNextStep(3))}
          onBack={() => state.setCurrentStep(state.computePrevStep(3))}
          loading={state.roofLoading}
          error={state.error}
        />
      )}

      {state.currentStep === 4 && (
        <RoomsStep
          rooms={state.rooms}
          roomsLoading={state.roomsLoading}
          onCreateRoom={async () => { await state.createRoom({ name: 'Room' }) }}
          onUpdateRoom={state.updateRoom}
          onDeleteRoom={state.deleteRoom}
          onAddRoomPhoto={async (roomId, input) => { await state.addRoomPhoto(roomId, input) }}
          onDeleteRoomPhoto={state.deleteRoomPhoto}
          onContinue={() => state.setCurrentStep(state.computeNextStep(4))}
          onBack={() => state.setCurrentStep(state.computePrevStep(4))}
        />
      )}
      {state.currentStep === 5 && (
        <DataCheckStep
          quickSetup={state.quickSetup}
          elevations={state.elevations}
          roof={state.roof}
          roofDamageSpots={state.roofDamageSpots}
          rooms={state.rooms}
          elevationLoading={state.elevationLoading}
          roofLoading={state.roofLoading}
          roomsLoading={state.roomsLoading}
          submittedAt={state.submittedAt}
          onSubmit={state.submitInspection}
          onBack={() => state.setCurrentStep(state.computePrevStep(5))}
        />
      )}
    </div>
  )
}
