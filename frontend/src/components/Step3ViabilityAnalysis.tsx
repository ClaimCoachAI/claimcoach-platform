import { useState, useCallback, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api, { generateIndustryEstimate, analyzeClaimViability, getAuditReport } from '../lib/api'
import type { Claim, ViabilityAnalysis } from '../types/claim'

interface ScopeSheet {
  id: string
  submitted_at: string | null
}

interface Step3ViabilityAnalysisProps {
  claim: Claim
  scopeSheet: ScopeSheet | null
}

type Phase = 'idle' | 'reading' | 'estimating' | 'analyzing' | 'complete' | 'error'

const PHASES = [
  { id: 'reading'    as Phase, label: 'Reading scope sheet',          sub: 'Parsing damage areas & dimensions'        },
  { id: 'estimating' as Phase, label: 'Building ClaimCoach estimate',  sub: 'Industry-standard pricing at 2026 rates'  },
  { id: 'analyzing'  as Phase, label: 'Running viability analysis',    sub: 'Evaluating policy & financial strength'   },
]

// ─── Plain-language badge ────────────────────────────────────────────────────

function PlainBadge({ label, status }: {
  label: string
  status: 'good' | 'caution' | 'risk'
}) {
  const cfg = {
    good:    { bg: 'rgba(13,148,136,0.07)',  border: 'rgba(13,148,136,0.2)',  icon: '✓', iconBg: '#0d9488', text: '#0f766e' },
    caution: { bg: 'rgba(245,158,11,0.07)',  border: 'rgba(245,158,11,0.22)', icon: '!', iconBg: '#f59e0b', text: '#92400e' },
    risk:    { bg: 'rgba(239,68,68,0.06)',   border: 'rgba(239,68,68,0.18)',  icon: '✕', iconBg: '#ef4444', text: '#991b1b' },
  }[status]

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '8px 12px',
      background: cfg.bg,
      border: `1px solid ${cfg.border}`,
      borderRadius: '8px',
      flex: 1,
    }}>
      <div style={{
        width: '18px', height: '18px',
        borderRadius: '50%',
        background: cfg.iconBg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '9px', fontWeight: '800', color: '#fff', flexShrink: 0,
      }}>
        {cfg.icon}
      </div>
      <span style={{ fontSize: '12px', fontWeight: '500', color: cfg.text, lineHeight: '1.35' }}>
        {label}
      </span>
    </div>
  )
}

// ─── Verdict card ────────────────────────────────────────────────────────────

function VerdictCard({ analysis, deductibleValue, onContinue, onReanalyze, isPending, readOnly }: {
  analysis: ViabilityAnalysis
  deductibleValue: number
  onContinue: () => void
  onReanalyze: () => void
  isPending: boolean
  readOnly: boolean
}) {
  const { recommendation, net_estimated_recovery, coverage_score, economics_score,
          top_risks, required_next_steps, plain_english_summary } = analysis

  const isPursue     = recommendation === 'PURSUE'
  const isConditions = recommendation === 'PURSUE_WITH_CONDITIONS'
  const isNo         = recommendation === 'DO_NOT_PURSUE'

  const accent       = isPursue ? '#0d9488' : isConditions ? '#f59e0b' : '#ef4444'
  const accentBg     = isPursue ? 'rgba(13,148,136,0.05)' : isConditions ? 'rgba(245,158,11,0.05)' : 'rgba(239,68,68,0.04)'
  const accentBorder = isPursue ? 'rgba(13,148,136,0.16)' : isConditions ? 'rgba(245,158,11,0.2)' : 'rgba(239,68,68,0.16)'

  const verdictLabel = isPursue ? 'Recommended to File' : isConditions ? 'Proceed with Caution' : 'Not Recommended'
  const verdictIcon  = isPursue ? '✓' : isConditions ? '!' : '✕'

  // Compute ClaimCoach estimate from the net recovery + deductible
  const claimcoachEstimate = net_estimated_recovery + deductibleValue

  // Translate scores to plain badges
  const coverageStatus: 'good' | 'caution' | 'risk' =
    coverage_score >= 70 ? 'good' : coverage_score >= 40 ? 'caution' : 'risk'
  const coverageLabel =
    coverage_score >= 70 ? 'Policy fully covers this' :
    coverage_score >= 40 ? 'Some coverage risks to review' :
    'Policy may not cover this'

  const economicsStatus: 'good' | 'caution' | 'risk' =
    economics_score >= 70 ? 'good' : economics_score >= 40 ? 'caution' : 'risk'
  const economicsLabel =
    economics_score >= 70 ? 'Financially worth filing' :
    economics_score >= 40 ? 'Borderline — proceed carefully' :
    'May not be worth the cost'

  const fmt = (n: number) => '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>

      {/* Main verdict card */}
      <div style={{
        position: 'relative',
        borderRadius: '12px',
        background: accentBg,
        border: `1px solid ${accentBorder}`,
        overflow: 'hidden',
      }}>
        {/* Top accent stripe */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: accent }} />

        {/* Verdict header */}
        <div style={{ padding: '16px 18px 14px', borderBottom: `1px solid ${accentBorder}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
            <div style={{
              width: '26px', height: '26px', borderRadius: '50%',
              background: accent,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '11px', fontWeight: '800', color: '#fff', flexShrink: 0,
            }}>
              {verdictIcon}
            </div>
            <div>
              <div style={{ fontSize: '13px', fontWeight: '700', color: accent, letterSpacing: '0.01em' }}>
                {verdictLabel}
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '1px' }}>
                Based on your scope sheet and policy
              </div>
            </div>
          </div>
        </div>

        {/* 3-column dollar breakdown */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          borderBottom: `1px solid ${accentBorder}`,
        }}>
          {[
            { label: 'ClaimCoach Estimate', value: fmt(claimcoachEstimate), sub: 'Total repair cost', accent: false },
            { label: 'Your Deductible',     value: fmt(deductibleValue),    sub: 'Your out-of-pocket', accent: false },
            { label: 'Potential Recovery',  value: net_estimated_recovery < 0 ? '−' + fmt(net_estimated_recovery) : fmt(net_estimated_recovery), sub: 'What you could receive', accent: true },
          ].map((col, i) => (
            <div key={i} style={{
              padding: '14px 16px',
              borderRight: i < 2 ? `1px solid ${accentBorder}` : undefined,
              background: col.accent ? (isPursue ? 'rgba(13,148,136,0.05)' : isConditions ? 'rgba(245,158,11,0.05)' : 'rgba(239,68,68,0.04)') : 'transparent',
            }}>
              <div style={{ fontSize: '10px', fontWeight: '600', letterSpacing: '0.05em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: '4px' }}>
                {col.label}
              </div>
              <div style={{
                fontSize: '20px',
                fontWeight: '800',
                fontFamily: "'Work Sans', sans-serif",
                letterSpacing: '-0.02em',
                color: col.accent ? accent : '#0f172a',
                lineHeight: 1,
              }}>
                {col.value}
              </div>
              <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '3px' }}>
                {col.sub}
              </div>
            </div>
          ))}
        </div>

        {/* Plain-language assessment badges */}
        <div style={{ padding: '12px 16px', display: 'flex', gap: '8px' }}>
          <PlainBadge label={coverageLabel}   status={coverageStatus}   />
          <PlainBadge label={economicsLabel}  status={economicsStatus}  />
        </div>

        {/* Summary */}
        <div style={{ padding: '0 16px 16px' }}>
          <p style={{ margin: 0, fontSize: '13px', lineHeight: '1.6', color: '#475569' }}>
            {plain_english_summary}
          </p>
        </div>
      </div>

      {/* Conditions detail block */}
      {isConditions && required_next_steps.length > 0 && (
        <div style={{
          padding: '13px 16px',
          background: 'rgba(245,158,11,0.04)',
          border: '1px solid rgba(245,158,11,0.18)',
          borderLeft: '3px solid #f59e0b',
          borderRadius: '10px',
        }}>
          <div style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '0.07em', textTransform: 'uppercase', color: '#b45309', marginBottom: '8px' }}>
            Steps to take before filing
          </div>
          <ol style={{ margin: 0, padding: '0 0 0 16px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {required_next_steps.map((step, i) => (
              <li key={i} style={{ fontSize: '12px', color: '#64748b', lineHeight: '1.5' }}>{step}</li>
            ))}
          </ol>
        </div>
      )}

      {/* Risk factors block */}
      {isNo && top_risks.length > 0 && (
        <div style={{
          padding: '13px 16px',
          background: 'rgba(239,68,68,0.04)',
          border: '1px solid rgba(239,68,68,0.15)',
          borderLeft: '3px solid #ef4444',
          borderRadius: '10px',
        }}>
          <div style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '0.07em', textTransform: 'uppercase', color: '#dc2626', marginBottom: '8px' }}>
            Why we don't recommend filing
          </div>
          <ul style={{ margin: 0, padding: '0 0 0 16px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {top_risks.map((risk, i) => (
              <li key={i} style={{ fontSize: '12px', color: '#64748b', lineHeight: '1.5' }}>{risk}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Actions — hidden once step is complete */}
      {!readOnly && (
        <div style={{ display: 'flex', gap: '8px' }}>
          {(isPursue || isConditions) && (
            <button
              onClick={onContinue}
              disabled={isPending}
              style={{
                flex: 1,
                padding: '12px 16px',
                borderRadius: '10px',
                border: 'none',
                background: isPursue
                  ? 'linear-gradient(135deg, #0d9488 0%, #14b8a6 100%)'
                  : 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)',
                color: '#fff',
                fontSize: '13px',
                fontWeight: '600',
                fontFamily: "'Work Sans', sans-serif",
                cursor: isPending ? 'not-allowed' : 'pointer',
                opacity: isPending ? 0.7 : 1,
                boxShadow: isPursue
                  ? '0 2px 8px rgba(13,148,136,0.25)'
                  : '0 2px 8px rgba(245,158,11,0.2)',
                letterSpacing: '0.01em',
              }}
            >
              {isPending ? 'Saving…' : 'Continue to Next Step →'}
            </button>
          )}
          {isNo && (
            <button
              onClick={onContinue}
              disabled={isPending}
              style={{
                flex: 1,
                padding: '12px 16px',
                borderRadius: '10px',
                border: '1.5px solid rgba(148,163,184,0.35)',
                background: 'transparent',
                color: '#64748b',
                fontSize: '13px',
                fontWeight: '500',
                cursor: isPending ? 'not-allowed' : 'pointer',
              }}
            >
              {isPending ? 'Saving…' : 'Archive Claim'}
            </button>
          )}
          <button
            onClick={onReanalyze}
            disabled={isPending}
            style={{
              padding: '12px 14px',
              borderRadius: '10px',
              border: '1.5px solid rgba(148,163,184,0.35)',
              background: 'transparent',
              color: '#94a3b8',
              fontSize: '12px',
              fontWeight: '500',
              cursor: isPending ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            ↺ Re-analyze
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Progress timeline ────────────────────────────────────────────────────────

function ProgressTimeline({ currentPhase }: { currentPhase: Phase }) {
  const activeIdx = PHASES.findIndex(p => p.id === currentPhase)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
      {PHASES.map((phase, idx) => {
        const isDone   = activeIdx > idx
        const isActive = activeIdx === idx

        return (
          <div key={phase.id} style={{ display: 'flex', gap: '12px', position: 'relative' }}>
            {idx < PHASES.length - 1 && (
              <div style={{
                position: 'absolute', left: '9px', top: '22px',
                width: '2px', height: '30px',
                background: isDone ? '#0d9488' : 'rgba(148,163,184,0.2)',
                transition: 'background 0.4s ease',
              }} />
            )}
            <div style={{ flexShrink: 0, paddingTop: '1px' }}>
              {isDone ? (
                <div style={{
                  width: '20px', height: '20px', borderRadius: '50%',
                  background: '#0d9488',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '10px', fontWeight: '800', color: '#fff',
                }}>✓</div>
              ) : isActive ? (
                <div style={{
                  width: '20px', height: '20px', borderRadius: '50%',
                  border: '2px solid #0d9488',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  animation: 'va-pulse-ring 1.4s cubic-bezier(0.215,0.61,0.355,1) infinite',
                }}>
                  <div style={{
                    width: '7px', height: '7px', borderRadius: '50%',
                    background: '#0d9488',
                    animation: 'va-pulse-dot 1.4s ease infinite',
                  }} />
                </div>
              ) : (
                <div style={{
                  width: '20px', height: '20px', borderRadius: '50%',
                  border: '2px solid rgba(148,163,184,0.25)',
                }} />
              )}
            </div>
            <div style={{ paddingBottom: '24px' }}>
              <div style={{
                fontSize: '13px',
                fontWeight: isActive ? '600' : '400',
                color: isDone ? '#0d9488' : isActive ? '#0f172a' : '#94a3b8',
                lineHeight: '20px',
                transition: 'color 0.3s',
              }}>
                {phase.label}
              </div>
              <div style={{ fontSize: '11px', color: isActive ? '#64748b' : '#cbd5e1', transition: 'color 0.3s' }}>
                {phase.sub}
              </div>
            </div>
          </div>
        )
      })}
      <style>{`
        @keyframes va-pulse-ring {
          0%   { box-shadow: 0 0 0 0 rgba(13,148,136,0.3); }
          70%  { box-shadow: 0 0 0 7px rgba(13,148,136,0); }
          100% { box-shadow: 0 0 0 0 rgba(13,148,136,0); }
        }
        @keyframes va-pulse-dot {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.35; }
        }
      `}</style>
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function Step3ViabilityAnalysis({ claim, scopeSheet }: Step3ViabilityAnalysisProps) {
  const queryClient = useQueryClient()
  const [phase, setPhase]       = useState<Phase>('idle')
  const [analysis, setAnalysis] = useState<ViabilityAnalysis | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const scopeSubmitted  = !!scopeSheet?.submitted_at
  const deductibleValue = claim.policy?.deductible_value ?? 0

  const runAnalysis = useCallback(async () => {
    setErrorMsg(null)
    setAnalysis(null)
    try {
      setPhase('reading')
      await new Promise(r => setTimeout(r, 700))
      setPhase('estimating')
      await generateIndustryEstimate(claim.id)
      setPhase('analyzing')
      const result: ViabilityAnalysis = await analyzeClaimViability(claim.id)
      setAnalysis(result)
      setPhase('complete')
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Analysis failed. Please try again.'
      setErrorMsg(msg)
      setPhase('error')
    }
  }, [claim.id])

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!analysis) throw new Error('No analysis result')
      const worthFiling =
        analysis.recommendation === 'PURSUE' || analysis.recommendation === 'PURSUE_WITH_CONDITIONS'
          ? 'worth_filing'
          : 'not_worth_filing'
      await api.patch(`/api/claims/${claim.id}/step`, {
        current_step: 4,
        steps_completed: [1, 2, 3],
        deductible_comparison_result: worthFiling,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['claim', claim.id] })
    },
  })

  // Load persisted viability analysis if step 3 is already complete
  const step3Done = claim.steps_completed?.includes(3) ?? false
  const { data: auditReport } = useQuery({
    queryKey: ['audit-report', claim.id],
    queryFn: () => getAuditReport(claim.id),
    enabled: step3Done && phase === 'idle',
    retry: false,
  })

  useEffect(() => {
    if (!auditReport?.viability_analysis) return
    try {
      const saved: ViabilityAnalysis = JSON.parse(auditReport.viability_analysis)
      setAnalysis(saved)
      setPhase('complete')
    } catch {
      // If parse fails, stay on idle so user can re-analyze
    }
  }, [auditReport])

  // ── No scope sheet ────────────────────────────────────────────────
  if (!scopeSubmitted) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{
          display: 'flex', gap: '0',
          padding: '14px 16px',
          background: 'rgba(241,245,249,0.6)',
          border: '1px solid rgba(148,163,184,0.2)',
          borderRadius: '10px',
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '10px', fontWeight: '600', letterSpacing: '0.06em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: '3px' }}>Deductible</div>
            <div style={{ fontSize: '20px', fontWeight: '800', fontFamily: "'Work Sans', sans-serif", color: '#0f172a', letterSpacing: '-0.01em' }}>
              ${deductibleValue.toLocaleString('en-US', { minimumFractionDigits: 0 })}
            </div>
          </div>
          <div style={{ borderLeft: '1px solid rgba(148,163,184,0.2)', paddingLeft: '16px', flex: 1 }}>
            <div style={{ fontSize: '10px', fontWeight: '600', letterSpacing: '0.06em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: '3px' }}>Loss Type</div>
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#334155', textTransform: 'capitalize' }}>
              {claim.loss_type === 'water' ? '💧 Water' : '🧊 Hail'}
            </div>
          </div>
        </div>
        <div style={{ padding: '24px 20px', border: '1.5px dashed rgba(148,163,184,0.3)', borderRadius: '12px', textAlign: 'center' }}>
          <div style={{ fontSize: '28px', marginBottom: '10px', opacity: 0.5 }}>📋</div>
          <div style={{ fontSize: '14px', fontWeight: '600', color: '#334155', marginBottom: '6px' }}>Waiting for Contractor Scope Sheet</div>
          <div style={{ fontSize: '12px', color: '#94a3b8', lineHeight: '1.6', maxWidth: '280px', margin: '0 auto' }}>
            The AI analysis requires the contractor's damage scope. Send the Magic Link in Step 2 and return here once submitted.
          </div>
        </div>
      </div>
    )
  }

  // ── Loading ───────────────────────────────────────────────────────
  if (phase === 'reading' || phase === 'estimating' || phase === 'analyzing') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{
          padding: '18px 20px',
          background: 'rgba(241,245,249,0.5)',
          border: '1px solid rgba(148,163,184,0.18)',
          borderRadius: '12px',
        }}>
          <div style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#0d9488', marginBottom: '16px' }}>
            AI Analysis Running
          </div>
          <ProgressTimeline currentPhase={phase} />
        </div>
        <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8', textAlign: 'center' }}>
          This usually takes 15–30 seconds
        </p>
      </div>
    )
  }

  // ── Error ─────────────────────────────────────────────────────────
  if (phase === 'error') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{
          padding: '14px 16px',
          background: 'rgba(239,68,68,0.05)',
          border: '1px solid rgba(239,68,68,0.2)',
          borderLeft: '3px solid #ef4444',
          borderRadius: '10px',
        }}>
          <div style={{ fontSize: '12px', fontWeight: '600', color: '#dc2626', marginBottom: '3px' }}>Analysis Failed</div>
          <div style={{ fontSize: '12px', color: '#64748b' }}>{errorMsg}</div>
        </div>
        <button
          onClick={runAnalysis}
          style={{
            padding: '11px', borderRadius: '10px',
            border: '1.5px solid rgba(148,163,184,0.35)',
            background: 'transparent', color: '#64748b',
            fontSize: '13px', fontWeight: '500', cursor: 'pointer',
          }}
        >
          Try Again
        </button>
      </div>
    )
  }

  // ── Result ────────────────────────────────────────────────────────
  if (phase === 'complete' && analysis) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <VerdictCard
          analysis={analysis}
          deductibleValue={deductibleValue}
          onContinue={() => saveMutation.mutate()}
          onReanalyze={() => { setPhase('idle'); setAnalysis(null) }}
          isPending={saveMutation.isPending}
          readOnly={step3Done}
        />
        {saveMutation.isError && (
          <div style={{
            padding: '10px 14px',
            background: 'rgba(239,68,68,0.05)',
            border: '1px solid rgba(239,68,68,0.18)',
            borderRadius: '10px',
            fontSize: '12px', color: '#dc2626',
          }}>
            {(saveMutation.error as any)?.response?.data?.error || 'Failed to save. Please try again.'}
          </div>
        )}
      </div>
    )
  }

  // ── Idle ──────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{
        display: 'flex',
        padding: '14px 16px',
        background: 'rgba(241,245,249,0.6)',
        border: '1px solid rgba(148,163,184,0.2)',
        borderRadius: '10px',
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '10px', fontWeight: '600', letterSpacing: '0.06em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: '3px' }}>Deductible</div>
          <div style={{ fontSize: '20px', fontWeight: '800', fontFamily: "'Work Sans', sans-serif", color: '#0f172a', letterSpacing: '-0.01em' }}>
            ${deductibleValue.toLocaleString('en-US', { minimumFractionDigits: 0 })}
          </div>
        </div>
        <div style={{ borderLeft: '1px solid rgba(148,163,184,0.2)', paddingLeft: '16px', flex: 1 }}>
          <div style={{ fontSize: '10px', fontWeight: '600', letterSpacing: '0.06em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: '3px' }}>Loss Type</div>
          <div style={{ fontSize: '14px', fontWeight: '600', color: '#334155', textTransform: 'capitalize' }}>
            {claim.loss_type === 'water' ? '💧 Water' : '🧊 Hail'}
          </div>
        </div>
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '9px 14px',
        background: 'rgba(13,148,136,0.06)',
        border: '1px solid rgba(13,148,136,0.18)',
        borderRadius: '8px',
      }}>
        <div style={{
          width: '18px', height: '18px', borderRadius: '50%',
          background: '#0d9488',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '10px', fontWeight: '800', color: '#fff', flexShrink: 0,
        }}>✓</div>
        <span style={{ fontSize: '12px', fontWeight: '500', color: '#0d9488' }}>
          Contractor scope sheet received
        </span>
      </div>

      <div>
        <div style={{ fontSize: '11px', fontWeight: '600', letterSpacing: '0.06em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: '8px' }}>
          The AI will
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {[
            'Build a full ClaimCoach estimate from the scope sheet',
            'Check if your policy covers the damage',
            'Calculate how much you could potentially recover',
          ].map((item, i) => (
            <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
              <div style={{
                width: '18px', height: '18px', borderRadius: '50%',
                background: 'rgba(148,163,184,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '10px', fontWeight: '700', color: '#94a3b8',
                flexShrink: 0, marginTop: '1px',
              }}>{i + 1}</div>
              <span style={{ fontSize: '13px', color: '#64748b', lineHeight: '1.45' }}>{item}</span>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={runAnalysis}
        style={{
          width: '100%', padding: '13px 16px',
          borderRadius: '10px', border: 'none',
          background: 'linear-gradient(135deg, #0d9488 0%, #14b8a6 100%)',
          color: '#fff', fontSize: '14px', fontWeight: '600',
          fontFamily: "'Work Sans', sans-serif",
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          boxShadow: '0 2px 10px rgba(13,148,136,0.25)',
          letterSpacing: '0.01em',
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
        </svg>
        Analyze Claim
      </button>

      <p style={{ margin: 0, textAlign: 'center', fontSize: '11px', color: '#94a3b8' }}>
        Takes ~20 seconds · Powered by AI
      </p>
    </div>
  )
}
