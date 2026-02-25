export type LossType = 'water' | 'hail'
export type ClaimStep = 1 | 2 | 3 | 4 | 5 | 6 | 7
export type DeductibleResult = 'worth_filing' | 'not_worth_filing'

export interface Payment {
  id: string
  claim_id: string
  payment_type: 'acv' | 'rcv'
  amount: number
  expected_amount?: number
  check_number?: string
  received_date?: string
  notes?: string
  status: 'expected' | 'received' | 'reconciled' | 'disputed'
  created_at: string
  updated_at: string
}

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
  carrier_phone?: string | null
  carrier_email?: string | null
  policy_number: string
  deductible_value: number
  exclusions?: string | null
  policy_pdf_url?: string | null
  effective_date?: string | null
  expiration_date?: string | null
  created_at: string
  updated_at: string
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

  // Legal escalation (added in migration 000011)
  legal_partner_name?: string
  legal_partner_email?: string
  owner_email?: string
  legal_escalation_status?: 'pending_approval' | 'approved' | 'declined' | 'sent_to_lawyer'
}
