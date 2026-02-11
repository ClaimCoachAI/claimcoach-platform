import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'
import Layout from '../components/Layout'
import ProgressBar from '../components/ProgressBar'
import CompletedStep from '../components/CompletedStep'
import NextStepCard from '../components/NextStepCard'
import { getDamageTypeLabel } from '../lib/stepUtils'
import type { Claim } from '../types/claim'

export default function ClaimHome() {
  const { id } = useParams<{ id: string }>()

  const { data: claim, isLoading } = useQuery({
    queryKey: ['claim', id],
    queryFn: async () => {
      const response = await api.get(`/api/claims/${id}`)
      return response.data.data as Claim
    },
  })

  if (isLoading) {
    return (
      <Layout>
        <div className="flex justify-center items-center py-20">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-teal border-t-transparent"></div>
            <p className="mt-4 text-slate">Loading claim...</p>
          </div>
        </div>
      </Layout>
    )
  }

  if (!claim) {
    return (
      <Layout>
        <div className="text-center py-20">
          <h2 className="text-2xl font-bold text-navy">Claim not found</h2>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold text-navy">
              {getDamageTypeLabel(claim.loss_type)}
            </h1>
            <p className="mt-1 text-slate">
              {claim.property?.property_address || 'Property'}
            </p>
          </div>
        </div>

        {/* Progress Bar */}
        <ProgressBar
          stepsCompleted={claim.steps_completed || []}
          currentStep={claim.current_step || 1}
        />

        {/* Next Step */}
        <NextStepCard stepNumber={claim.current_step || 1} />

        {/* Completed Steps */}
        {claim.steps_completed && claim.steps_completed.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate mb-4">
              Completed Steps ({claim.steps_completed.length})
            </h3>
            <div className="space-y-2">
              {claim.steps_completed.map((stepNum) => (
                <CompletedStep
                  key={stepNum}
                  stepNumber={stepNum as 1 | 2 | 3 | 4 | 5 | 6}
                  claim={claim}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
