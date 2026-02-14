export interface ScopeSheet {
  id: string
  claim_id: string
  roof_type?: string
  roof_square_footage?: number
  notes?: string
  is_draft: boolean
  submitted_at?: string
  created_at: string
  updated_at: string
  // Allow additional fields from the extensive scope sheet model
  [key: string]: any
}
