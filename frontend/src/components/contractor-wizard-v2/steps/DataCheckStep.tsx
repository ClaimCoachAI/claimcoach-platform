import React, { useState } from 'react'
import type {
  QuickSetupData,
  ElevationData,
  ElevationSide,
  RoofData,
  InspectionRoom,
} from '../types'

// ── Types ─────────────────────────────────────────────────────────────────────

interface DataCheckStepProps {
  quickSetup: QuickSetupData
  elevations: ElevationData[]
  roofSections: RoofData[]
  rooms: InspectionRoom[]
  elevationLoading: boolean
  roofLoading: boolean
  roomsLoading: boolean
  submittedAt: string | null
  onSubmit: () => Promise<boolean>
  onBack: () => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const SIDE_LABELS: Record<ElevationSide, string> = {
  front: 'Front',
  right: 'Right',
  back: 'Back',
  left: 'Left',
}

function formatSubmittedAt(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    + ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

// ── SuccessScreen ─────────────────────────────────────────────────────────────

function SuccessScreen({ submittedAt }: { submittedAt: string }) {
  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    backgroundColor: '#f9fafb',
    padding: '32px 24px',
    textAlign: 'center',
  }

  return (
    <div style={containerStyle}>
      <div style={{ fontSize: '64px', marginBottom: '24px' }}>✅</div>
      <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#111827', margin: '0 0 12px' }}>
        Inspection Submitted
      </h1>
      <p style={{ fontSize: '15px', color: '#6b7280', lineHeight: 1.6, maxWidth: '280px', margin: '0 0 24px' }}>
        Your inspection report has been submitted successfully. The claims team will review it and be in touch soon.
      </p>
      <p style={{ fontSize: '13px', color: '#9ca3af' }}>
        Submitted {formatSubmittedAt(submittedAt)}
      </p>
    </div>
  )
}

// ── SectionCard ───────────────────────────────────────────────────────────────

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      backgroundColor: '#ffffff',
      border: '1px solid #e5e7eb',
      borderRadius: '12px',
      padding: '16px',
    }}>
      <p style={{ fontSize: '13px', fontWeight: 600, color: '#6b7280', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {title}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {children}
      </div>
    </div>
  )
}

function Row({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: '14px', color: '#374151' }}>
        {warn && <span style={{ marginRight: '6px' }}>⚠</span>}
        {label}
      </span>
      <span style={{ fontSize: '13px', color: warn ? '#d97706' : '#6b7280' }}>{value}</span>
    </div>
  )
}

// ── DataCheckStep ─────────────────────────────────────────────────────────────

export default function DataCheckStep({
  quickSetup,
  elevations,
  roofSections,
  rooms,
  elevationLoading,
  roofLoading,
  roomsLoading,
  submittedAt,
  onSubmit,
  onBack,
}: DataCheckStepProps) {
  const [submitting, setSubmitting] = useState(false)

  // Already submitted — show success screen immediately.
  if (submittedAt) return <SuccessScreen submittedAt={submittedAt} />

  const { include_exterior, include_roof, include_interior } = quickSetup.area_selection

  // Compute warnings (soft — never blocks submit).
  const warnings: string[] = []
  if (include_exterior) {
    const ALL_SIDES: ElevationSide[] = ['front', 'right', 'back', 'left']
    ALL_SIDES.forEach(side => {
      const elev = elevations.find(e => e.side === side)
      if (!elev || !elev.photo_document_id) warnings.push(`${SIDE_LABELS[side]} elevation has no photo`)
    })
  }
  if (include_interior) {
    rooms.forEach(room => {
      if (room.photos.length === 0) warnings.push(`"${room.name}" has no photos`)
    })
  }

  const anyLoading = elevationLoading || roofLoading || roomsLoading

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      await onSubmit()
    } finally {
      setSubmitting(false)
    }
  }

  // ── Styles ──────────────────────────────────────────────────────────────────

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100vh',
    backgroundColor: '#f9fafb',
  }

  const headerStyle: React.CSSProperties = {
    padding: '20px 16px 12px',
    backgroundColor: '#ffffff',
    borderBottom: '1px solid #e5e7eb',
  }

  const bodyStyle: React.CSSProperties = {
    flex: 1,
    overflowY: 'auto',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  }

  const footerStyle: React.CSSProperties = {
    padding: '16px',
    backgroundColor: '#ffffff',
    borderTop: '1px solid #e5e7eb',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  }

  const warningBannerStyle: React.CSSProperties = {
    padding: '10px 14px',
    borderRadius: '8px',
    backgroundColor: '#fffbeb',
    border: '1px solid #fcd34d',
    fontSize: '13px',
    color: '#92400e',
    lineHeight: 1.5,
  }

  const backBtnStyle: React.CSSProperties = {
    flex: 1,
    padding: '14px',
    borderRadius: '10px',
    border: '1px solid #d1d5db',
    backgroundColor: '#ffffff',
    fontSize: '15px',
    cursor: 'pointer',
  }

  const submitBtnStyle: React.CSSProperties = {
    flex: 2,
    padding: '14px',
    borderRadius: '10px',
    border: 'none',
    backgroundColor: submitting ? '#9ca3af' : '#2563eb',
    color: '#ffffff',
    fontSize: '15px',
    fontWeight: 600,
    cursor: submitting ? 'not-allowed' : 'pointer',
  }

  const btnRowStyle: React.CSSProperties = {
    display: 'flex',
    gap: '12px',
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>Step 5 of 5</p>
        <h2 style={{ fontSize: '20px', fontWeight: 700, margin: '4px 0 0', color: '#111827' }}>
          Review &amp; Submit
        </h2>
      </div>

      {/* Body */}
      <div style={bodyStyle}>
        {anyLoading && (
          <p style={{ color: '#6b7280', fontSize: '14px', textAlign: 'center' }}>Loading summary…</p>
        )}

        {/* Property */}
        <SectionCard title="Property">
          <Row
            label={quickSetup.property_type ?? 'Unknown type'}
            value={quickSetup.stories ? `${quickSetup.stories} ${quickSetup.stories === 1 ? 'story' : 'stories'}` : '—'}
          />
        </SectionCard>

        {/* Exterior */}
        {include_exterior && (
          <SectionCard title="Exterior">
            {(['front', 'right', 'back', 'left'] as ElevationSide[]).map(side => {
              const elev = elevations.find(e => e.side === side)
              const hasPhoto = !!elev?.photo_document_id
              const hasDamage = elev?.has_damage ?? false
              return (
                <Row
                  key={side}
                  label={SIDE_LABELS[side]}
                  value={hasPhoto ? (hasDamage ? '1 photo · damage' : '1 photo') : 'no photo'}
                  warn={!hasPhoto}
                />
              )
            })}
          </SectionCard>
        )}

        {/* Roof */}
        {include_roof && (
          <SectionCard title={`Roof (${roofSections.length} section${roofSections.length !== 1 ? 's' : ''})`}>
            {roofSections.length === 0 ? (
              <Row label="No roof sections" value="—" warn />
            ) : (
              roofSections.map((section) => {
                const photoCount = [section.overview_photo_id, section.slope_photo_id, section.shingles_photo_id, section.ridge_photo_id].filter(Boolean).length
                const label = (section.section_type === 'other' && section.section_custom_name)
                  ? section.section_custom_name
                  : (section.section_type?.replace('_', ' ') ?? 'Section')
                return (
                  <Row
                    key={section.id}
                    label={label}
                    value={`${photoCount}/4 photos`}
                    warn={photoCount < 4}
                  />
                )
              })
            )}
          </SectionCard>
        )}

        {/* Interior */}
        {include_interior && (
          <SectionCard title={`Rooms / Interior (${rooms.length})`}>
            {rooms.length === 0 ? (
              <Row label="No rooms added" value="—" warn />
            ) : (
              rooms.map(room => {
                const photoCount = room.photos.length
                return (
                  <Row
                    key={room.id}
                    label={room.name}
                    value={photoCount === 0 ? 'no photos' : `${photoCount} ${photoCount === 1 ? 'photo' : 'photos'}`}
                    warn={photoCount === 0}
                  />
                )
              })
            )}
          </SectionCard>
        )}
      </div>

      {/* Footer */}
      <div style={footerStyle}>
        {warnings.length > 0 && (
          <div style={warningBannerStyle}>
            ⚠ Some areas are missing photos. You can submit anyway, or go back to add them.
          </div>
        )}
        <div style={btnRowStyle}>
          <button type="button" style={backBtnStyle} onClick={onBack} disabled={submitting}>
            ← Back
          </button>
          <button
            type="button"
            style={submitBtnStyle}
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? 'Submitting…' : 'Submit Inspection →'}
          </button>
        </div>
      </div>
    </div>
  )
}
