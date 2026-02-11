export type LossType = 'water' | 'hail'
export type ClaimStep = 1 | 2 | 3 | 4 | 5 | 6
export type DeductibleResult = 'worth_filing' | 'not_worth_filing'

export interface Property {
  id: string
  organization_id: string
  nickname: string
  legal_address: string
  lat?: number
  lng?: number
  owner_entity_name: string
  mortgage_bank_id?: string
  status: string
  created_at: string
  updated_at: string
  policy?: {
    policy_number: string
    carrier: string
  }
}

export interface Policy {
  id: string
  property_id: string
  carrier_name: string
  policy_number?: string
  coverage_a_limit?: number
  coverage_b_limit?: number
  coverage_d_limit?: number
  deductible_type?: 'percentage' | 'fixed'
  deductible_value?: number
  deductible_calculated?: number
  effective_date?: string
  expiration_date?: string
}

export interface Claim {
  id: string
  claim_number: string | null
  property_id: string
  property?: Property
  policy?: Policy
  loss_type: LossType
  status: string
  incident_date: string
  filed_at?: string
  description?: string
  contractor_estimate_total?: number

  // Step tracking
  current_step?: ClaimStep
  steps_completed?: number[]

  // Step-specific data
  contractor_email?: string
  contractor_name?: string
  contractor_photos_uploaded_at?: string
  deductible_comparison_result?: DeductibleResult
  insurance_claim_number?: string
  adjuster_name?: string
  adjuster_phone?: string
  inspection_datetime?: string

  created_at: string
  updated_at: string
}
