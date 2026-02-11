import { useState } from 'react'
import { StepProps } from './types'
import { submitScopeSheet } from '../../lib/api'

interface Step10ReviewProps extends StepProps {
  token: string
}

export default function Step10Review({
  wizardState,
  onBack,
  token,
}: Step10ReviewProps) {
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    setSubmitting(true)
    setError('')

    try {
      // Submit the scope sheet data
      await submitScopeSheet(token, wizardState.wizardData)
      setSubmitted(true)
    } catch (err: any) {
      console.error('Submission error:', err)
      setError(err.response?.data?.error || 'Failed to submit scope sheet. Please try again.')
      setSubmitting(false)
    }
  }

  // Success screen
  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-12">
        <div className="max-w-md w-full text-center animate-scale-in">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-teal/10 mb-6">
            <svg className="w-10 h-10 text-teal" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h2 className="text-3xl font-display font-bold text-navy mb-3">
            Scope Sheet Submitted!
          </h2>

          <p className="text-slate mb-6">
            Thank you for completing the property assessment. Your detailed scope sheet has been submitted successfully.
          </p>

          <div className="glass-card rounded-2xl p-6 space-y-3 text-left">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-teal flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <div className="flex-1">
                <p className="text-sm font-semibold text-navy">What happens next?</p>
                <p className="text-sm text-slate mt-1">
                  The property manager will review your assessment and may contact you if any additional information is needed.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Count sections with data
  const hasPhotos = wizardState.photos.filter(p => p.uploaded).length > 0
  const hasMainRoof = !!(wizardState.wizardData.roof_type || wizardState.wizardData.fascia_lf)
  const hasSecondaryRoof = !!(wizardState.wizardData.roof_other_type || wizardState.wizardData.roof_other_fascia_lf)
  const hasExterior = !!(
    wizardState.wizardData.front_siding_1_replace_sf ||
    wizardState.wizardData.right_siding_1_replace_sf ||
    wizardState.wizardData.back_siding_1_replace_sf ||
    wizardState.wizardData.left_siding_1_replace_sf
  )
  const hasNotes = !!(wizardState.wizardData.notes || wizardState.wizardData.additional_items_main)

  return (
    <div className="min-h-[calc(100vh-200px)] px-4 py-8 pb-32">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="space-y-4 animate-fade-in">
          <button
            onClick={onBack}
            disabled={submitting}
            className="inline-flex items-center gap-2 text-sm font-medium text-navy/60 hover:text-navy transition-colors disabled:opacity-50"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>

          <div>
            <h2 className="text-3xl font-display font-bold text-navy mb-2">
              Review & Submit
            </h2>
            <p className="text-sm text-slate">Review your assessment before submitting</p>
          </div>
        </div>

        {error && (
          <div className="glass-card-strong rounded-2xl p-4 border-2 border-red-200 bg-red-50 animate-slide-down">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Summary Cards */}
        <div className="space-y-4 animate-slide-up delay-100">
          {hasPhotos && (
            <div className="glass-card rounded-2xl p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-teal/10 flex items-center justify-center">
                    <svg className="w-5 h-5 text-teal" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-semibold text-navy">Damage Photos</p>
                    <p className="text-sm text-slate">{wizardState.photos.filter(p => p.uploaded).length} photos uploaded</p>
                  </div>
                </div>
                <svg className="w-5 h-5 text-teal" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
            </div>
          )}

          {hasMainRoof && (
            <div className="glass-card rounded-2xl p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-navy/10 flex items-center justify-center">
                    <svg className="w-5 h-5 text-navy" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-semibold text-navy">Main Roof Assessment</p>
                    <p className="text-sm text-slate">Roof details documented</p>
                  </div>
                </div>
                <svg className="w-5 h-5 text-teal" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
            </div>
          )}

          {hasSecondaryRoof && (
            <div className="glass-card rounded-2xl p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-navy/10 flex items-center justify-center">
                    <svg className="w-5 h-5 text-navy" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-semibold text-navy">Secondary Roof Assessment</p>
                    <p className="text-sm text-slate">Secondary structure documented</p>
                  </div>
                </div>
                <svg className="w-5 h-5 text-teal" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
            </div>
          )}

          {hasExterior && (
            <div className="glass-card rounded-2xl p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-teal/10 flex items-center justify-center">
                    <svg className="w-5 h-5 text-teal" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-semibold text-navy">Exterior Assessments</p>
                    <p className="text-sm text-slate">All sides documented</p>
                  </div>
                </div>
                <svg className="w-5 h-5 text-teal" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
            </div>
          )}

          {hasNotes && (
            <div className="glass-card rounded-2xl p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-navy/10 flex items-center justify-center">
                    <svg className="w-5 h-5 text-navy" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-semibold text-navy">Additional Notes</p>
                    <p className="text-sm text-slate">Extra observations included</p>
                  </div>
                </div>
                <svg className="w-5 h-5 text-teal" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
            </div>
          )}
        </div>

        {/* Info Card */}
        <div className="glass-card rounded-2xl p-5 border-l-4 border-teal animate-slide-up delay-150">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-teal flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-semibold text-navy mb-1">Ready to submit?</p>
              <p className="text-sm text-slate">
                Once submitted, your detailed scope sheet will be sent to the property manager for review. You can still go back to make changes before submitting.
              </p>
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-white via-white to-transparent backdrop-blur-sm">
          <div className="max-w-2xl mx-auto">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full btn-primary py-4 px-6 rounded-2xl text-base font-bold shadow-xl hover:shadow-2xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="flex items-center justify-center gap-2">
                {submitting ? (
                  <>
                    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Submitting...
                  </>
                ) : (
                  <>
                    Submit Scope Sheet
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </>
                )}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
