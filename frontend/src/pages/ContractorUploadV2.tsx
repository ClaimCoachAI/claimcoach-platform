import { useParams, Navigate } from 'react-router-dom'
import { ContractorWizardV2 } from '../components/contractor-wizard-v2'

export default function ContractorUploadV2() {
  const { token } = useParams<{ token: string }>()
  if (!token) return <Navigate to="/" replace />
  return <ContractorWizardV2 token={token} />
}
