import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import {
  runPMBrainAnalysis,
  generateDisputeLetter,
  generateOwnerPitch,
  generateIndustryEstimate,
  getAuditReport,
  updateClaimStep,
  parseCarrierEstimate,
  downloadLegalPackage,
} from '../lib/api'
import type { Claim, PMBrainAnalysis, PMBrainStatus } from '../types/claim'

// ─── TYPES ─────────────────────────────────────────────────────────────────

interface CarrierEstimateData {
  id: string
  file_name: string
  parse_status: 'pending' | 'processing' | 'completed' | 'failed'
  parse_error?: string
}

type Phase =
  | 'idle'
  | 'uploading'
  | 'parsing'
  | 'ready'
  | 'analyzing'
  | 'verdict'
  | 'letter_generating'

interface Props {
  claim: Claim
}

// ─── STATUS CONFIG ──────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  PMBrainStatus,
  { bg: string; border: string; icon: string; label: string; textColor: string }
> = {
  CLOSE: {
    bg: '#f0fdf4',
    border: '#bbf7d0',
    icon: '✅',
    label: 'Offer Accepted',
    textColor: '#166534',
  },
  DISPUTE_OFFER: {
    bg: '#fffbeb',
    border: '#fde68a',
    icon: '⚠️',
    label: 'Dispute the Offer',
    textColor: '#92400e',
  },
  LEGAL_REVIEW: {
    bg: '#fef2f2',
    border: '#fecaca',
    icon: '⚖️',
    label: 'Legal Review Needed',
    textColor: '#991b1b',
  },
  NEED_DOCS: {
    bg: '#fffbeb',
    border: '#fef08a',
    icon: '📋',
    label: 'Document Issue',
    textColor: '#713f12',
  },
}

const ANALYSIS_STEPS = [
  { icon: '📄', label: 'Reading carrier estimate' },
  { icon: '📐', label: 'Comparing against your scope' },
  { icon: '⚡', label: 'Identifying pricing gaps' },
  { icon: '🧠', label: 'Determining strategy' },
]

const formatCurrency = (n: number) =>
  n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  })

// ─── ATTORNEY BRIEFING BUILDER (Legal Referral One-Pager) ───────────────────

function buildAttorneyBriefing(claim: import('../types/claim').Claim, pmBrain: import('../types/claim').PMBrainAnalysis | null): string {
  if (!pmBrain) return ''

  const address    = claim.property?.legal_address   || 'N/A'
  const carrier    = claim.policy?.carrier_name      || 'N/A'
  const policyNum  = claim.policy?.policy_number     || 'N/A'
  const claimNum   = claim.claim_number              || 'N/A'
  const lossDate   = new Date(claim.incident_date).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  })
  const lossType   = claim.loss_type.charAt(0).toUpperCase() + claim.loss_type.slice(1)
  const fc         = formatCurrency

  // ── Build the neutral Executive Summary from available data ──────────────
  const topReasons = pmBrain.top_delta_drivers.slice(0, 2).map(d => d.line_item).join(' and ')
  const hasDisputes = pmBrain.coverage_disputes.length > 0
  let execSummary = `Carrier underpaid by ${fc(pmBrain.total_delta)}`
  if (topReasons) execSummary += `, citing discrepancies in ${topReasons}`
  if (hasDisputes) execSummary += `, with ${pmBrain.coverage_disputes.length} item(s) disputed or denied`
  execSummary += `. Property owner has authorized engagement of legal counsel to pursue recovery of covered damages.`

  const hr = '─'.repeat(60)

  let t = `LEGAL REFERRAL ONE-PAGER\n`
  t += `${hr}\n\n`

  // ── Section 1: Claim Snapshot ────────────────────────────────────────────
  t += `1. CLAIM SNAPSHOT\n`
  t += `   Claim ID:        ${claimNum}\n`
  t += `   Property:        ${address}\n`
  t += `   Loss Type:       ${lossType}\n`
  t += `   Loss Date:       ${lossDate}\n`
  t += `   Carrier:         ${carrier}\n`
  t += `   Policy Number:   ${policyNum}\n\n`

  // ── Section 2: Executive Summary ─────────────────────────────────────────
  t += `2. EXECUTIVE SUMMARY\n`
  t += `   ${execSummary}\n\n`

  // ── Section 3: Financial Summary ─────────────────────────────────────────
  t += `3. FINANCIAL SUMMARY\n`
  t += `   ClaimCoach Estimate (Net Position):             ${fc(pmBrain.total_contractor_estimate)}\n`
  t += `   Carrier Net Position (carrier offer):           ${fc(pmBrain.total_carrier_estimate)}\n`
  t += `   Delta (underpayment):                           ${fc(pmBrain.total_delta)}\n\n`

  // ── Section 4: Key Dispute Issues & Drivers ──────────────────────────────
  t += `4. KEY DISPUTE ISSUES & DRIVERS\n`
  if (pmBrain.top_delta_drivers.length > 0) {
    pmBrain.top_delta_drivers.forEach((d, i) => {
      t += `   ${i + 1}. ${d.line_item}\n`
      t += `      Dollar Impact: ${fc(d.delta)} (carrier ${fc(d.carrier_price)} vs. required ${fc(d.contractor_price)})\n`
      t += `      Issue: ${d.reason}\n`
    })
  } else {
    t += `   No individual line-item drivers identified.\n`
  }
  if (pmBrain.coverage_disputes.length > 0) {
    t += `\n   Coverage Disputes:\n`
    pmBrain.coverage_disputes.forEach(cd => {
      t += `   • ${cd.item} [${cd.status.toUpperCase()}]: ${cd.contractor_position}\n`
    })
  }
  t += '\n'

  // ── Section 5: Requested Legal Outcome ───────────────────────────────────
  t += `5. REQUESTED LEGAL OUTCOME\n`
  t += `   Primary goal: Recover full covered damages and resolve claim.\n\n`

  // ── Section 6: Attachments Index ─────────────────────────────────────────
  t += `6. ATTACHMENTS INDEX\n`
  t += `   Please attach the following to your email to counsel:\n`
  t += `   [ ] Carrier Estimate (PDF)\n`
  t += `   [ ] Carrier Position Letter (if available)\n`
  t += `   [ ] ClaimCoach Estimate / Scope Sheet\n`
  t += `   [ ] Policy Declarations Page\n`

  return t
}

// ─── MAIN COMPONENT ─────────────────────────────────────────────────────────

export default function Step6AdjudicationEngine({ claim }: Props) {
  const queryClient = useQueryClient()
  const [phase, setPhase] = useState<Phase>('idle')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [pmBrain, setPmBrain] = useState<PMBrainAnalysis | null>(null)
  const [auditReportId, setAuditReportId] = useState<string | null>(null)
  const [disputeLetter, setDisputeLetter] = useState<string | null>(null)
  const [letterCopied, setLetterCopied] = useState(false)
  const [deltaDriversOpen, setDeltaDriversOpen] = useState(false)
  const [disputesOpen, setDisputesOpen] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [analysisStep, setAnalysisStep] = useState(0)
  const [isPolling, setIsPolling] = useState(false)

  // Owner pitch (LEGAL_REVIEW)
  const [ownerPitch, setOwnerPitch] = useState<string | null>(null)
  const [pitchCopied, setPitchCopied] = useState(false)
  const [pitchAcknowledged, setPitchAcknowledged] = useState(false)
  const [ownerApproved, setOwnerApproved] = useState(false)
  const [lawyerBriefingCopied, setLawyerBriefingCopied] = useState(false)
  const [attorneyContacted, setAttorneyContacted] = useState(false)
  const [isDownloadingZip, setIsDownloadingZip] = useState(false)
  const [zipDownloadError, setZipDownloadError] = useState<string | null>(null)

  const step6Done = claim.steps_completed?.includes(6) ?? false

  // ── Carrier estimates (with optional polling) ────────────────────────────
  const { data: carrierEstimates } = useQuery<CarrierEstimateData[]>({
    queryKey: ['carrier-estimates', claim.id],
    queryFn: async () => {
      try {
        const res = await api.get(`/api/claims/${claim.id}/carrier-estimate`)
        return res.data.data || []
      } catch {
        return []
      }
    },
    refetchInterval: isPolling ? 3000 : false,
    enabled: !!claim.id,
  })

  // ── Audit report (to restore persisted verdict) ──────────────────────────
  const { data: savedAuditReport } = useQuery({
    queryKey: ['audit-report', claim.id],
    queryFn: () => getAuditReport(claim.id),
    retry: false,
    enabled: !!claim.id,
  })

  const latestEstimate = carrierEstimates?.[0]
  const isParsed = latestEstimate?.parse_status === 'completed'
  const parseFailed = latestEstimate?.parse_status === 'failed'

  // Restore persisted analysis on mount
  useEffect(() => {
    if (!savedAuditReport?.pm_brain_analysis) return
    // Also restore when phase is 'ready' (race: carrierEstimates may resolve before savedAuditReport)
    if (phase !== 'idle' && phase !== 'ready') return
    try {
      const saved: PMBrainAnalysis = JSON.parse(savedAuditReport.pm_brain_analysis)
      setPmBrain(saved)
      setAuditReportId(savedAuditReport.id)
      if (savedAuditReport.dispute_letter) setDisputeLetter(savedAuditReport.dispute_letter)
      if (savedAuditReport.owner_pitch) setOwnerPitch(savedAuditReport.owner_pitch)
      setPhase('verdict')
    } catch { /* malformed JSON — stay on idle */ }
  }, [savedAuditReport, phase])

  // Fallback polling: stop when parse completes or fails (handles edge cases)
  useEffect(() => {
    if (!isPolling) return
    if (isParsed) {
      setIsPolling(false)
      setPhase('ready')
    }
    if (parseFailed) {
      setIsPolling(false)
      const detail = latestEstimate?.parse_error
      setErrorMsg(detail ? `Parse failed: ${detail}` : 'Failed to parse PDF. Please try again.')
      setPhase('idle')
    }
  }, [isPolling, isParsed, parseFailed, latestEstimate?.parse_error])

  // If already parsed but we're still idle, skip to ready
  useEffect(() => {
    if (phase === 'idle' && isParsed && !savedAuditReport?.pm_brain_analysis) {
      setPhase('ready')
    }
  }, [phase, isParsed, savedAuditReport])

  // Animate analysis steps
  useEffect(() => {
    if (phase !== 'analyzing') return
    setAnalysisStep(0)
    const timers = [800, 3000, 6000, 9000].map((delay, i) =>
      setTimeout(() => setAnalysisStep(i + 1), delay)
    )
    return () => timers.forEach(clearTimeout)
  }, [phase])

  // ── Upload + parse mutation ──────────────────────────────────────────────
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      setPhase('uploading')
      setErrorMsg(null)
      const urlRes = await api.post(`/api/claims/${claim.id}/carrier-estimate/upload-url`, {
        file_name: file.name,
        file_size: file.size,
        mime_type: 'application/pdf',
      })
      const { upload_url, estimate_id } = urlRes.data.data
      const uploadResponse = await fetch(upload_url, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': 'application/pdf' },
      })
      if (!uploadResponse.ok) {
        throw new Error(`Failed to upload file to storage (${uploadResponse.status})`)
      }
      await api.post(`/api/claims/${claim.id}/carrier-estimate/${estimate_id}/confirm`)
      // Parse is now synchronous — awaiting it means the PDF is fully parsed when this resolves.
      // If the parse call throws (422), onError handles it.
      await parseCarrierEstimate(claim.id, estimate_id)
      return estimate_id
    },
    onSuccess: () => {
      setSelectedFile(null)
      // Parse completed synchronously — go straight to ready, no polling needed.
      queryClient.invalidateQueries({ queryKey: ['carrier-estimates', claim.id] })
      setPhase('ready')
    },
    onError: (err: unknown) => {
      const msg =
        (err as any)?.response?.data?.error ||
        (err instanceof Error ? err.message : null) ||
        'Failed to upload PDF. Please try again.'
      setErrorMsg(msg)
      setPhase('idle')
    },
  })

  // ── Retry parse mutation (re-parse existing upload, no re-upload needed) ──
  const retryParseMutation = useMutation({
    mutationFn: async (estimateId: string) => {
      setPhase('parsing')
      setErrorMsg(null)
      await parseCarrierEstimate(claim.id, estimateId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['carrier-estimates', claim.id] })
      setPhase('ready')
    },
    onError: (err: unknown) => {
      const msg =
        (err as any)?.response?.data?.error ||
        (err instanceof Error ? err.message : null) ||
        'Failed to parse PDF. Please try again.'
      setErrorMsg(msg)
      setPhase('idle')
    },
  })

  // ── Analyze mutation (generate estimate → pm-brain) ──────────────────────
  const analyzeMutation = useMutation({
    mutationFn: async () => {
      setPhase('analyzing')
      setErrorMsg(null)
      const { audit_report_id } = await generateIndustryEstimate(claim.id)
      setAuditReportId(audit_report_id)
      const analysis = await runPMBrainAnalysis(claim.id, audit_report_id)
      return { analysis, audit_report_id }
    },
    onSuccess: ({ analysis, audit_report_id }) => {
      setPmBrain(analysis)
      setAuditReportId(audit_report_id)
      setPhase('verdict')
      queryClient.invalidateQueries({ queryKey: ['audit-report', claim.id] })
    },
    onError: (err: unknown) => {
      const axiosError = err as any
      const serverMsg = axiosError?.response?.data?.error
      const status = axiosError?.response?.status
      let msg = serverMsg || (err as Error)?.message || 'Analysis failed. Please try again.'
      if (!serverMsg && (status === 503 || status === 504 || !status)) {
        msg = 'Analysis timed out — the AI took too long to respond. Please try again.'
      }
      setErrorMsg(msg)
      setPhase('ready')
    },
  })

  // ── Dispute letter mutation ───────────────────────────────────────────────
  const letterMutation = useMutation({
    mutationFn: async () => {
      const reportId = auditReportId || savedAuditReport?.id
      if (!reportId) throw new Error('No audit report found')
      setPhase('letter_generating')
      return generateDisputeLetter(claim.id, reportId)
    },
    onSuccess: (letter) => {
      setDisputeLetter(letter)
      setPhase('verdict')
      queryClient.invalidateQueries({ queryKey: ['audit-report', claim.id] })
    },
    onError: (err: unknown) => {
      const msg = (err as any)?.response?.data?.error || 'Failed to generate letter. Please try again.'
      setErrorMsg(msg)
      setPhase('verdict')
    },
  })

  // ── Owner pitch mutation (LEGAL_REVIEW) ───────────────────────────────────
  const pitchMutation = useMutation({
    mutationFn: async () => {
      const reportId = auditReportId || savedAuditReport?.id
      if (!reportId) throw new Error('No audit report found')
      return generateOwnerPitch(claim.id, reportId)
    },
    onSuccess: (pitch) => {
      setOwnerPitch(pitch)
      queryClient.invalidateQueries({ queryKey: ['audit-report', claim.id] })
    },
    onError: (err: unknown) => { console.error('[pitchMutation] error:', err) },
  })

  // ── Complete step mutation ────────────────────────────────────────────────
  const completeMutation = useMutation({
    mutationFn: () =>
      updateClaimStep(claim.id, {
        current_step: 7,
        steps_completed: [...new Set([...(claim.steps_completed ?? []), 6])],
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['claim', claim.id] }),
  })

  // ─── UPLOAD PHASE ─────────────────────────────────────────────────────────
  if (phase === 'idle' || phase === 'uploading') {
    return (
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '8px 0 24px' }}>
        <h2
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: '#0f172a',
            marginBottom: 6,
          }}
        >
          Upload Carrier's Offer
        </h2>
        <p style={{ color: '#64748b', marginBottom: 20, fontSize: 14, lineHeight: 1.5 }}>
          Upload the PDF your insurance carrier sent — their line-item estimate or Explanation
          of Benefits.
        </p>

        <label
          style={{
            display: 'block',
            border: `2px dashed ${selectedFile ? '#0d9488' : '#cbd5e1'}`,
            borderRadius: 12,
            padding: '32px 24px',
            textAlign: 'center',
            cursor: 'pointer',
            background: selectedFile ? '#f0fdfa' : '#f8fafc',
            transition: 'all 0.15s',
          }}
        >
          <input
            type="file"
            accept=".pdf,application/pdf"
            style={{ display: 'none' }}
            onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
          />
          {selectedFile ? (
            <div>
              <div style={{ fontSize: 28, marginBottom: 8 }}>📄</div>
              <div
                style={{ color: '#0d9488', fontWeight: 700, fontSize: 14, marginBottom: 4 }}
              >
                ✓ {selectedFile.name}
              </div>
              <div style={{ color: '#94a3b8', fontSize: 12 }}>Click to choose a different file</div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 36, marginBottom: 8 }}>📄</div>
              <div style={{ color: '#334155', fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
                Click to select carrier's PDF estimate
              </div>
              <div style={{ color: '#94a3b8', fontSize: 12 }}>PDF files only</div>
            </div>
          )}
        </label>

        {selectedFile && (
          <button
            onClick={() => uploadMutation.mutate(selectedFile)}
            disabled={uploadMutation.isPending}
            style={{
              marginTop: 16,
              width: '100%',
              padding: '13px 24px',
              background: uploadMutation.isPending ? '#94a3b8' : '#0d9488',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontWeight: 700,
              cursor: uploadMutation.isPending ? 'not-allowed' : 'pointer',
              fontSize: 15,
            }}
          >
            {uploadMutation.isPending ? 'Uploading…' : 'Upload & Parse PDF'}
          </button>
        )}

        {errorMsg && (
          <div
            style={{
              marginTop: 12,
              padding: '10px 14px',
              background: '#fef2f2',
              borderRadius: 8,
              color: '#dc2626',
              fontSize: 14,
            }}
          >
            {errorMsg}
            {parseFailed && latestEstimate && (
              <button
                type="button"
                onClick={() => retryParseMutation.mutate(latestEstimate.id)}
                disabled={retryParseMutation.isPending}
                style={{
                  display: 'block',
                  marginTop: 10,
                  padding: '8px 16px',
                  background: '#dc2626',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  cursor: retryParseMutation.isPending ? 'not-allowed' : 'pointer',
                  fontWeight: 600,
                  fontSize: 13,
                }}
              >
                {retryParseMutation.isPending ? 'Retrying…' : 'Retry Parsing (same file)'}
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  // ─── PARSING PHASE ────────────────────────────────────────────────────────
  if (phase === 'parsing') {
    return (
      <div style={{ padding: '48px 0', textAlign: 'center' }}>
        <div
          style={{
            width: 56,
            height: 56,
            margin: '0 auto 20px',
            borderRadius: '50%',
            background: '#f0fdfa',
            border: '3px solid #0d9488',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 24,
            animation: 'spin 1.5s linear infinite',
          }}
        >
          ⏳
        </div>
        <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 17, marginBottom: 8 }}>
          Reading carrier's document…
        </div>
        <div style={{ color: '#64748b', fontSize: 13 }}>
          Extracting line items from PDF — about 20–30 seconds
        </div>
        {parseFailed && (
          <div style={{ marginTop: 20 }}>
            <div
              style={{
                padding: '12px 16px',
                background: '#fef2f2',
                borderRadius: 8,
                color: '#dc2626',
                fontSize: 14,
                marginBottom: 12,
              }}
            >
              Failed to parse PDF. Please try uploading a different file.
            </div>
            <button
              onClick={() => setPhase('idle')}
              style={{
                padding: '10px 20px',
                background: '#f1f5f9',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                fontWeight: 600,
                color: '#334155',
              }}
            >
              Try Again
            </button>
          </div>
        )}
      </div>
    )
  }

  // ─── READY PHASE ─────────────────────────────────────────────────────────
  if (phase === 'ready') {
    return (
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '8px 0 24px' }}>
        <div
          style={{
            padding: '14px 18px',
            background: '#f0fdf4',
            borderRadius: 10,
            border: '1px solid #bbf7d0',
            marginBottom: 24,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span style={{ fontSize: 20 }}>✓</span>
          <div>
            <div style={{ color: '#166534', fontWeight: 700, fontSize: 14 }}>
              {latestEstimate?.file_name ?? 'Carrier estimate'} — parsed
            </div>
            <div style={{ color: '#4ade80', fontSize: 12 }}>
              Document ready for analysis
            </div>
          </div>
        </div>

        <h2
          style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}
        >
          Analyze the Offer
        </h2>
        <p style={{ color: '#64748b', fontSize: 14, marginBottom: 20, lineHeight: 1.5 }}>
          ClaimCoach AI will compare the carrier's offer against your scope sheet and give you a
          clear recommendation on what to do next.
        </p>

        {errorMsg && (
          <div
            style={{
              marginBottom: 16,
              padding: '10px 14px',
              background: '#fef2f2',
              borderRadius: 8,
              color: '#dc2626',
              fontSize: 14,
            }}
          >
            {errorMsg}
          </div>
        )}

        <button
          onClick={() => analyzeMutation.mutate()}
          style={{
            width: '100%',
            padding: '14px 24px',
            background: '#0d9488',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            fontWeight: 700,
            cursor: 'pointer',
            fontSize: 16,
          }}
        >
          Analyze the Offer →
        </button>
      </div>
    )
  }

  // ─── ANALYZING PHASE ──────────────────────────────────────────────────────
  if (phase === 'analyzing') {
    return (
      <div style={{ padding: '40px 0', textAlign: 'center' }}>
        {/* Animated orb */}
        <div
          style={{
            position: 'relative',
            width: 90,
            height: 90,
            margin: '0 auto 28px',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              border: '3px solid #0d9488',
              opacity: 0.2,
              animation: 'pulse 2s ease-in-out infinite',
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 8,
              borderRadius: '50%',
              border: '2px solid #0d9488',
              opacity: 0.4,
              animation: 'pulse 2s ease-in-out infinite 0.3s',
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 16,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #0d9488, #0891b2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 28,
            }}
          >
            🧠
          </div>
        </div>

        <div style={{ fontWeight: 700, fontSize: 18, color: '#0f172a', marginBottom: 28 }}>
          Analyzing the offer…
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            maxWidth: 300,
            margin: '0 auto 24px',
          }}
        >
          {ANALYSIS_STEPS.map((s, i) => {
            const state =
              i < analysisStep ? 'done' : i === analysisStep ? 'active' : 'pending'
            return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  opacity: state === 'pending' ? 0.4 : 1,
                  transition: 'opacity 0.3s',
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    flexShrink: 0,
                    background:
                      state === 'done'
                        ? '#0d9488'
                        : state === 'active'
                        ? '#e0f2fe'
                        : '#f1f5f9',
                    border: state === 'active' ? '2px solid #0d9488' : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: state === 'done' ? 13 : 15,
                    color: state === 'done' ? '#fff' : 'inherit',
                    fontWeight: 700,
                  }}
                >
                  {state === 'done' ? '✓' : s.icon}
                </div>
                <span
                  style={{
                    fontSize: 14,
                    color: state === 'pending' ? '#94a3b8' : '#334155',
                    textAlign: 'left',
                  }}
                >
                  {s.label}
                </span>
              </div>
            )
          })}
        </div>

        <div style={{ color: '#94a3b8', fontSize: 13 }}>About 30–60 seconds</div>
      </div>
    )
  }

  // ─── LETTER GENERATING PHASE ──────────────────────────────────────────────
  if (phase === 'letter_generating') {
    return (
      <div style={{ padding: '48px 0', textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>✍️</div>
        <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 17 }}>
          Writing your dispute letter…
        </div>
        <div style={{ color: '#64748b', fontSize: 13, marginTop: 8 }}>
          About 10–15 seconds
        </div>
      </div>
    )
  }

  // ─── VERDICT PHASE ────────────────────────────────────────────────────────
  if (phase === 'verdict' && pmBrain) {
    const config = STATUS_CONFIG[pmBrain.status]

    return (
      <div
        style={{
          maxWidth: 680,
          margin: '0 auto',
          padding: '8px 0 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {/* ── Status banner ─────────────────────────────────────────────── */}
        <div
          style={{
            padding: '20px 24px',
            background: config.bg,
            border: `1px solid ${config.border}`,
            borderRadius: 12,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginBottom: 10,
            }}
          >
            <span style={{ fontSize: 28 }}>{config.icon}</span>
            <span
              style={{ fontWeight: 800, fontSize: 20, color: config.textColor }}
            >
              {config.label}
            </span>
          </div>
          <p
            style={{
              color: '#334155',
              lineHeight: 1.6,
              margin: 0,
              fontSize: 15,
            }}
          >
            {pmBrain.plain_english_summary}
          </p>
        </div>

        {/* ── Dollar summary (DISPUTE_OFFER / LEGAL_REVIEW) ─────────────── */}
        {(pmBrain.status === 'DISPUTE_OFFER' || pmBrain.status === 'LEGAL_REVIEW') && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            {[
              {
                label: 'Contractor Estimate',
                value: pmBrain.total_contractor_estimate,
                color: '#0d9488',
              },
              {
                label: 'Carrier Paid',
                value: pmBrain.total_carrier_estimate,
                color: '#64748b',
              },
              {
                label: 'Gap',
                value: Math.abs(pmBrain.total_delta),
                color: '#dc2626',
              },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                style={{
                  padding: '14px 16px',
                  background: '#f8fafc',
                  borderRadius: 10,
                  border: '1px solid #e2e8f0',
                  textAlign: 'center',
                }}
              >
                <div
                  style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}
                >
                  {label}
                </div>
                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 800,
                    color,
                    fontFamily: "'Work Sans', sans-serif",
                  }}
                >
                  {formatCurrency(value)}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Delta drivers (collapsible) ────────────────────────────────── */}
        {pmBrain.top_delta_drivers.length > 0 &&
          pmBrain.status !== 'CLOSE' &&
          pmBrain.status !== 'NEED_DOCS' && (
            <div
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: 10,
                overflow: 'hidden',
              }}
            >
              <button
                onClick={() => setDeltaDriversOpen((o) => !o)}
                style={{
                  width: '100%',
                  padding: '13px 18px',
                  background: '#f8fafc',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontWeight: 600,
                  color: '#0f172a',
                  fontSize: 14,
                }}
              >
                <span>
                  Pricing Gaps ({pmBrain.top_delta_drivers.length} items)
                </span>
                <span style={{ color: '#94a3b8' }}>
                  {deltaDriversOpen ? '▲' : '▼'}
                </span>
              </button>
              {deltaDriversOpen && (
                <div style={{ padding: '0 18px 14px' }}>
                  {pmBrain.top_delta_drivers.map((driver, i) => (
                    <div
                      key={i}
                      style={{
                        padding: '12px 0',
                        borderTop: i > 0 ? '1px solid #f1f5f9' : undefined,
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          marginBottom: 4,
                        }}
                      >
                        <span
                          style={{
                            fontWeight: 600,
                            color: '#0f172a',
                            fontSize: 14,
                          }}
                        >
                          {driver.line_item}
                        </span>
                        <span
                          style={{
                            fontWeight: 700,
                            color: '#dc2626',
                            fontSize: 14,
                            fontFamily: "'Work Sans', sans-serif",
                          }}
                        >
                          −{formatCurrency(driver.delta)}
                        </span>
                      </div>
                      <div
                        style={{ display: 'flex', gap: 16, fontSize: 13, color: '#64748b' }}
                      >
                        <span>
                          Contractor: {formatCurrency(driver.contractor_price)}
                        </span>
                        <span>Carrier: {formatCurrency(driver.carrier_price)}</span>
                      </div>
                      {driver.reason && (
                        <div
                          style={{
                            marginTop: 4,
                            fontSize: 12,
                            color: '#94a3b8',
                            fontStyle: 'italic',
                          }}
                        >
                          {driver.reason}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        {/* ── Coverage disputes (collapsible) ───────────────────────────── */}
        {pmBrain.coverage_disputes.length > 0 && (
          <div
            style={{
              border: '1px solid #e2e8f0',
              borderRadius: 10,
              overflow: 'hidden',
            }}
          >
            <button
              onClick={() => setDisputesOpen((o) => !o)}
              style={{
                width: '100%',
                padding: '13px 18px',
                background: '#f8fafc',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontWeight: 600,
                color: '#0f172a',
                fontSize: 14,
              }}
            >
              <span>
                Coverage Disputes ({pmBrain.coverage_disputes.length})
              </span>
              <span style={{ color: '#94a3b8' }}>
                {disputesOpen ? '▲' : '▼'}
              </span>
            </button>
            {disputesOpen && (
              <div style={{ padding: '0 18px 14px' }}>
                {pmBrain.coverage_disputes.map((d, i) => (
                  <div
                    key={i}
                    style={{
                      padding: '10px 0',
                      borderTop: i > 0 ? '1px solid #f1f5f9' : undefined,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        gap: 8,
                        alignItems: 'center',
                        marginBottom: 4,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 4,
                          background:
                            d.status === 'denied' ? '#fef2f2' : '#fffbeb',
                          color: d.status === 'denied' ? '#991b1b' : '#92400e',
                        }}
                      >
                        {d.status === 'denied' ? 'DENIED' : 'PARTIAL'}
                      </span>
                      <span
                        style={{ fontWeight: 600, color: '#0f172a', fontSize: 14 }}
                      >
                        {d.item}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: '#64748b' }}>
                      {d.contractor_position}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}


        {/* ── DISPUTE_OFFER: dispute letter ─────────────────────────────── */}
        {pmBrain.status === 'DISPUTE_OFFER' && !step6Done && (
          <div>
            {!disputeLetter ? (
              <button
                onClick={() => letterMutation.mutate()}
                disabled={letterMutation.isPending}
                style={{
                  width: '100%',
                  padding: '14px 24px',
                  background: '#0d9488',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  fontWeight: 700,
                  cursor: letterMutation.isPending ? 'not-allowed' : 'pointer',
                  fontSize: 15,
                  opacity: letterMutation.isPending ? 0.7 : 1,
                }}
              >
                ✉️ Generate Dispute Letter
              </button>
            ) : (
              <div
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: 10,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    padding: '12px 18px',
                    background: '#f8fafc',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderBottom: '1px solid #e2e8f0',
                  }}
                >
                  <span style={{ fontWeight: 700, color: '#0f172a', fontSize: 14 }}>
                    ✉️ Dispute Letter
                  </span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(disputeLetter)
                      setLetterCopied(true)
                      setTimeout(() => setLetterCopied(false), 2000)
                    }}
                    style={{
                      padding: '6px 14px',
                      background: letterCopied ? '#0d9488' : '#fff',
                      color: letterCopied ? '#fff' : '#334155',
                      border: '1px solid #e2e8f0',
                      borderRadius: 6,
                      fontSize: 13,
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    {letterCopied ? '✓ Copied' : 'Copy'}
                  </button>
                </div>
                <pre
                  style={{
                    margin: 0,
                    padding: '18px 20px',
                    fontFamily: 'Georgia, serif',
                    fontSize: 13,
                    lineHeight: 1.7,
                    color: '#0f172a',
                    whiteSpace: 'pre-wrap',
                    maxHeight: 420,
                    overflowY: 'auto',
                  }}
                >
                  {disputeLetter}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* ── LEGAL_REVIEW: owner escalation pitch ────────────────────────── */}
        {pmBrain.status === 'LEGAL_REVIEW' && !step6Done && (
          <div>
            {!ownerPitch ? (
              /* Phase 1: Generate pitch */
              <div>
                {pitchMutation.isError && (
                  <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, marginBottom: 12 }}>
                    <span style={{ color: '#991b1b', fontSize: 13 }}>
                      {(pitchMutation.error as any)?.response?.data?.error || (pitchMutation.error as any)?.message || 'Failed to generate pitch. Please try again.'}
                    </span>
                  </div>
                )}
                <button
                  onClick={() => pitchMutation.mutate()}
                  disabled={pitchMutation.isPending}
                  style={{
                    width: '100%',
                    padding: '14px 24px',
                    background: '#dc2626',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    fontWeight: 700,
                    cursor: pitchMutation.isPending ? 'not-allowed' : 'pointer',
                    fontSize: 15,
                    opacity: pitchMutation.isPending ? 0.7 : 1,
                  }}
                >
                  {pitchMutation.isPending ? 'Generating…' : '📋 Generate Escalation Pitch'}
                </button>
              </div>
            ) : !pitchAcknowledged ? (
              /* Phase 2: Show pitch + copy + confirm */
              <div>
                <div
                  style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: 10,
                    overflow: 'hidden',
                    marginBottom: 16,
                  }}
                >
                  <div
                    style={{
                      padding: '12px 18px',
                      background: '#f8fafc',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      borderBottom: '1px solid #e2e8f0',
                    }}
                  >
                    <span style={{ fontWeight: 700, color: '#0f172a', fontSize: 14 }}>
                      📋 Owner Escalation Pitch
                    </span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(ownerPitch).then(() => {
                          setPitchCopied(true)
                          setTimeout(() => setPitchCopied(false), 2000)
                        }).catch(() => {/* clipboard denied — button stays as-is */})
                      }}
                      style={{
                        padding: '6px 14px',
                        background: pitchCopied ? '#0d9488' : '#fff',
                        color: pitchCopied ? '#fff' : '#334155',
                        border: '1px solid #e2e8f0',
                        borderRadius: 6,
                        fontSize: 13,
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      {pitchCopied ? '✓ Copied' : 'Copy'}
                    </button>
                  </div>
                  <pre
                    style={{
                      margin: 0,
                      padding: '18px 20px',
                      fontFamily: 'Georgia, serif',
                      fontSize: 13,
                      lineHeight: 1.7,
                      color: '#0f172a',
                      whiteSpace: 'pre-wrap',
                      maxHeight: 420,
                      overflowY: 'auto',
                    }}
                  >
                    {ownerPitch}
                  </pre>
                </div>
                <div
                  style={{
                    padding: '14px 18px',
                    background: '#fef9c3',
                    border: '1px solid #fde68a',
                    borderRadius: 8,
                    marginBottom: 12,
                    fontSize: 13,
                    color: '#713f12',
                  }}
                >
                  Copy this pitch and paste it into your email client to send to your property owner.
                  Once you've sent it, click the button below.
                </div>
                <button
                  onClick={() => setPitchAcknowledged(true)}
                  style={{
                    width: '100%',
                    padding: '14px 24px',
                    background: '#1e293b',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontSize: 15,
                  }}
                >
                  ✓ I Have Sent This to the Property Owner
                </button>
              </div>
            ) : !ownerApproved ? (
              /* Phase 3: Owner notified — waiting for their approval */
              <div
                style={{
                  padding: '20px 24px',
                  background: '#f0fdf4',
                  borderRadius: 10,
                  border: '1px solid #bbf7d0',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: 28, marginBottom: 8 }}>📬</div>
                <div style={{ fontWeight: 700, color: '#166534', fontSize: 16, marginBottom: 4 }}>
                  Owner notified. Waiting for their response.
                </div>
                <div style={{ color: '#15803d', fontSize: 13, marginBottom: 20 }}>
                  Once the owner approves, come back here to forward the case to your attorney.
                </div>
                <button
                  onClick={() => setOwnerApproved(true)}
                  style={{
                    width: '100%',
                    padding: '14px 24px',
                    background: '#1e293b',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontSize: 15,
                    marginBottom: 10,
                  }}
                >
                  ✓ Owner Has Approved — Proceed to Attorney Contact
                </button>
                <button
                  onClick={() => completeMutation.mutate()}
                  disabled={completeMutation.isPending}
                  style={{
                    width: '100%',
                    padding: '12px 24px',
                    background: 'transparent',
                    color: '#64748b',
                    border: '1px solid #cbd5e1',
                    borderRadius: 8,
                    fontWeight: 600,
                    cursor: completeMutation.isPending ? 'not-allowed' : 'pointer',
                    fontSize: 14,
                    opacity: completeMutation.isPending ? 0.7 : 1,
                  }}
                >
                  {completeMutation.isPending ? 'Saving…' : 'Owner Declined Legal Escalation — Skip to Next Step'}
                </button>
              </div>
            ) : !attorneyContacted ? (
              /* Phase 4: Attorney briefing — copy and send to lawyer */
              <div>
                <div
                  style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: 10,
                    overflow: 'hidden',
                    marginBottom: 16,
                  }}
                >
                  <div
                    style={{
                      padding: '12px 18px',
                      background: '#f8fafc',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      borderBottom: '1px solid #e2e8f0',
                    }}
                  >
                    <span style={{ fontWeight: 700, color: '#0f172a', fontSize: 14 }}>
                      ⚖️ Attorney Briefing
                    </span>
                    <button
                      onClick={() => {
                        const briefing = buildAttorneyBriefing(claim, pmBrain)
                        navigator.clipboard.writeText(briefing).then(() => {
                          setLawyerBriefingCopied(true)
                          setTimeout(() => setLawyerBriefingCopied(false), 2000)
                        }).catch(() => {/* clipboard denied */})
                      }}
                      style={{
                        padding: '6px 14px',
                        background: lawyerBriefingCopied ? '#0d9488' : '#fff',
                        color: lawyerBriefingCopied ? '#fff' : '#334155',
                        border: '1px solid #e2e8f0',
                        borderRadius: 6,
                        fontSize: 13,
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      {lawyerBriefingCopied ? '✓ Copied' : 'Copy'}
                    </button>
                  </div>
                  <pre
                    style={{
                      margin: 0,
                      padding: '18px 20px',
                      fontFamily: 'Georgia, serif',
                      fontSize: 13,
                      lineHeight: 1.7,
                      color: '#0f172a',
                      whiteSpace: 'pre-wrap',
                      maxHeight: 380,
                      overflowY: 'auto',
                    }}
                  >
                    {buildAttorneyBriefing(claim, pmBrain)}
                  </pre>
                </div>

                {/* ZIP Download Button */}
                {zipDownloadError && (
                  <div
                    style={{
                      padding: '10px 14px',
                      background: '#fef2f2',
                      border: '1px solid #fecaca',
                      borderRadius: 8,
                      marginBottom: 12,
                      fontSize: 13,
                      color: '#991b1b',
                    }}
                  >
                    {zipDownloadError}
                  </div>
                )}
                <button
                  onClick={async () => {
                    setIsDownloadingZip(true)
                    setZipDownloadError(null)
                    try {
                      await downloadLegalPackage(claim.id)
                    } catch (err: any) {
                      setZipDownloadError(
                        err?.response?.data?.error || err?.message || 'Failed to generate ZIP. Please try again.'
                      )
                    } finally {
                      setIsDownloadingZip(false)
                    }
                  }}
                  disabled={isDownloadingZip}
                  style={{
                    width: '100%',
                    padding: '14px 24px',
                    background: isDownloadingZip ? '#374151' : '#111827',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    fontWeight: 700,
                    cursor: isDownloadingZip ? 'not-allowed' : 'pointer',
                    fontSize: 15,
                    opacity: isDownloadingZip ? 0.7 : 1,
                    marginBottom: 12,
                  }}
                >
                  {isDownloadingZip ? '⏳ Generating ZIP…' : '⬇ Download Case Files (ZIP)'}
                </button>

                <div
                  style={{
                    padding: '14px 18px',
                    background: '#fef9c3',
                    border: '1px solid #fde68a',
                    borderRadius: 8,
                    marginBottom: 12,
                    fontSize: 13,
                    color: '#713f12',
                  }}
                >
                  Copy this briefing and paste it into an email to your attorney.
                  Once you've sent it, click the button below.
                </div>
                <button
                  onClick={() => setAttorneyContacted(true)}
                  style={{
                    width: '100%',
                    padding: '14px 24px',
                    background: '#1e293b',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontSize: 15,
                  }}
                >
                  ✓ I Have Sent This to My Attorney
                </button>
              </div>
            ) : (
              /* Phase 5: All contacts made — complete step */
              <div
                style={{
                  padding: '20px 24px',
                  background: '#f0fdf4',
                  borderRadius: 10,
                  border: '1px solid #bbf7d0',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
                <div style={{ fontWeight: 700, color: '#166534', fontSize: 16, marginBottom: 4 }}>
                  Owner and attorney notified. You've done your part.
                </div>
                <div style={{ color: '#15803d', fontSize: 13, marginBottom: 20 }}>
                  Your attorney will review the case and advise on next steps.
                </div>
                {completeMutation.isError && (
                  <div style={{ padding: '8px 12px', background: '#fef2f2', borderRadius: 6, marginBottom: 12 }}>
                    <span style={{ color: '#991b1b', fontSize: 13 }}>Failed to advance. Please try again.</span>
                  </div>
                )}
                <button
                  onClick={() => completeMutation.mutate()}
                  disabled={completeMutation.isPending}
                  style={{
                    width: '100%',
                    padding: '14px 24px',
                    background: '#16a34a',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    fontWeight: 700,
                    cursor: completeMutation.isPending ? 'not-allowed' : 'pointer',
                    fontSize: 15,
                    opacity: completeMutation.isPending ? 0.7 : 1,
                  }}
                >
                  {completeMutation.isPending ? 'Saving…' : 'Step 6 Complete →'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── NEED_DOCS: re-upload prompt ────────────────────────────────── */}
        {pmBrain.status === 'NEED_DOCS' && (
          <div>
            <div
              style={{
                padding: '16px 20px',
                background: '#fffbeb',
                borderRadius: 10,
                border: '1px solid #fde68a',
                color: '#92400e',
                fontSize: 14,
                marginBottom: 12,
              }}
            >
              The document you uploaded doesn't appear to contain line-item pricing data. Please
              upload the full estimate PDF — the page with the itemized breakdown — from your
              insurance carrier.
            </div>
            <button
              onClick={() => {
                setPmBrain(null)
                setAuditReportId(null)
                setPhase('idle')
              }}
              style={{
                padding: '11px 20px',
                background: '#f1f5f9',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                fontWeight: 600,
                color: '#334155',
                fontSize: 14,
              }}
            >
              Upload a Different Document
            </button>
          </div>
        )}

        {/* ── Error ────────────────────────────────────────────────────── */}
        {errorMsg && (
          <div
            style={{
              padding: '10px 14px',
              background: '#fef2f2',
              borderRadius: 8,
              color: '#dc2626',
              fontSize: 14,
            }}
          >
            {errorMsg}
          </div>
        )}

        {/* ── Complete step button ──────────────────────────────────────── */}
        {!step6Done &&
          (pmBrain.status === 'CLOSE' ||
            disputeLetter) && (
            <button
              onClick={() => completeMutation.mutate()}
              disabled={completeMutation.isPending}
              style={{
                padding: '14px 24px',
                background: '#0f172a',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                fontWeight: 700,
                cursor: completeMutation.isPending ? 'not-allowed' : 'pointer',
                fontSize: 15,
                opacity: completeMutation.isPending ? 0.7 : 1,
              }}
            >
              {completeMutation.isPending
                ? 'Saving…'
                : 'Review Complete — Continue to Payments →'}
            </button>
          )}

        {/* ── Step done badge ───────────────────────────────────────────── */}
        {step6Done && (
          <div
            style={{
              padding: '12px 16px',
              background: '#f0fdf4',
              borderRadius: 8,
              color: '#166534',
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            ✓ Step 6 complete
          </div>
        )}
      </div>
    )
  }

  return null
}
