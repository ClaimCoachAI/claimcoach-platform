import React, { useRef, useState, useCallback } from 'react'
import type { ElevationData, ElevationSide, SidingType } from '../types'
import { usePhotoUpload } from '../usePhotoUpload'

// ─── Props ────────────────────────────────────────────────────────────────────
interface ElevationsStepProps {
  token: string
  elevations: ElevationData[]
  onSaveElevation: (side: ElevationSide, data: Partial<ElevationData>) => Promise<void>
  onContinue: () => void
  onBack: () => void
  loading: boolean
  error: string | null
}

// ─── Design tokens (identical to QuickSetupStep) ──────────────────────────────
const C = {
  teal: '#0D9488',
  tealLight: '#CCFBF1',
  tealDim: 'rgba(13,148,136,0.12)',
  orange: '#F97316',
  orangeHover: '#EA6C0A',
  navy: '#0F172A',
  navyMid: '#334155',
  slate: '#64748B',
  border: '#E2E8F0',
  borderStrong: '#CBD5E1',
  bg: '#F8FAFC',
  white: '#FFFFFF',
  errorBg: '#FFF1F2',
  errorBorder: '#FECDD3',
  errorText: '#BE123C',
}

// ─── Config ───────────────────────────────────────────────────────────────────
const SIDES: Array<{ value: ElevationSide; label: string }> = [
  { value: 'front', label: 'Front' },
  { value: 'right', label: 'Right' },
  { value: 'back', label: 'Back' },
  { value: 'left', label: 'Left' },
]

const SIDING_OPTIONS: Array<{ value: SidingType; label: string }> = [
  { value: 'vinyl', label: 'Vinyl' },
  { value: 'wood', label: 'Wood' },
  { value: 'fiber_cement', label: 'Fiber Cement' },
  { value: 'brick', label: 'Brick' },
  { value: 'stucco', label: 'Stucco' },
  { value: 'other', label: 'Other' },
]

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = {
  container: {
    minHeight: '100vh',
    backgroundColor: C.bg,
    fontFamily: '"DM Sans", "Inter", system-ui, -apple-system, sans-serif',
  } as React.CSSProperties,

  inner: {
    maxWidth: 480,
    margin: '0 auto',
    padding: '0 0 100px 0',
  } as React.CSSProperties,

  // ── Header ──
  header: {
    background: `linear-gradient(135deg, ${C.navy} 0%, #1E3A5F 100%)`,
    padding: '20px 20px 28px',
    position: 'relative' as const,
    overflow: 'hidden',
  } as React.CSSProperties,

  headerAccent: {
    position: 'absolute' as const,
    top: -40,
    right: -40,
    width: 140,
    height: 140,
    borderRadius: '50%',
    background: 'rgba(13,148,136,0.15)',
    pointerEvents: 'none' as const,
  } as React.CSSProperties,

  headerAccent2: {
    position: 'absolute' as const,
    bottom: -20,
    left: '30%',
    width: 80,
    height: 80,
    borderRadius: '50%',
    background: 'rgba(249,115,22,0.10)',
    pointerEvents: 'none' as const,
  } as React.CSSProperties,

  stepBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(13,148,136,0.2)',
    border: '1px solid rgba(13,148,136,0.4)',
    borderRadius: 20,
    padding: '3px 10px',
    marginBottom: 10,
  } as React.CSSProperties,

  stepBadgeText: {
    fontSize: 11,
    fontWeight: 700,
    color: '#5EEAD4',
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
  } as React.CSSProperties,

  headerTitle: {
    fontSize: 26,
    fontWeight: 800,
    color: C.white,
    margin: 0,
    letterSpacing: '-0.02em',
    lineHeight: 1.15,
  } as React.CSSProperties,

  headerSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 5,
    fontWeight: 400,
  } as React.CSSProperties,

  // ── Tab strip ──
  tabStrip: {
    display: 'flex',
    borderBottom: `2px solid ${C.border}`,
    backgroundColor: C.white,
    position: 'sticky' as const,
    top: 0,
    zIndex: 10,
    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
  } as React.CSSProperties,

  // ── Section ──
  section: {
    padding: '20px 16px 0',
  } as React.CSSProperties,

  sectionLabel: {
    fontSize: 11,
    fontWeight: 800,
    color: C.slate,
    letterSpacing: '0.09em',
    textTransform: 'uppercase' as const,
    marginBottom: 10,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  } as React.CSSProperties,

  sectionLabelDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    backgroundColor: C.teal,
    flexShrink: 0,
  } as React.CSSProperties,

  // ── Error ──
  errorBox: {
    margin: '16px 16px 0',
    backgroundColor: C.errorBg,
    border: `1px solid ${C.errorBorder}`,
    borderRadius: 10,
    padding: '10px 14px',
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
  } as React.CSSProperties,

  errorTextStyle: {
    fontSize: 13,
    color: C.errorText,
    fontWeight: 500,
    lineHeight: 1.4,
    margin: 0,
  } as React.CSSProperties,

  // ── CTA ──
  ctaWrap: {
    padding: '20px 16px 0',
  } as React.CSSProperties,
}

// ─── TabButton ────────────────────────────────────────────────────────────────
function TabButton({
  side,
  label,
  active,
  hasPhoto,
  onClick,
}: {
  side: ElevationSide
  label: string
  active: boolean
  hasPhoto: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-selected={active}
      role="tab"
      aria-controls={`panel-${side}`}
      style={{
        flex: 1,
        padding: '12px 4px 10px',
        border: 'none',
        borderBottom: active ? `3px solid ${C.teal}` : '3px solid transparent',
        backgroundColor: 'transparent',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 3,
        outline: 'none',
        WebkitTapHighlightColor: 'transparent',
        fontFamily: 'inherit',
        transition: 'border-color 0.15s ease',
      }}
    >
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: '0.07em',
          color: active ? C.teal : C.slate,
          textTransform: 'uppercase',
          transition: 'color 0.15s ease',
        }}
      >
        {label}
        {hasPhoto && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 14,
              height: 14,
              borderRadius: '50%',
              backgroundColor: C.teal,
              color: C.white,
              fontSize: 8,
              fontWeight: 800,
              lineHeight: 1,
              flexShrink: 0,
            }}
            aria-label="photo uploaded"
          >
            ✓
          </span>
        )}
      </span>
    </button>
  )
}

// ─── PhotoUploadZone ──────────────────────────────────────────────────────────
function PhotoUploadZone({
  side,
  elevation,
  token,
  onSaveElevation,
}: {
  side: ElevationSide
  elevation: ElevationData | undefined
  token: string
  onSaveElevation: (side: ElevationSide, data: Partial<ElevationData>) => Promise<void>
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { uploadPhoto, uploading, uploadError, clearUploadError } = usePhotoUpload(token)

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      // Reset input so the same file can be re-selected
      e.target.value = ''
      clearUploadError()
      const result = await uploadPhoto(file)
      if (result) {
        await onSaveElevation(side, { photo_document_id: result.documentId })
      }
    },
    [side, uploadPhoto, onSaveElevation, clearUploadError],
  )

  const hasPhoto = Boolean(elevation?.photo_document_id)

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/heic"
        style={{ display: 'none' }}
        onChange={handleFileChange}
        aria-hidden="true"
      />

      {/* Upload zone */}
      {!hasPhoto && !uploading && (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          style={{
            width: '100%',
            minHeight: 140,
            borderRadius: 14,
            border: `2px dashed ${C.borderStrong}`,
            backgroundColor: C.white,
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            outline: 'none',
            WebkitTapHighlightColor: 'transparent',
            fontFamily: 'inherit',
            transition: 'border-color 0.15s ease, background-color 0.15s ease',
            boxSizing: 'border-box',
          }}
          aria-label={`Upload photo for ${side} elevation`}
        >
          {/* Camera icon */}
          <span
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              backgroundColor: C.tealDim,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: C.teal,
            }}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          </span>
          <div>
            <p
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: C.navyMid,
                margin: '0 0 2px',
                textAlign: 'center',
              }}
            >
              Tap to add photo
            </p>
            <p
              style={{
                fontSize: 11,
                color: C.slate,
                margin: 0,
                textAlign: 'center',
                fontWeight: 400,
              }}
            >
              JPEG · PNG · HEIC
            </p>
          </div>
        </button>
      )}

      {/* Uploading spinner */}
      {uploading && (
        <div
          style={{
            width: '100%',
            minHeight: 140,
            borderRadius: 14,
            border: `2px dashed ${C.teal}`,
            backgroundColor: C.tealDim,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            boxSizing: 'border-box',
          }}
        >
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke={C.teal}
            strokeWidth="2.5"
            style={{ animation: 'spin 0.8s linear infinite' }}
          >
            <path d="M21 12a9 9 0 11-6.219-8.56" strokeLinecap="round" />
          </svg>
          <p
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: C.teal,
              margin: 0,
            }}
          >
            Uploading...
          </p>
        </div>
      )}

      {/* Uploaded thumbnail / success state */}
      {hasPhoto && !uploading && (
        <div
          style={{
            width: '100%',
            borderRadius: 14,
            overflow: 'hidden',
            position: 'relative',
            border: `2px solid ${C.teal}`,
            boxSizing: 'border-box',
          }}
        >
          {elevation?.photo_url ? (
            <img
              src={elevation.photo_url}
              alt={`${side} elevation`}
              style={{
                width: '100%',
                height: 160,
                objectFit: 'cover',
                display: 'block',
              }}
            />
          ) : (
            <div
              style={{
                width: '100%',
                height: 140,
                backgroundColor: C.tealDim,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <span
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  backgroundColor: C.teal,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: C.white,
                  fontSize: 22,
                  fontWeight: 800,
                }}
              >
                ✓
              </span>
              <p
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: C.teal,
                  margin: 0,
                }}
              >
                Photo uploaded
              </p>
            </div>
          )}

          {/* Re-upload overlay button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              backgroundColor: 'rgba(0,0,0,0.55)',
              border: 'none',
              borderRadius: 8,
              padding: '5px 10px',
              color: C.white,
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
              outline: 'none',
              WebkitTapHighlightColor: 'transparent',
            }}
            aria-label={`Replace photo for ${side} elevation`}
          >
            Replace
          </button>
        </div>
      )}

      {/* Upload error */}
      {uploadError && (
        <div
          role="alert"
          style={{
            marginTop: 8,
            backgroundColor: C.errorBg,
            border: `1px solid ${C.errorBorder}`,
            borderRadius: 8,
            padding: '8px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke={C.errorText}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ flexShrink: 0 }}
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p style={{ fontSize: 12, color: C.errorText, fontWeight: 500, margin: 0, lineHeight: 1.4 }}>
            {uploadError}
          </p>
        </div>
      )}
    </div>
  )
}

// ─── DamageFields ─────────────────────────────────────────────────────────────
function DamageFields({
  side,
  elevation,
  onSaveElevation,
}: {
  side: ElevationSide
  elevation: ElevationData | undefined
  onSaveElevation: (side: ElevationSide, data: Partial<ElevationData>) => Promise<void>
}) {
  // Local transient state for number inputs so typing doesn't re-render the parent
  const [localSidingReplaceSf, setLocalSidingReplaceSf] = useState<string>(
    elevation?.siding_replace_sf != null ? String(elevation.siding_replace_sf) : '',
  )
  const [localSidingPaintSf, setLocalSidingPaintSf] = useState<string>(
    elevation?.siding_paint_sf != null ? String(elevation.siding_paint_sf) : '',
  )
  const [localGutterLf, setLocalGutterLf] = useState<string>(
    elevation?.gutter_lf != null ? String(elevation.gutter_lf) : '',
  )
  const [localWindows, setLocalWindows] = useState<string>(
    elevation?.windows_count != null ? String(elevation.windows_count) : '',
  )
  const [localDoors, setLocalDoors] = useState<string>(
    elevation?.doors_count != null ? String(elevation.doors_count) : '',
  )
  const [localNotes, setLocalNotes] = useState<string>(elevation?.notes ?? '')

  const inputStyle: React.CSSProperties = {
    width: '100%',
    height: 44,
    borderRadius: 10,
    border: `1.5px solid ${C.border}`,
    backgroundColor: C.white,
    padding: '0 12px',
    fontSize: 15,
    fontWeight: 500,
    color: C.navy,
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s ease',
    WebkitAppearance: 'none',
    MozAppearance: 'textfield',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    color: C.slate,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    display: 'block',
    marginBottom: 5,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Siding type */}
      <div>
        <label style={labelStyle}>Siding Type</label>
        <div
          style={{
            display: 'flex',
            gap: 8,
            overflowX: 'auto',
            paddingBottom: 4,
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
        >
          {SIDING_OPTIONS.map((opt) => {
            const isActive = elevation?.siding_type === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => void onSaveElevation(side, { siding_type: opt.value })}
                style={{
                  flexShrink: 0,
                  height: 34,
                  padding: '0 14px',
                  borderRadius: 20,
                  border: isActive ? `2px solid ${C.teal}` : `2px solid ${C.border}`,
                  backgroundColor: isActive ? C.teal : C.white,
                  color: isActive ? C.white : C.navyMid,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  outline: 'none',
                  WebkitTapHighlightColor: 'transparent',
                  fontFamily: 'inherit',
                  transition: 'all 0.15s ease',
                  whiteSpace: 'nowrap',
                }}
                aria-pressed={isActive}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Numeric fields — 2-column grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {/* Replace SF */}
        <div>
          <label style={labelStyle} htmlFor={`siding-replace-${side}`}>
            Replace (SF)
          </label>
          <input
            id={`siding-replace-${side}`}
            type="number"
            inputMode="numeric"
            min={0}
            value={localSidingReplaceSf}
            onChange={(e) => setLocalSidingReplaceSf(e.target.value)}
            onBlur={() => {
              const v = parseFloat(localSidingReplaceSf)
              void onSaveElevation(side, { siding_replace_sf: isNaN(v) ? null : v })
            }}
            style={inputStyle}
            placeholder="0"
          />
        </div>

        {/* Paint SF */}
        <div>
          <label style={labelStyle} htmlFor={`siding-paint-${side}`}>
            Paint (SF)
          </label>
          <input
            id={`siding-paint-${side}`}
            type="number"
            inputMode="numeric"
            min={0}
            value={localSidingPaintSf}
            onChange={(e) => setLocalSidingPaintSf(e.target.value)}
            onBlur={() => {
              const v = parseFloat(localSidingPaintSf)
              void onSaveElevation(side, { siding_paint_sf: isNaN(v) ? null : v })
            }}
            style={inputStyle}
            placeholder="0"
          />
        </div>

        {/* Gutter LF */}
        <div>
          <label style={labelStyle} htmlFor={`gutter-lf-${side}`}>
            Gutter (LF)
          </label>
          <input
            id={`gutter-lf-${side}`}
            type="number"
            inputMode="numeric"
            min={0}
            value={localGutterLf}
            onChange={(e) => setLocalGutterLf(e.target.value)}
            onBlur={() => {
              const v = parseFloat(localGutterLf)
              void onSaveElevation(side, { gutter_lf: isNaN(v) ? null : v })
            }}
            style={inputStyle}
            placeholder="0"
          />
        </div>

        {/* Windows */}
        <div>
          <label style={labelStyle} htmlFor={`windows-${side}`}>
            Windows #
          </label>
          <input
            id={`windows-${side}`}
            type="number"
            inputMode="numeric"
            min={0}
            value={localWindows}
            onChange={(e) => setLocalWindows(e.target.value)}
            onBlur={() => {
              const v = parseInt(localWindows, 10)
              void onSaveElevation(side, { windows_count: isNaN(v) ? null : v })
            }}
            style={inputStyle}
            placeholder="0"
          />
        </div>

        {/* Doors */}
        <div>
          <label style={labelStyle} htmlFor={`doors-${side}`}>
            Doors #
          </label>
          <input
            id={`doors-${side}`}
            type="number"
            inputMode="numeric"
            min={0}
            value={localDoors}
            onChange={(e) => setLocalDoors(e.target.value)}
            onBlur={() => {
              const v = parseInt(localDoors, 10)
              void onSaveElevation(side, { doors_count: isNaN(v) ? null : v })
            }}
            style={inputStyle}
            placeholder="0"
          />
        </div>
      </div>

      {/* Notes */}
      <div>
        <label style={labelStyle} htmlFor={`notes-${side}`}>
          Notes
        </label>
        <textarea
          id={`notes-${side}`}
          value={localNotes}
          onChange={(e) => setLocalNotes(e.target.value)}
          onBlur={() => void onSaveElevation(side, { notes: localNotes.trim() || null })}
          rows={3}
          placeholder="Describe the damage..."
          style={{
            width: '100%',
            borderRadius: 10,
            border: `1.5px solid ${C.border}`,
            backgroundColor: C.white,
            padding: '10px 12px',
            fontSize: 14,
            fontWeight: 400,
            color: C.navy,
            outline: 'none',
            fontFamily: 'inherit',
            boxSizing: 'border-box',
            resize: 'vertical',
            lineHeight: 1.5,
            transition: 'border-color 0.15s ease',
          }}
        />
      </div>
    </div>
  )
}

// ─── ProgressDots ─────────────────────────────────────────────────────────────
function ProgressDots({ elevations }: { elevations: ElevationData[] }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: '20px 16px 0',
      }}
    >
      {SIDES.map(({ value, label }) => {
        const ev = elevations.find((e) => e.side === value)
        const done = Boolean(ev?.photo_document_id)
        return (
          <div
            key={value}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                backgroundColor: done ? C.teal : C.borderStrong,
                border: done ? 'none' : `2px solid ${C.borderStrong}`,
                display: 'block',
                transition: 'background-color 0.2s ease',
              }}
              aria-label={done ? `${label} complete` : `${label} incomplete`}
            />
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: done ? C.teal : C.slate,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                transition: 'color 0.2s ease',
              }}
            >
              {label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function ElevationsStep({
  token,
  elevations,
  onSaveElevation,
  onContinue,
  onBack,
  loading,
  error,
}: ElevationsStepProps) {
  const [activeSide, setActiveSide] = useState<ElevationSide>('front')

  const activeElevation = elevations.find((e) => e.side === activeSide)
  const allSidesHavePhoto = SIDES.every((s) =>
    elevations.some((e) => e.side === s.value && e.photo_document_id !== null),
  )
  const isDisabled = loading || !allSidesHavePhoto

  const hasDamage = activeElevation?.has_damage ?? false

  return (
    <div style={styles.container}>
      <div style={styles.inner}>

        {/* ── Header ── */}
        <div style={styles.header}>
          <div style={styles.headerAccent} />
          <div style={styles.headerAccent2} />
          <div style={styles.stepBadge}>
            <span style={styles.stepBadgeText}>Step 2 of 5</span>
          </div>
          <h1 style={styles.headerTitle}>Elevations</h1>
          <p style={styles.headerSubtitle}>Photo each side of the property</p>
        </div>

        {/* ── Tab strip ── */}
        <div style={styles.tabStrip} role="tablist" aria-label="Elevation sides">
          {SIDES.map(({ value, label }) => {
            const ev = elevations.find((e) => e.side === value)
            return (
              <TabButton
                key={value}
                side={value}
                label={label}
                active={activeSide === value}
                hasPhoto={Boolean(ev?.photo_document_id)}
                onClick={() => setActiveSide(value)}
              />
            )
          })}
        </div>

        {/* ── Tab panel ── */}
        <div
          id={`panel-${activeSide}`}
          role="tabpanel"
          aria-label={`${activeSide} elevation`}
        >

          {/* Photo upload */}
          <div style={styles.section}>
            <div style={styles.sectionLabel}>
              <span style={styles.sectionLabelDot} />
              Photo
            </div>
            <PhotoUploadZone
              key={activeSide}
              side={activeSide}
              elevation={activeElevation}
              token={token}
              onSaveElevation={onSaveElevation}
            />
          </div>

          {/* Damage toggle */}
          <div style={styles.section}>
            <div style={styles.sectionLabel}>
              <span style={styles.sectionLabelDot} />
              Was there damage on this side?
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              {(['yes', 'no'] as const).map((opt) => {
                const isYes = opt === 'yes'
                const isActive = isYes ? hasDamage : !hasDamage
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => void onSaveElevation(activeSide, { has_damage: isYes })}
                    style={{
                      flex: 1,
                      height: 44,
                      borderRadius: 10,
                      border: isActive ? `2px solid ${C.teal}` : `2px solid ${C.border}`,
                      backgroundColor: isActive ? C.teal : C.white,
                      color: isActive ? C.white : C.navyMid,
                      fontSize: 14,
                      fontWeight: 800,
                      cursor: 'pointer',
                      outline: 'none',
                      WebkitTapHighlightColor: 'transparent',
                      fontFamily: 'inherit',
                      letterSpacing: '0.04em',
                      transition: 'all 0.15s ease',
                      boxShadow: isActive ? `0 0 0 3px rgba(13,148,136,0.15)` : '0 1px 3px rgba(0,0,0,0.06)',
                    }}
                    aria-pressed={isActive}
                  >
                    {opt.toUpperCase()}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Damage fields — only when has_damage === true */}
          {hasDamage && (
            <div style={styles.section}>
              <div style={styles.sectionLabel}>
                <span style={styles.sectionLabelDot} />
                Damage details
              </div>
              <DamageFields
                key={activeSide}
                side={activeSide}
                elevation={activeElevation}
                onSaveElevation={onSaveElevation}
              />
            </div>
          )}

        </div>

        {/* ── Progress dots ── */}
        <ProgressDots elevations={elevations} />

        {/* ── Error ── */}
        {error && (
          <div style={styles.errorBox} role="alert">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke={C.errorText}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ flexShrink: 0, marginTop: 1 }}
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p style={styles.errorTextStyle}>{error}</p>
          </div>
        )}

        {/* ── Navigation ── */}
        <div style={styles.ctaWrap}>

          {/* Back button */}
          <button
            type="button"
            onClick={onBack}
            style={{
              background: 'none',
              border: 'none',
              padding: '0 0 14px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              color: C.slate,
              fontSize: 13,
              fontWeight: 600,
              fontFamily: 'inherit',
              outline: 'none',
              WebkitTapHighlightColor: 'transparent',
            }}
            aria-label="Go back"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M11 17l-5-5m0 0l5-5m-5 5h12" />
            </svg>
            Back
          </button>

          {/* Continue CTA */}
          <button
            type="button"
            onClick={onContinue}
            disabled={isDisabled}
            aria-disabled={isDisabled}
            style={{
              width: '100%',
              height: 54,
              borderRadius: 14,
              border: 'none',
              backgroundColor: isDisabled ? '#FED7AA' : C.orange,
              color: isDisabled ? '#FDBA74' : C.white,
              fontSize: 16,
              fontWeight: 800,
              cursor: isDisabled ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              transition: 'background-color 0.15s ease, transform 0.1s ease, box-shadow 0.15s ease',
              boxShadow: isDisabled ? 'none' : '0 4px 14px rgba(249,115,22,0.35)',
              letterSpacing: '0.01em',
              fontFamily: 'inherit',
              outline: 'none',
              WebkitTapHighlightColor: 'transparent',
            }}
            onMouseDown={(e) => {
              if (!isDisabled) {
                const el = e.currentTarget
                el.style.transform = 'scale(0.98)'
                el.style.boxShadow = '0 2px 8px rgba(249,115,22,0.25)'
              }
            }}
            onMouseUp={(e) => {
              if (!isDisabled) {
                const el = e.currentTarget
                el.style.transform = 'scale(1)'
                el.style.boxShadow = '0 4px 14px rgba(249,115,22,0.35)'
              }
            }}
            onMouseLeave={(e) => {
              if (!isDisabled) {
                const el = e.currentTarget
                el.style.transform = 'scale(1)'
                el.style.boxShadow = '0 4px 14px rgba(249,115,22,0.35)'
              }
            }}
          >
            {loading ? (
              <>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  style={{ animation: 'spin 0.8s linear infinite' }}
                >
                  <path d="M21 12a9 9 0 11-6.219-8.56" strokeLinecap="round" />
                </svg>
                Saving...
              </>
            ) : (
              <>
                Continue
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </>
            )}
          </button>

          {/* Hint text when disabled */}
          {!allSidesHavePhoto && (
            <p
              style={{
                textAlign: 'center',
                fontSize: 12,
                color: C.slate,
                marginTop: 10,
                fontWeight: 500,
              }}
            >
              Upload photos for all 4 sides to continue
            </p>
          )}
        </div>

      </div>

      {/* Spin keyframe injected inline */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
