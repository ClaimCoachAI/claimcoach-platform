interface WizardV2ProgressProps {
  currentStep: number
  totalSteps?: number
}

const STEP_LABELS = ['Quick Setup', 'Elevations', 'Roof', 'Rooms', 'Review']

export default function WizardV2Progress({ currentStep, totalSteps = 5 }: WizardV2ProgressProps) {
  const pct = Math.round(((currentStep - 1) / (totalSteps - 1)) * 100)
  return (
    <div style={{ padding: '12px 16px', background: '#fff', borderBottom: '1px solid #e5e7eb' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: '#374151' }}>
          Step {currentStep} of {totalSteps}: {STEP_LABELS[currentStep - 1]}
        </span>
        <span style={{ fontSize: 12, color: '#6b7280' }}>{pct}%</span>
      </div>
      <div style={{ height: 4, background: '#e5e7eb', borderRadius: 2 }}>
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background: '#0d9488',
            borderRadius: 2,
            transition: 'width 0.3s ease',
          }}
        />
      </div>
    </div>
  )
}
