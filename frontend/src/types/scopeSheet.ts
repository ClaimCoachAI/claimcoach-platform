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

export interface ScopeSheet {
  id: string
  claim_id: string
  areas: ScopeArea[]
  triage_selections: string[]
  general_notes: string | null
  is_draft: boolean
  submitted_at?: string | null
  created_at: string
  updated_at: string
}
