export type PropertyType = 'sfh' | 'duplex' | 'small_mf' | 'mf' | 'commercial_light'

export interface AreaSelection {
  include_roof: boolean
  include_exterior: boolean
  include_interior: boolean
  include_porch: boolean
}

export interface InspectionV2 {
  id: string
  claim_id: string
  magic_link_id: string
  property_type: PropertyType | null
  stories: number | null
  status: 'draft' | 'in_progress' | 'submitted'
  current_step: number
  area_selection: AreaSelection | null
}

export interface QuickSetupData {
  property_type: PropertyType | null
  stories: number | null
  area_selection: AreaSelection
}

export interface GetSetupResponse {
  inspection: InspectionV2 | null
  property_address: string
  contractor_name: string
}

// Wizard step IDs — drives which screen is shown
export type WizardStep = 1 | 2 | 3 | 4 | 5

export type ElevationSide = 'front' | 'right' | 'back' | 'left'

export type SidingType = 'vinyl' | 'wood' | 'fiber_cement' | 'brick' | 'stucco' | 'other'

export interface ElevationData {
  id?: string
  side: ElevationSide
  photo_document_id: string | null
  photo_url: string | null
  has_damage: boolean
  siding_type: SidingType | null
  siding_replace_sf: number | null
  siding_paint_sf: number | null
  gutter_lf: number | null
  windows_count: number | null
  doors_count: number | null
  notes: string | null
}
