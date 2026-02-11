import ExteriorSideForm from './ExteriorSideForm'
import { StepProps } from './types'

// Step 5: Front Exterior
export function Step5FrontExterior(props: StepProps) {
  return <ExteriorSideForm {...props} side="front" />
}

// Step 6: Right Exterior
export function Step6RightExterior(props: StepProps) {
  return <ExteriorSideForm {...props} side="right" />
}

// Step 7: Back Exterior
export function Step7BackExterior(props: StepProps) {
  return <ExteriorSideForm {...props} side="back" />
}

// Step 8: Left Exterior
export function Step8LeftExterior(props: StepProps) {
  return <ExteriorSideForm {...props} side="left" />
}
