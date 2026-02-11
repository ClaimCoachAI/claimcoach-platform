import { StepProps } from './types'
import type { Claim } from '../../types/claim'

interface Step1WelcomeProps extends StepProps {
  claim: Claim
}

export default function Step1Welcome({ claim, onNext, submitting }: Step1WelcomeProps) {
  const contractorName = claim.contractor_name || 'there'
  const lossTypeLabel = claim.loss_type === 'water' ? 'Water Damage' : 'Hail Damage'

  // Format incident date
  const incidentDate = new Date(claim.incident_date).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <div className="min-h-[calc(100vh-200px)] px-4 py-8 pb-24">
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Warm Greeting */}
        <div className="text-center space-y-3 animate-fade-in">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-teal/20 to-teal/10 mb-4">
            <svg
              className="w-8 h-8 text-teal"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>

          <h1 className="text-4xl font-display font-bold text-navy">
            Hi {contractorName}! 👋
          </h1>

          <p className="text-lg text-slate leading-relaxed max-w-md mx-auto">
            Thanks for helping with this assessment. Let's walk through it together.
          </p>
        </div>

        {/* Claim Context Card */}
        <div className="glass-card-strong rounded-3xl p-6 space-y-4 animate-slide-up delay-100">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-navy/10 to-navy/5 flex items-center justify-center">
              <svg
                className="w-5 h-5 text-navy"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-navy/60 mb-1">Property</p>
              <p className="text-base font-semibold text-navy break-words">
                {claim.property?.legal_address || 'Address not available'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-2">
            <div className="space-y-1">
              <p className="text-xs font-medium text-navy/60">Loss Type</p>
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal/10">
                <svg
                  className="w-4 h-4 text-teal"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <circle cx="10" cy="10" r="3" />
                </svg>
                <span className="text-sm font-semibold text-teal">{lossTypeLabel}</span>
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-xs font-medium text-navy/60">Incident Date</p>
              <p className="text-sm font-semibold text-navy">{incidentDate}</p>
            </div>
          </div>
        </div>

        {/* Time Estimate & Instructions */}
        <div className="space-y-4 animate-slide-up delay-200">
          <div className="glass-card rounded-2xl p-5 border-l-4 border-teal">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                <svg
                  className="w-5 h-5 text-teal"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-navy mb-1">What to Expect</h3>
                <p className="text-sm text-slate leading-relaxed">
                  We'll guide you through assessing the property damage step-by-step.
                  This should take <span className="font-semibold text-navy">10-15 minutes</span>.
                </p>
              </div>
            </div>
          </div>

          {/* Preparation Checklist */}
          <div className="glass-card rounded-2xl p-5">
            <h3 className="text-sm font-bold text-navy mb-4 flex items-center gap-2">
              <svg
                className="w-5 h-5 text-teal"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                />
              </svg>
              Have Ready
            </h3>
            <div className="space-y-3">
              {[
                { icon: '📏', text: 'Measuring tape for dimensions' },
                { icon: '📸', text: 'Camera for damage photos' },
                { icon: '📝', text: 'Notepad for observations' },
              ].map((item, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r from-slate/5 to-transparent hover:from-teal/5 transition-colors"
                >
                  <span className="text-2xl">{item.icon}</span>
                  <span className="text-sm text-navy">{item.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* CTA Button */}
        <div className="animate-slide-up delay-300">
          <button
            type="button"
            onClick={() => onNext()}
            disabled={submitting}
            className="w-full btn-primary py-5 px-6 rounded-2xl text-lg font-bold shadow-xl hover:shadow-2xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden group"
          >
            {/* Button shine effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-700" />

            <span className="relative flex items-center justify-center gap-2">
              {submitting ? (
                <>
                  <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Loading...
                </>
              ) : (
                <>
                  Let's Get Started
                  <svg
                    className="w-5 h-5 group-hover:translate-x-1 transition-transform"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={2.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M13 7l5 5m0 0l-5 5m5-5H6"
                    />
                  </svg>
                </>
              )}
            </span>
          </button>

          <p className="text-center text-xs text-slate/60 mt-4">
            Your progress is saved automatically as you go 💾
          </p>
        </div>
      </div>
    </div>
  )
}
