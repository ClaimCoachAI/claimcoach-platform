import type { QuickSetupData, PropertyType } from '../types'

interface QuickSetupStepProps {
  propertyAddress: string
  data: QuickSetupData
  onChange: (data: QuickSetupData) => void
  onContinue: () => void
  loading: boolean
  error: string | null
}

// ─── Design tokens ────────────────────────────────────────────────────────────
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

// ─── Property type config ──────────────────────────────────────────────────────
const PROPERTY_TYPES: Array<{
  value: PropertyType
  label: string
  shortLabel: string
  icon: React.ReactNode
}> = [
  {
    value: 'sfh',
    label: 'Single Family',
    shortLabel: 'SFH',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
        <polyline points="9,22 9,12 15,12 15,22" />
      </svg>
    ),
  },
  {
    value: 'duplex',
    label: 'Duplex',
    shortLabel: 'Duplex',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 11l5-4 5 4v9H1z" />
        <path d="M13 11l5-4 5 4v9h-10z" />
        <line x1="4" y1="20" x2="4" y2="16" />
        <line x1="8" y1="20" x2="8" y2="16" />
        <line x1="16" y1="20" x2="16" y2="16" />
        <line x1="20" y1="20" x2="20" y2="16" />
      </svg>
    ),
  },
  {
    value: 'small_mf',
    label: 'Small Multi-Family',
    shortLabel: 'Small MF',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="7" width="18" height="14" rx="1" />
        <path d="M3 11h18" />
        <path d="M3 15h18" />
        <path d="M7 7V5a2 2 0 014 0v2" />
        <path d="M13 7V5a2 2 0 014 0v2" />
      </svg>
    ),
  },
  {
    value: 'mf',
    label: 'Multi-Family',
    shortLabel: 'MF',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="18" rx="1" />
        <path d="M2 9h20" />
        <path d="M2 15h20" />
        <path d="M8 3v18" />
        <path d="M16 3v18" />
      </svg>
    ),
  },
  {
    value: 'commercial_light',
    label: 'Commercial',
    shortLabel: 'Commercial',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="6" width="20" height="15" rx="1" />
        <path d="M6 6V4a1 1 0 011-1h10a1 1 0 011 1v2" />
        <rect x="9" y="12" width="6" height="9" />
        <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01" />
      </svg>
    ),
  },
]

// ─── Area config ───────────────────────────────────────────────────────────────
const AREAS: Array<{
  key: keyof QuickSetupData['area_selection']
  label: string
  icon: string
}> = [
  { key: 'include_roof', label: 'Roof', icon: '🏠' },
  { key: 'include_exterior', label: 'Exterior', icon: '🧱' },
  { key: 'include_interior', label: 'Interior', icon: '🛋️' },
  { key: 'include_porch', label: 'Porch / Patio / Fence', icon: '🌿' },
]

// ─── Styles ────────────────────────────────────────────────────────────────────
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

  // ── Header strip ──
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

  // ── Address bar ──
  addressRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.white,
    border: `1px solid ${C.border}`,
    borderRadius: 12,
    padding: '11px 14px',
    margin: '16px 16px 0',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  } as React.CSSProperties,

  addressIcon: {
    flexShrink: 0,
    color: C.teal,
    display: 'flex',
    alignItems: 'center',
  } as React.CSSProperties,

  addressText: {
    flex: 1,
    fontSize: 13,
    fontWeight: 600,
    color: C.navy,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    cursor: 'default',
    padding: 0,
    fontFamily: 'inherit',
  } as React.CSSProperties,

  // ── Sections ──
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

  // ── Property type grid ──
  propTypeGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    gap: 8,
  } as React.CSSProperties,

  // ── Stories row ──
  storiesRow: {
    display: 'flex',
    gap: 8,
  } as React.CSSProperties,

  // ── Area checkboxes ──
  areaList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
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

  errorText: {
    fontSize: 13,
    color: C.errorText,
    fontWeight: 500,
    lineHeight: 1.4,
  } as React.CSSProperties,

  // ── CTA ──
  ctaWrap: {
    padding: '20px 16px 0',
  } as React.CSSProperties,
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function PropertyTypeCard({
  item,
  selected,
  onClick,
}: {
  item: (typeof PROPERTY_TYPES)[number]
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        padding: '10px 4px',
        borderRadius: 12,
        border: selected ? `2px solid ${C.teal}` : `2px solid ${C.border}`,
        backgroundColor: selected ? C.tealDim : C.white,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        boxShadow: selected
          ? `0 0 0 3px rgba(13,148,136,0.12), 0 2px 8px rgba(13,148,136,0.15)`
          : '0 1px 3px rgba(0,0,0,0.06)',
        outline: 'none',
        WebkitTapHighlightColor: 'transparent',
        minHeight: 82,
      }}
      aria-pressed={selected}
      aria-label={item.label}
    >
      <span style={{ color: selected ? C.teal : C.slate, transition: 'color 0.15s' }}>
        {item.icon}
      </span>
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: selected ? C.teal : C.navyMid,
          letterSpacing: '0.02em',
          textAlign: 'center',
          lineHeight: 1.2,
          transition: 'color 0.15s',
        }}
      >
        {item.shortLabel}
      </span>
      {selected && (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            backgroundColor: C.teal,
            display: 'block',
          }}
        />
      )}
    </button>
  )
}

function StoryPill({
  n,
  selected,
  onClick,
}: {
  n: number
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        height: 44,
        borderRadius: 10,
        border: selected ? `2px solid ${C.teal}` : `2px solid ${C.border}`,
        backgroundColor: selected ? C.tealDim : C.white,
        color: selected ? C.teal : C.navyMid,
        fontSize: 16,
        fontWeight: 700,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        boxShadow: selected ? `0 0 0 3px rgba(13,148,136,0.12)` : '0 1px 3px rgba(0,0,0,0.06)',
        outline: 'none',
        WebkitTapHighlightColor: 'transparent',
        fontFamily: 'inherit',
      }}
      aria-pressed={selected}
      aria-label={`${n} ${n === 1 ? 'story' : 'stories'}`}
    >
      {n}
    </button>
  )
}

function AreaCheckbox({
  label,
  icon,
  checked,
  onChange,
}: {
  label: string
  icon: string
  checked: boolean
  onChange: () => void
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onChange}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        padding: '13px 14px',
        borderRadius: 12,
        border: checked ? `2px solid ${C.teal}` : `2px solid ${C.border}`,
        backgroundColor: checked ? C.tealDim : C.white,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        boxShadow: checked
          ? `0 0 0 3px rgba(13,148,136,0.10), 0 2px 6px rgba(13,148,136,0.10)`
          : '0 1px 3px rgba(0,0,0,0.05)',
        textAlign: 'left',
        outline: 'none',
        WebkitTapHighlightColor: 'transparent',
        fontFamily: 'inherit',
      }}
    >
      {/* Custom checkbox */}
      <span
        style={{
          flexShrink: 0,
          width: 22,
          height: 22,
          borderRadius: 6,
          border: checked ? `2px solid ${C.teal}` : `2px solid ${C.borderStrong}`,
          backgroundColor: checked ? C.teal : C.white,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.15s ease',
        }}
      >
        {checked && (
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path
              d="M2 6.5L5 9.5L11 3.5"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>

      {/* Icon */}
      <span style={{ fontSize: 20, flexShrink: 0, lineHeight: 1 }}>{icon}</span>

      {/* Label */}
      <span
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: checked ? C.teal : C.navy,
          transition: 'color 0.15s',
          flex: 1,
        }}
      >
        {label}
      </span>

      {/* Right indicator when checked */}
      {checked && (
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: C.teal,
            backgroundColor: C.tealLight,
            borderRadius: 6,
            padding: '2px 7px',
            flexShrink: 0,
          }}
        >
          Added
        </span>
      )}
    </button>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function QuickSetupStep({
  propertyAddress,
  data,
  onChange,
  onContinue,
  loading,
  error,
}: QuickSetupStepProps) {
  const anyAreaChecked = Object.values(data.area_selection).some(Boolean)
  const isDisabled = loading || !anyAreaChecked

  return (
    <div style={styles.container}>
      <div style={styles.inner}>

        {/* ── Header ── */}
        <div style={styles.header}>
          <div style={styles.headerAccent} />
          <div style={styles.headerAccent2} />
          <div style={styles.stepBadge}>
            <span style={styles.stepBadgeText}>Step 1 of 5</span>
          </div>
          <h1 style={styles.headerTitle}>Quick Setup</h1>
          <p style={styles.headerSubtitle}>Tell us about the property</p>
        </div>

        {/* ── Address bar ── */}
        <div style={styles.addressRow}>
          <span style={styles.addressIcon}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.teal} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
          </span>
          <input
            readOnly
            tabIndex={-1}
            value={propertyAddress}
            style={styles.addressText}
            aria-label="Property address"
          />
        </div>

        {/* ── Property Type ── */}
        <div style={styles.section}>
          <div style={styles.sectionLabel}>
            <span style={styles.sectionLabelDot} />
            Property type
          </div>
          <div style={styles.propTypeGrid}>
            {PROPERTY_TYPES.map(item => (
              <PropertyTypeCard
                key={item.value}
                item={item}
                selected={data.property_type === item.value}
                onClick={() => onChange({ ...data, property_type: item.value })}
              />
            ))}
          </div>
        </div>

        {/* ── Stories ── */}
        <div style={styles.section}>
          <div style={styles.sectionLabel}>
            <span style={styles.sectionLabelDot} />
            Stories
          </div>
          <div style={styles.storiesRow}>
            {[1, 2, 3, 4, 5].map(n => (
              <StoryPill
                key={n}
                n={n}
                selected={data.stories === n}
                onClick={() => onChange({ ...data, stories: n })}
              />
            ))}
          </div>
        </div>

        {/* ── Areas affected ── */}
        <div style={styles.section}>
          <div style={styles.sectionLabel}>
            <span style={styles.sectionLabelDot} />
            Areas affected
          </div>
          <div style={styles.areaList}>
            {AREAS.map(area => (
              <AreaCheckbox
                key={area.key}
                label={area.label}
                icon={area.icon}
                checked={data.area_selection[area.key]}
                onChange={() =>
                  onChange({
                    ...data,
                    area_selection: {
                      ...data.area_selection,
                      [area.key]: !data.area_selection[area.key],
                    },
                  })
                }
              />
            ))}
          </div>
        </div>

        {/* ── Error ── */}
        {error && (
          <div style={styles.errorBox} role="alert">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.errorText} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p style={styles.errorText}>{error}</p>
          </div>
        )}

        {/* ── Continue button ── */}
        <div style={styles.ctaWrap}>
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
            onMouseDown={e => {
              if (!isDisabled) {
                const el = e.currentTarget
                el.style.transform = 'scale(0.98)'
                el.style.boxShadow = '0 2px 8px rgba(249,115,22,0.25)'
              }
            }}
            onMouseUp={e => {
              if (!isDisabled) {
                const el = e.currentTarget
                el.style.transform = 'scale(1)'
                el.style.boxShadow = '0 4px 14px rgba(249,115,22,0.35)'
              }
            }}
            onMouseLeave={e => {
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
                  style={{
                    animation: 'spin 0.8s linear infinite',
                  }}
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

          {!anyAreaChecked && (
            <p
              style={{
                textAlign: 'center',
                fontSize: 12,
                color: C.slate,
                marginTop: 10,
                fontWeight: 500,
              }}
            >
              Select at least one area to continue
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
