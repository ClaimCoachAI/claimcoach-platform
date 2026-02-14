export interface ScopeSheet {
  id: string
  claim_id: string
  damage_type: string
  affected_areas: string[]
  urgency_level: string
  contractor_notes?: string
  photos_count?: number
  created_at: string
  updated_at?: string
}
