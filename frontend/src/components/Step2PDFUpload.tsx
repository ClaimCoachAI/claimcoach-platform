// frontend/src/components/Step2PDFUpload.tsx
import { useState, useCallback, useRef, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { uploadContractorEstimate, parseContractorEstimate } from '../lib/api'
import type { Claim } from '../types/claim'

interface ContractorEstimateArea {
  category: string
  summary: string
  items: string[]
}

interface ParsedData {
  vendor_name: string
  property_address: string
  areas: ContractorEstimateArea[]
}

interface Step2PDFUploadProps {
  claim: Claim
  initialParsedData?: ParsedData
}

const AREA_ICONS: Record<string, string> = {
  Roof: '🏠',
  Roofing: '🏠',
  Windows: '🪟',
  Siding: '🧱',
  Gutters: '💧',
  Interior: '🛋️',
  Flooring: '🪵',
  Ceiling: '⬆️',
  HVAC: '❄️',
  Electrical: '⚡',
  Plumbing: '🔧',
}
const DEFAULT_ICON = '🔨'

type LoadingPhase = 'uploading' | 'reading' | 'identifying' | 'building'

const PHASE_CONFIG: Record<LoadingPhase, { heading: string; sub: string }> = {
  uploading:   { heading: 'Uploading your PDF…',     sub: 'Sending it over securely' },
  reading:     { heading: 'Reading your estimate…',  sub: 'Pulling out the damage details' },
  identifying: { heading: 'Spotting damaged areas…', sub: 'Going through each section' },
  building:    { heading: 'Building your summary…',  sub: 'Almost done' },
}

const STEPS: { id: LoadingPhase; label: string }[] = [
  { id: 'uploading',   label: 'PDF uploaded' },
  { id: 'reading',     label: 'Reading the document' },
  { id: 'identifying', label: 'Spotting damaged areas' },
  { id: 'building',    label: 'Building your summary' },
]

const PHASE_ORDER: LoadingPhase[] = ['uploading', 'reading', 'identifying', 'building']

export default function Step2PDFUpload({ claim, initialParsedData }: Step2PDFUploadProps) {
  const queryClient = useQueryClient()
  const [screen, setScreen] = useState<'upload' | 'loading' | 'summary' | 'error'>(
    initialParsedData ? 'summary' : 'upload'
  )
  const [parsedData, setParsedData] = useState<ParsedData | null>(initialParsedData ?? null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [loadingPhase, setLoadingPhase] = useState<LoadingPhase>('uploading')
  const phaseTimers = useRef<ReturnType<typeof setTimeout>[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Clean up phase timers on unmount
  useEffect(() => () => { phaseTimers.current.forEach(clearTimeout) }, [])

  const continueMutation = useMutation({
    mutationFn: async () => {
      await api.patch(`/api/claims/${claim.id}/step`, {
        current_step: 3,
        steps_completed: [1, 2],
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['claim', claim.id] })
      queryClient.invalidateQueries({ queryKey: ['contractor-estimate', claim.id] })
    },
  })

  const processFile = useCallback(async (file: File) => {
    if (file.type !== 'application/pdf') {
      setErrorMsg("We couldn't read that file. Make sure it's a contractor damage estimate PDF and try again.")
      setScreen('error')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg("File exceeds 10MB limit. Please upload a smaller PDF.")
      setScreen('error')
      return
    }

    setScreen('loading')
    setLoadingPhase('uploading')
    setErrorMsg(null)
    phaseTimers.current.forEach(clearTimeout)
    phaseTimers.current = []

    try {
      const { estimate_id } = await uploadContractorEstimate(claim.id, file)

      // Upload done — advance to reading, then schedule visual phase advances
      setLoadingPhase('reading')
      phaseTimers.current.push(setTimeout(() => setLoadingPhase('identifying'), 6000))
      phaseTimers.current.push(setTimeout(() => setLoadingPhase('building'), 13000))

      const data = await parseContractorEstimate(claim.id, estimate_id)
      phaseTimers.current.forEach(clearTimeout)
      phaseTimers.current = []
      if (!data || !data.areas || data.areas.length === 0) {
        setErrorMsg("We couldn't read that file. Make sure it's a contractor damage estimate PDF and try again.")
        setScreen('error')
        return
      }
      setParsedData(data)
      setScreen('summary')
    } catch {
      setErrorMsg("We couldn't read that file. Make sure it's a contractor damage estimate PDF and try again.")
      setScreen('error')
    }
  }, [claim.id])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
    // Reset input so the same file can be re-selected after an error
    e.target.value = ''
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) processFile(file)
  }

  // ── Error state ────────────────────────────────────────────────
  if (screen === 'error') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{
          padding: '28px 20px',
          border: '2px dashed rgba(239,68,68,0.4)',
          borderRadius: '12px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '28px', marginBottom: '10px' }}>⚠️</div>
          <div style={{ fontSize: '13px', color: '#dc2626', fontWeight: '500', marginBottom: '8px' }}>
            {errorMsg}
          </div>
          <button
            onClick={() => { setScreen('upload'); fileInputRef.current?.click() }}
            style={{
              marginTop: '12px',
              padding: '10px 20px',
              borderRadius: '8px',
              border: '1.5px solid rgba(148,163,184,0.35)',
              background: 'transparent',
              color: '#64748b',
              fontSize: '13px',
              fontWeight: '500',
              cursor: 'pointer',
            }}
          >
            Try Again
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
        </div>
      </div>
    )
  }

  // ── Loading state ──────────────────────────────────────────────
  if (screen === 'loading') {
    const phaseIndex = PHASE_ORDER.indexOf(loadingPhase)
    const { heading, sub } = PHASE_CONFIG[loadingPhase]

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingTop: '8px' }}>
        <style>{`
          @keyframes step2-spin { to { transform: rotate(360deg); } }
          @keyframes step2-pulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.35; transform:scale(0.65); } }
        `}</style>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '34px', height: '34px', borderRadius: '50%', flexShrink: 0,
            border: '3px solid rgba(13,148,136,0.18)',
            borderTop: '3px solid #0d9488',
            animation: 'step2-spin 0.85s linear infinite',
          }} />
          <div>
            <div style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a' }}>{heading}</div>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{sub}</div>
          </div>
        </div>

        {/* Step list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
          {STEPS.map((step, i) => {
            const isDone    = i < phaseIndex
            const isActive  = i === phaseIndex
            const isPending = i > phaseIndex

            return (
              <div key={step.id}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '6px 0' }}>
                  {/* Dot */}
                  <div style={{
                    width: '22px', height: '22px', borderRadius: '50%', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: isDone ? '#0d9488' : isPending ? '#e2e8f0' : 'transparent',
                    border: isActive ? '2.5px solid #0d9488' : 'none',
                    position: 'relative',
                  }}>
                    {isDone && (
                      <span style={{ fontSize: '11px', fontWeight: '800', color: '#fff' }}>✓</span>
                    )}
                    {isActive && (
                      <div style={{
                        width: '9px', height: '9px', borderRadius: '50%',
                        background: '#0d9488',
                        animation: 'step2-pulse 1.1s ease-in-out infinite',
                      }} />
                    )}
                  </div>
                  {/* Label */}
                  <span style={{
                    fontSize: '13px',
                    fontWeight: isDone || isActive ? '600' : '400',
                    color: isDone ? '#0d9488' : isActive ? '#0f172a' : '#94a3b8',
                  }}>
                    {step.label}
                  </span>
                </div>
                {/* Connector line */}
                {i < STEPS.length - 1 && (
                  <div style={{
                    width: '2px', height: '10px',
                    background: isDone ? '#0d9488' : '#e2e8f0',
                    marginLeft: '10px',
                  }} />
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Damage Summary (Screen 2) ──────────────────────────────────
  if (screen === 'summary' && parsedData) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '22px', height: '22px', borderRadius: '50%',
            background: '#0d9488',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '11px', fontWeight: '800', color: '#fff', flexShrink: 0,
          }}>✓</div>
          <span style={{ fontSize: '13px', fontWeight: '600', color: '#0d9488' }}>
            Estimate parsed from {parsedData.vendor_name || 'contractor'}
          </span>
        </div>

        <div>
          <div style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', marginBottom: '3px' }}>
            Damage found in {parsedData.areas.length} {parsedData.areas.length === 1 ? 'area' : 'areas'}
          </div>
          <div style={{ fontSize: '12px', color: '#64748b' }}>
            Here's a summary of what was damaged. We'll use this to build your independent ClaimCoach estimate.
          </div>
        </div>

        {/* Damage area cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {parsedData.areas.map((area, i) => (
            <div key={i} style={{
              padding: '12px 14px',
              background: 'rgba(241,245,249,0.6)',
              border: '1px solid rgba(148,163,184,0.2)',
              borderRadius: '10px',
              display: 'flex',
              gap: '12px',
              alignItems: 'flex-start',
            }}>
              <div style={{ fontSize: '20px', flexShrink: 0, marginTop: '1px' }}>
                {AREA_ICONS[area.category] ?? DEFAULT_ICON}
              </div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a', marginBottom: '3px' }}>
                  {area.category}
                </div>
                <div style={{ fontSize: '12px', color: '#64748b', lineHeight: '1.5' }}>
                  {area.summary}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Continue button */}
        {!initialParsedData && !continueMutation.isSuccess && (
          <>
            <button
              onClick={() => continueMutation.mutate()}
              disabled={continueMutation.isPending}
              style={{
                width: '100%', padding: '13px 16px',
                borderRadius: '10px', border: 'none',
                background: 'linear-gradient(135deg, #0d9488 0%, #14b8a6 100%)',
                color: '#fff', fontSize: '14px', fontWeight: '600',
                fontFamily: "'Work Sans', sans-serif",
                cursor: continueMutation.isPending ? 'not-allowed' : 'pointer',
                opacity: continueMutation.isPending ? 0.7 : 1,
                boxShadow: '0 2px 10px rgba(13,148,136,0.25)',
                letterSpacing: '0.01em',
                marginTop: '4px',
              }}
            >
              {continueMutation.isPending ? 'Saving…' : 'Continue →'}
            </button>

            {continueMutation.isError && (
              <div style={{ fontSize: '12px', color: '#dc2626', textAlign: 'center' }}>
                Failed to save. Please try again.
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  // ── Upload Screen (Screen 1 — default) ────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ fontSize: '12px', color: '#64748b' }}>
        Upload your contractor's damage estimate to get started
      </div>

      {/* Dropzone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{
          padding: '32px 20px',
          border: `2px dashed ${isDragOver ? '#0d9488' : 'rgba(148,163,184,0.4)'}`,
          borderRadius: '12px',
          textAlign: 'center',
          cursor: 'pointer',
          background: isDragOver ? 'rgba(13,148,136,0.04)' : 'transparent',
          transition: 'border-color 0.2s, background 0.2s',
        }}
      >
        <div style={{ fontSize: '32px', marginBottom: '10px' }}>📄</div>
        <div style={{ fontSize: '13px', fontWeight: '500', color: '#334155', marginBottom: '4px' }}>
          Drop your PDF here
        </div>
        <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '14px' }}>
          or click to browse
        </div>
        <div style={{
          display: 'inline-block',
          padding: '8px 18px',
          borderRadius: '8px',
          border: '1.5px solid rgba(13,148,136,0.4)',
          color: '#0d9488',
          fontSize: '12px',
          fontWeight: '600',
        }}>
          Choose File
        </div>
        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '10px' }}>
          PDF only · Max 10MB
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
    </div>
  )
}
