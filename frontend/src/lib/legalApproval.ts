import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080'

export interface ApprovalPageData {
  property_address: string
  loss_type: string
  incident_date: string
  carrier_estimate: number
  industry_estimate: number
  delta: number
  owner_name: string
  legal_partner_name: string
  status: 'pending' | 'approved' | 'declined' | 'expired'
}

export async function fetchApprovalData(token: string): Promise<ApprovalPageData | null> {
  const res = await axios.get(`${API_URL}/api/legal-approval/${token}`)
  return res.data.data as ApprovalPageData
}

export async function respondToApproval(token: string, action: 'approve' | 'decline'): Promise<void> {
  await axios.post(`${API_URL}/api/legal-approval/${token}/respond`, { action })
}
