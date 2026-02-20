// Scope area — one per selected damage category
export interface ScopeArea {
  id: string
  category: string
  category_key: string
  order: number
  tags: string[]
  dimensions: Record<string, number>
  photo_ids: string[]
  notes: string
}

// Main wizard state — phase-based
export interface WizardState {
  phase: 'welcome' | 'triage' | 'tour' | 'review'
  triageSelections: string[]
  areas: ScopeArea[]
  currentTourStep: number
  generalNotes: string
}

// Tracks an in-flight photo upload within a TourStep
export interface UploadingPhoto {
  file: File
  status: 'uploading' | 'done' | 'error'
  previewUrl: string
  documentId?: string
}

// Draft API response shape
export interface DraftResponse {
  success: boolean
  data: {
    id: string
    claim_id: string
    areas: ScopeArea[]
    triage_selections: string[]
    general_notes: string | null
    is_draft: boolean
    draft_step: number | null
    submitted_at: string | null
    created_at: string
    updated_at: string
  } | null
}
