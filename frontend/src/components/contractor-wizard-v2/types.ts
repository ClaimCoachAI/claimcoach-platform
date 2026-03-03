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
