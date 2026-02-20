export interface TagDef {
  key: string
  label: string
}

export interface CategoryDef {
  key: string
  label: string
  emoji: string
  tags: TagDef[]
  dimensionType?: 'sqft' | 'lxw'
}

export const CATEGORIES: CategoryDef[] = [
  {
    key: 'roof',
    label: 'Roof',
    emoji: '🏠',
    dimensionType: 'sqft',
    tags: [
      { key: 'Type_3Tab_Shingle', label: '3-Tab Shingle' },
      { key: 'Type_Architectural_Shingle', label: 'Architectural Shingle' },
      { key: 'Type_Metal', label: 'Metal Roof' },
      { key: 'Pitch_Steep', label: 'Steep Pitch' },
      { key: 'Shingles_Damaged', label: 'Shingles Damaged' },
      { key: 'Underlayment_Torn', label: 'Underlayment Torn' },
      { key: 'Decking_Damaged', label: 'Decking Damaged' },
      { key: 'Vents_Damaged', label: 'Vents Damaged' },
      { key: 'Flashing_Missing', label: 'Flashing Missing' },
      { key: 'Gutters_Damaged', label: 'Gutters Damaged' },
      { key: 'Fascia_Damaged', label: 'Fascia Damaged' },
      { key: 'Soffit_Damaged', label: 'Soffit Damaged' },
      { key: 'Accessories_Damaged', label: 'Accessories Damaged' },
    ],
  },
  {
    key: 'exterior_walls',
    label: 'Exterior Walls',
    emoji: '🧱',
    dimensionType: 'sqft',
    tags: [
      { key: 'Siding_Damaged', label: 'Siding Damaged' },
      { key: 'Siding_Paint_Needed', label: 'Siding Paint Needed' },
      { key: 'Fascia_Damaged', label: 'Fascia Damaged' },
      { key: 'Soffit_Damaged', label: 'Soffit Damaged' },
      { key: 'Gutters_Damaged', label: 'Gutters Damaged' },
      { key: 'Window_Broken', label: 'Window Broken' },
      { key: 'Door_Damaged', label: 'Door Damaged' },
      { key: 'Trim_Damaged', label: 'Trim Damaged' },
    ],
  },
  {
    key: 'interior_kitchen',
    label: 'Kitchen',
    emoji: '🍳',
    dimensionType: 'lxw',
    tags: [
      { key: 'Drywall_Damaged', label: 'Drywall Damaged' },
      { key: 'Ceiling_Damaged', label: 'Ceiling Damaged' },
      { key: 'Flooring_Damaged', label: 'Flooring Damaged' },
      { key: 'Cabinets_Damaged', label: 'Cabinets Damaged' },
      { key: 'Appliances_Damaged', label: 'Appliances Damaged' },
    ],
  },
  {
    key: 'interior_bathroom',
    label: 'Bathroom',
    emoji: '🚿',
    dimensionType: 'lxw',
    tags: [
      { key: 'Drywall_Damaged', label: 'Drywall Damaged' },
      { key: 'Ceiling_Damaged', label: 'Ceiling Damaged' },
      { key: 'Flooring_Damaged', label: 'Flooring Damaged' },
      { key: 'Fixtures_Damaged', label: 'Fixtures Damaged' },
    ],
  },
  {
    key: 'interior_living',
    label: 'Living Room',
    emoji: '🛋️',
    dimensionType: 'lxw',
    tags: [
      { key: 'Drywall_Damaged', label: 'Drywall Damaged' },
      { key: 'Ceiling_Damaged', label: 'Ceiling Damaged' },
      { key: 'Flooring_Damaged', label: 'Flooring Damaged' },
    ],
  },
  {
    key: 'interior_bedroom',
    label: 'Bedroom',
    emoji: '🛏️',
    dimensionType: 'lxw',
    tags: [
      { key: 'Drywall_Damaged', label: 'Drywall Damaged' },
      { key: 'Ceiling_Damaged', label: 'Ceiling Damaged' },
      { key: 'Flooring_Damaged', label: 'Flooring Damaged' },
    ],
  },
  {
    key: 'water_mitigation',
    label: 'Water Mitigation',
    emoji: '💧',
    tags: [
      { key: 'Standing_Water_Present', label: 'Standing Water Present' },
      { key: 'Baseboards_Swollen', label: 'Baseboards Swollen' },
      { key: 'Drywall_Cuts_Needed', label: 'Drywall Cuts Needed' },
      { key: 'Dehumidifiers_Needed', label: 'Dehumidifiers Needed' },
      { key: 'Air_Movers_Needed', label: 'Air Movers Needed' },
    ],
  },
  {
    key: 'fencing_other',
    label: 'Fencing / Other',
    emoji: '🔧',
    tags: [
      { key: 'Fence_Sections_Damaged', label: 'Fence Sections Damaged' },
      { key: 'Gate_Damaged', label: 'Gate Damaged' },
      { key: 'Posts_Broken', label: 'Posts Broken' },
    ],
  },
]

export const CATEGORY_MAP: Record<string, CategoryDef> = Object.fromEntries(
  CATEGORIES.map(c => [c.key, c])
)
