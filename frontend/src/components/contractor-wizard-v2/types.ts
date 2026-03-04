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

// ── Roof ──────────────────────────────────────────────────────────────────────

export type Pitch = 'flat' | '2_12' | '4_12' | '6_12' | '8_12' | '10_12' | '12_12_plus'

export type RoofShingleType = '3tab' | 'architectural' | 'metal' | 'tile' | 'tpo' | 'other'

export type DeckingCondition = 'good' | 'soft_spots' | 'needs_replace'

/** The four required named photo slots on the roof. */
export type RoofPhotoSlot = 'overview' | 'slope' | 'shingles' | 'ridge'

export interface RoofDamageSpot {
  id: string
  roof_id: string
  photo_id: string | null
  photo_url: string | null
  caption: string | null
  sort_order: number
}

export interface RoofData {
  id?: string
  inspection_id?: string
  overview_photo_id: string | null
  overview_photo_url: string | null
  slope_photo_id: string | null
  slope_photo_url: string | null
  shingles_photo_id: string | null
  shingles_photo_url: string | null
  ridge_photo_id: string | null
  ridge_photo_url: string | null
  pitch: Pitch | null
  shingle_type: RoofShingleType | null
  layers: number | null
  squares: number | null
  has_ridge_damage: boolean
  has_valley_damage: boolean
  has_flashing_damage: boolean
  decking_condition: DeckingCondition | null
  notes: string | null
}

// ── Rooms ─────────────────────────────────────────────────────────────────────

export const DAMAGED_MATERIALS = [
  'Drywall',
  'Flooring',
  'Baseboards',
  'Ceiling',
  'Trim',
] as const

export type DamagedMaterial = (typeof DAMAGED_MATERIALS)[number]

export interface InspectionRoomPhoto {
  id: string
  room_id: string
  photo_id: string | null
  photo_url: string | null
  caption: string | null
  sort_order: number
  created_at: string
}

export interface InspectionRoom {
  id: string
  inspection_id: string
  name: string
  length_ft: number | null
  width_ft: number | null
  height_ft: number | null
  damaged_materials: DamagedMaterial[]
  notes: string | null
  sort_order: number
  created_at: string
  updated_at: string
  photos: InspectionRoomPhoto[]
}

export interface CreateRoomInput {
  name: string
  length_ft?: number | null
  width_ft?: number | null
  height_ft?: number | null
  damaged_materials?: DamagedMaterial[]
  notes?: string | null
}

export interface UpdateRoomInput {
  name: string
  length_ft: number | null
  width_ft: number | null
  height_ft: number | null
  damaged_materials: DamagedMaterial[]
  notes: string | null
}
