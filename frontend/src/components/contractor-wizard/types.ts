import { ScopeSheetData } from '../ScopeSheetForm'

// Re-export ScopeSheetData for convenience
export type { ScopeSheetData }

/**
 * Represents an uploaded file with tracking information
 */
export interface UploadedFile {
  file: File
  documentId?: string
  uploading: boolean
  uploaded: boolean
  error?: string
  previewUrl?: string // URL for displaying already-uploaded photos from backend
}

/**
 * Main wizard state interface
 */
export interface WizardState {
  currentStep: number
  totalSteps: number
  hasSecondaryRoof: boolean | null
  wizardData: ScopeSheetData
  completedSteps: number[]
  photos: UploadedFile[]
  draftStep?: number
}

/**
 * Props interface for all wizard step components
 */
export interface StepProps {
  wizardState: WizardState
  onNext: (stepData?: Partial<ScopeSheetData>) => Promise<void>
  onBack: () => void
  onUpdateData: (data: Partial<ScopeSheetData>) => void
  submitting: boolean
}

/**
 * API response format for draft operations
 */
export interface DraftResponse {
  success: boolean
  data: {
    id: string
    claim_id: string
    draft_step: number
    created_at: string
    updated_at: string
    submitted_at?: string
    // All the scope sheet data fields
    [key: string]: unknown
  }
}

/**
 * API request format for saving drafts
 */
export interface SaveDraftRequest {
  draft_step: number
  [key: string]: unknown
}
