import React, { useState, useCallback, useEffect, useRef } from 'react'
import type {
  RoofData, RoofDamageSpot, RoofPhotoSlot,
  Pitch, RoofShingleType, DeckingCondition,
  CreateRoofSectionInput, RoofSectionType, PenetrationRange, RoofComplexity,
} from '../types'
import { usePhotoUpload } from '../usePhotoUpload'

// ─── Props ────────────────────────────────────────────────────────────────────
interface RoofStepProps {
  token: string
  roofSections: RoofData[]
  roofLoading: boolean
  onCreateRoofSection: (input: CreateRoofSectionInput) => Promise<RoofData | null>
  onUpdateRoofSection: (roofId: string, data: Partial<RoofData>) => void
  onDeleteRoofSection: (roofId: string) => Promise<void>
  onAddDamageSpot: (roofId: string, photoDocumentId: string | null, caption: string | null) => Promise<RoofDamageSpot | null>
  onDeleteDamageSpot: (roofId: string, spotId: string) => Promise<void>
  onContinue: () => void
  onBack: () => void
}

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  teal: '#0D9488', tealLight: '#CCFBF1', tealDim: 'rgba(13,148,136,0.12)',
  orange: '#F97316', navy: '#0F172A', navyMid: '#334155', slate: '#64748B',
  border: '#E2E8F0', borderStrong: '#CBD5E1', bg: '#F8FAFC', white: '#FFFFFF',
  errorBg: '#FFF1F2', errorBorder: '#FECDD3', errorText: '#BE123C',
}

// ─── Config ───────────────────────────────────────────────────────────────────
const PHOTO_SLOTS: Array<{ key: RoofPhotoSlot; label: string; photoIdField: keyof RoofData; photoUrlField: keyof RoofData }> = [
  { key: 'overview',  label: 'Overview',  photoIdField: 'overview_photo_id',  photoUrlField: 'overview_photo_url' },
  { key: 'slope',     label: 'Slope',     photoIdField: 'slope_photo_id',     photoUrlField: 'slope_photo_url' },
  { key: 'shingles',  label: 'Shingles',  photoIdField: 'shingles_photo_id',  photoUrlField: 'shingles_photo_url' },
  { key: 'ridge',     label: 'Ridge',     photoIdField: 'ridge_photo_id',     photoUrlField: 'ridge_photo_url' },
]

const PITCH_OPTIONS: Array<{ value: Pitch; label: string }> = [
  { value: 'flat',       label: 'Flat' },
  { value: '2_12',       label: '2/12' },
  { value: '4_12',       label: '4/12' },
  { value: '6_12',       label: '6/12' },
  { value: '8_12',       label: '8/12' },
  { value: '10_12',      label: '10/12' },
  { value: '12_12_plus', label: '12/12+' },
]

const SHINGLE_OPTIONS: Array<{ value: RoofShingleType; label: string }> = [
  { value: '3tab',           label: '3-Tab' },
  { value: 'architectural',  label: 'Architectural' },
  { value: 'metal',          label: 'Metal' },
  { value: 'tile',           label: 'Tile' },
  { value: 'tpo',            label: 'TPO' },
  { value: 'other',          label: 'Other' },
]

const DECKING_OPTIONS: Array<{ value: DeckingCondition; label: string }> = [
  { value: 'good',          label: 'Good' },
  { value: 'soft_spots',    label: 'Soft Spots' },
  { value: 'needs_replace', label: 'Needs Replacement' },
]

const SECTION_TYPE_OPTIONS: Array<{ value: RoofSectionType; label: string }> = [
  { value: 'main_house', label: 'Main House' },
  { value: 'garage',     label: 'Garage' },
  { value: 'patio',      label: 'Patio' },
  { value: 'carport',    label: 'Carport' },
  { value: 'flat_roof',  label: 'Flat Roof' },
  { value: 'other',      label: 'Other' },
]

const PENETRATION_OPTIONS: Array<{ value: PenetrationRange; label: string }> = [
  { value: '0_3',    label: '0–3' },
  { value: '4_7',    label: '4–7' },
  { value: '8_plus', label: '8+' },
]

const COMPLEXITY_OPTIONS: Array<{ value: RoofComplexity; label: string }> = [
  { value: 'simple',   label: 'Simple' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'complex',  label: 'Complex' },
]

function getSectionLabel(r: RoofData): string {
  if (r.section_type === 'other' && r.section_custom_name) return r.section_custom_name
  return SECTION_TYPE_OPTIONS.find(o => o.value === r.section_type)?.label ?? 'Roof Section'
}

function isSectionDone(r: RoofData): boolean {
  return Boolean(r.overview_photo_id && r.slope_photo_id && r.shingles_photo_id && r.ridge_photo_id)
}

// ─── NamedPhotoSlot ───────────────────────────────────────────────────────────
function NamedPhotoSlot({
  slotKey: _slotKey, label, token, photoId, photoUrl, onUpdate, photoIdField,
}: {
  slotKey: RoofPhotoSlot
  label: string
  token: string
  photoId: string | null
  photoUrl: string | null
  onUpdate: (data: Partial<RoofData>) => void
  photoIdField: keyof RoofData
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { uploadPhoto, uploading, uploadError, clearUploadError } = usePhotoUpload(token)

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      e.target.value = ''
      clearUploadError()
      const result = await uploadPhoto(file)
      if (result) {
        onUpdate({ [photoIdField]: result.documentId } as Partial<RoofData>)
      }
    },
    [uploadPhoto, onUpdate, clearUploadError, photoIdField],
  )

  const hasPhoto = Boolean(photoId)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/heic"
        style={{ display: 'none' }}
        onChange={handleFileChange}
        aria-hidden="true"
      />

      <div
        style={{
          position: 'relative',
          borderRadius: 12,
          overflow: 'hidden',
          border: hasPhoto ? `2px solid ${C.teal}` : `2px dashed ${C.borderStrong}`,
          backgroundColor: hasPhoto ? 'transparent' : C.white,
          aspectRatio: '1 / 1',
          cursor: uploading ? 'default' : 'pointer',
          boxSizing: 'border-box',
        }}
        onClick={() => !uploading && fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label={`Upload ${label} photo`}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click() }}
      >
        {!hasPhoto && !uploading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 6, padding: 8 }}>
            <span style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: C.tealDim, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.teal }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </span>
          </div>
        )}

        {uploading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', backgroundColor: C.tealDim }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.teal} strokeWidth="2.5" style={{ animation: 'spin 0.8s linear infinite' }}>
              <path d="M21 12a9 9 0 11-6.219-8.56" strokeLinecap="round" />
            </svg>
          </div>
        )}

        {hasPhoto && !uploading && (
          <>
            {photoUrl ? (
              <img src={photoUrl} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', backgroundColor: C.tealDim }}>
                <span style={{ width: 32, height: 32, borderRadius: '50%', backgroundColor: C.teal, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.white, fontSize: 18, fontWeight: 800 }}>✓</span>
              </div>
            )}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}
              style={{ position: 'absolute', bottom: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.55)', border: 'none', borderRadius: 6, padding: '3px 7px', color: C.white, fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', outline: 'none' }}
              aria-label={`Replace ${label} photo`}
            >
              Replace
            </button>
          </>
        )}
      </div>

      <span style={{ fontSize: 11, fontWeight: 700, color: hasPhoto ? C.teal : C.slate, textTransform: 'uppercase', letterSpacing: '0.07em', textAlign: 'center' }}>
        {label}
        {hasPhoto && ' ✓'}
      </span>

      {uploadError && (
        <p style={{ fontSize: 11, color: C.errorText, margin: 0, textAlign: 'center' }}>{uploadError}</p>
      )}
    </div>
  )
}

// ─── DamagePhotoGallery ────────────────────────────────────────────────────────
function DamagePhotoGallery({
  token, spots, onAdd, onDelete,
}: {
  token: string
  spots: RoofDamageSpot[]
  onAdd: (photoDocumentId: string | null, caption: string | null) => Promise<RoofDamageSpot | null>
  onDelete: (spotId: string) => Promise<void>
}) {
  const { uploadPhoto, uploading } = usePhotoUpload(token)

  const handleAdd = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const result = await uploadPhoto(file)
    if (result) {
      await onAdd(result.documentId, null)
    }
  }, [uploadPhoto, onAdd])

  const fileInputRef = useRef<HTMLInputElement>(null)

  return (
    <div>
      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/heic" style={{ display: 'none' }} onChange={handleAdd} aria-hidden="true" />
      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4, WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        {spots.map((spot) => (
          <div key={spot.id} style={{ position: 'relative', flexShrink: 0, width: 80, height: 80, borderRadius: 10, overflow: 'hidden', border: `2px solid ${C.teal}` }}>
            {spot.photo_url ? (
              <img src={spot.photo_url} alt="damage" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{ width: '100%', height: '100%', backgroundColor: C.tealDim, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.teal, fontSize: 20 }}>✓</div>
            )}
            <button
              type="button"
              onClick={() => void onDelete(spot.id)}
              style={{ position: 'absolute', top: 2, right: 2, width: 18, height: 18, borderRadius: '50%', backgroundColor: 'rgba(0,0,0,0.6)', border: 'none', color: C.white, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, fontFamily: 'inherit', outline: 'none', padding: 0 }}
              aria-label="Delete damage photo"
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          style={{ flexShrink: 0, width: 80, height: 80, borderRadius: 10, border: `2px dashed ${C.borderStrong}`, backgroundColor: C.white, cursor: uploading ? 'not-allowed' : 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, outline: 'none', fontFamily: 'inherit' }}
          aria-label="Add damage photo"
        >
          {uploading ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.teal} strokeWidth="2.5" style={{ animation: 'spin 0.8s linear infinite' }}>
              <path d="M21 12a9 9 0 11-6.219-8.56" strokeLinecap="round" />
            </svg>
          ) : (
            <>
              <span style={{ fontSize: 20, lineHeight: 1, color: C.slate }}>+</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: C.slate, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Add</span>
            </>
          )}
        </button>
      </div>
    </div>
  )
}

// ─── SectionDetailForm ────────────────────────────────────────────────────────
function SectionDetailForm({
  token, section, damageSpots,
  onUpdate, onAddDamageSpot, onDeleteDamageSpot, onDeleteSection, onBack,
}: {
  token: string
  section: RoofData
  damageSpots: RoofDamageSpot[]
  onUpdate: (data: Partial<RoofData>) => void
  onAddDamageSpot: (photoDocumentId: string | null, caption: string | null) => Promise<RoofDamageSpot | null>
  onDeleteDamageSpot: (spotId: string) => Promise<void>
  onDeleteSection: () => Promise<void>
  onBack: () => void
}) {
  const [localLayers, setLocalLayers] = useState<string>(section.layers != null ? String(section.layers) : '')
  const [localSquares, setLocalSquares] = useState<string>(section.squares != null ? String(section.squares) : '')
  const [localNotes, setLocalNotes] = useState<string>(section.notes ?? '')

  // Reset local inputs when section changes
  useEffect(() => {
    setLocalLayers(section.layers != null ? String(section.layers) : '')
    setLocalSquares(section.squares != null ? String(section.squares) : '')
    setLocalNotes(section.notes ?? '')
  }, [section.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const anyDamage = Boolean(section.has_ridge_damage || section.has_valley_damage || section.has_flashing_damage)

  const sectionLabelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 800, color: C.slate, letterSpacing: '0.09em',
    textTransform: 'uppercase', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6,
  }
  const sectionDot: React.CSSProperties = {
    width: 6, height: 6, borderRadius: '50%', backgroundColor: C.teal, flexShrink: 0,
  }
  const pillBtn = (isActive: boolean): React.CSSProperties => ({
    flexShrink: 0, height: 34, padding: '0 14px', borderRadius: 20,
    border: isActive ? `2px solid ${C.teal}` : `2px solid ${C.border}`,
    backgroundColor: isActive ? C.teal : C.white,
    color: isActive ? C.white : C.navyMid,
    fontSize: 12, fontWeight: 700, cursor: 'pointer', outline: 'none',
    WebkitTapHighlightColor: 'transparent', fontFamily: 'inherit',
    transition: 'all 0.15s ease', whiteSpace: 'nowrap' as const,
  })
  const damageToggle = (isActive: boolean | null): React.CSSProperties => ({
    flex: 1, height: 40, borderRadius: 8,
    border: isActive === null ? `1.5px solid ${C.border}` : isActive ? `2px solid ${C.teal}` : `2px solid ${C.border}`,
    backgroundColor: isActive === null ? C.white : isActive ? C.teal : C.white,
    color: isActive ? C.white : C.navyMid,
    fontSize: 13, fontWeight: 800, cursor: 'pointer', outline: 'none',
    WebkitTapHighlightColor: 'transparent', fontFamily: 'inherit',
    transition: 'all 0.15s ease',
  })
  const inputStyle: React.CSSProperties = {
    width: '100%', height: 44, borderRadius: 10,
    border: `1.5px solid ${C.border}`, backgroundColor: C.white,
    padding: '0 12px', fontSize: 15, fontWeight: 500, color: C.navy, outline: 'none',
    fontFamily: 'inherit', boxSizing: 'border-box', WebkitAppearance: 'none', MozAppearance: 'textfield',
  }
  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: C.slate, letterSpacing: '0.06em',
    textTransform: 'uppercase', display: 'block', marginBottom: 5,
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: C.bg, fontFamily: '"DM Sans","Inter",system-ui,-apple-system,sans-serif' }}>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 0 100px 0' }}>

        {/* Header */}
        <div style={{ background: `linear-gradient(135deg, ${C.navy} 0%, #1E3A5F 100%)`, padding: '20px 20px 28px', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: -40, right: -40, width: 140, height: 140, borderRadius: '50%', background: 'rgba(13,148,136,0.15)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', bottom: -20, left: '30%', width: 80, height: 80, borderRadius: '50%', background: 'rgba(249,115,22,0.10)', pointerEvents: 'none' }} />
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, backgroundColor: 'rgba(13,148,136,0.2)', border: '1px solid rgba(13,148,136,0.4)', borderRadius: 20, padding: '3px 10px', marginBottom: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#5EEAD4', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Step 3 of 5</span>
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: C.white, margin: 0, letterSpacing: '-0.02em', lineHeight: 1.15 }}>Roof</h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginTop: 5, fontWeight: 400 }}>
            {getSectionLabel(section)}
          </p>
        </div>

        {/* 2×2 Photo Grid */}
        <div style={{ padding: '20px 16px 0' }}>
          <div style={sectionLabelStyle}><span style={sectionDot} />Required Photos</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {PHOTO_SLOTS.map((slot) => (
              <NamedPhotoSlot
                key={slot.key}
                slotKey={slot.key}
                label={slot.label}
                token={token}
                photoId={(section[slot.photoIdField] as string | null) ?? null}
                photoUrl={(section[slot.photoUrlField] as string | null) ?? null}
                onUpdate={onUpdate}
                photoIdField={slot.photoIdField}
              />
            ))}
          </div>
        </div>

        {/* Roof Details */}
        <div style={{ padding: '20px 16px 0' }}>
          <div style={sectionLabelStyle}><span style={sectionDot} />Roof Details</div>

          {/* Pitch */}
          <label style={labelStyle}>Pitch</label>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 12, WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            {PITCH_OPTIONS.map((opt) => (
              <button key={opt.value} type="button" style={pillBtn(section.pitch === opt.value)} onClick={() => onUpdate({ pitch: opt.value })} aria-pressed={section.pitch === opt.value}>{opt.label}</button>
            ))}
          </div>

          {/* Shingle type */}
          <label style={labelStyle}>Shingle Type</label>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 12, WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            {SHINGLE_OPTIONS.map((opt) => (
              <button key={opt.value} type="button" style={pillBtn(section.shingle_type === opt.value)} onClick={() => onUpdate({ shingle_type: opt.value })} aria-pressed={section.shingle_type === opt.value}>{opt.label}</button>
            ))}
          </div>

          {/* Layers + Squares */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle} htmlFor="roof-layers">Layers</label>
              <input id="roof-layers" type="number" inputMode="numeric" min={1} max={5} value={localLayers}
                onChange={(e) => setLocalLayers(e.target.value)}
                onBlur={() => { const v = parseInt(localLayers, 10); onUpdate({ layers: isNaN(v) ? null : v }) }}
                style={inputStyle} placeholder="1" />
            </div>
            <div>
              <label style={labelStyle} htmlFor="roof-squares">Squares (approx.)</label>
              <input id="roof-squares" type="number" inputMode="numeric" min={0} value={localSquares}
                onChange={(e) => setLocalSquares(e.target.value)}
                onBlur={() => { const v = parseFloat(localSquares); onUpdate({ squares: isNaN(v) ? null : v }) }}
                style={inputStyle} placeholder="24" />
            </div>
          </div>

          {/* Penetrations */}
          <label style={{ ...labelStyle, marginTop: 12 }}>Penetrations</label>
          <div style={{ display: 'flex', gap: 8, paddingBottom: 12 }}>
            {PENETRATION_OPTIONS.map((opt) => (
              <button key={opt.value} type="button" style={pillBtn(section.penetrations === opt.value)} onClick={() => onUpdate({ penetrations: opt.value })} aria-pressed={section.penetrations === opt.value}>{opt.label}</button>
            ))}
          </div>

          {/* Complexity */}
          <label style={labelStyle}>Complexity</label>
          <div style={{ display: 'flex', gap: 8, paddingBottom: 4 }}>
            {COMPLEXITY_OPTIONS.map((opt) => (
              <button key={opt.value} type="button" style={pillBtn(section.complexity === opt.value)} onClick={() => onUpdate({ complexity: opt.value })} aria-pressed={section.complexity === opt.value}>{opt.label}</button>
            ))}
          </div>
        </div>

        {/* Damage */}
        <div style={{ padding: '20px 16px 0' }}>
          <div style={sectionLabelStyle}><span style={sectionDot} />Damage</div>

          {(
            [
              { label: 'Ridge damage', field: 'has_ridge_damage' as const, value: section.has_ridge_damage },
              { label: 'Valley damage', field: 'has_valley_damage' as const, value: section.has_valley_damage },
              { label: 'Flashing damage', field: 'has_flashing_damage' as const, value: section.has_flashing_damage },
            ] as Array<{ label: string; field: 'has_ridge_damage' | 'has_valley_damage' | 'has_flashing_damage'; value: boolean | undefined }>
          ).map(({ label, field, value }) => {
            const current: boolean | null = value === undefined ? null : value
            return (
              <div key={field} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: C.navyMid }}>{label}</span>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button type="button" style={damageToggle(current === true)} onClick={() => onUpdate({ [field]: true })} aria-pressed={current === true}>YES</button>
                  <button type="button" style={damageToggle(current === false ? false : null)} onClick={() => onUpdate({ [field]: false })} aria-pressed={current === false}>NO</button>
                </div>
              </div>
            )
          })}

          {/* Decking condition */}
          <label style={{ ...labelStyle, marginTop: 8 }}>Decking Condition</label>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            {DECKING_OPTIONS.map((opt) => (
              <button key={opt.value} type="button" style={pillBtn(section.decking_condition === opt.value)} onClick={() => onUpdate({ decking_condition: opt.value })} aria-pressed={section.decking_condition === opt.value}>{opt.label}</button>
            ))}
          </div>
        </div>

        {/* Damage Photos — conditional */}
        {anyDamage && (
          <div style={{ padding: '20px 16px 0' }}>
            <div style={sectionLabelStyle}><span style={sectionDot} />Damage Photos</div>
            <DamagePhotoGallery token={token} spots={damageSpots} onAdd={onAddDamageSpot} onDelete={onDeleteDamageSpot} />
          </div>
        )}

        {/* Notes */}
        <div style={{ padding: '20px 16px 0' }}>
          <div style={sectionLabelStyle}><span style={sectionDot} />Notes</div>
          <textarea
            value={localNotes}
            onChange={(e) => setLocalNotes(e.target.value)}
            onBlur={() => onUpdate({ notes: localNotes.trim() || null })}
            rows={3}
            placeholder="Additional observations..."
            style={{ width: '100%', borderRadius: 10, border: `1.5px solid ${C.border}`, backgroundColor: C.white, padding: '10px 12px', fontSize: 14, fontWeight: 400, color: C.navy, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.5 }}
          />
        </div>

        {/* Delete section */}
        <div style={{ padding: '16px 16px 0', borderTop: `1px solid ${C.border}`, marginTop: 16 }}>
          <button
            type="button"
            onClick={async () => {
              if (window.confirm('Delete this roof section? This cannot be undone.')) {
                await onDeleteSection()
              }
            }}
            style={{ background: 'none', border: 'none', color: '#DC2626', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', outline: 'none', padding: 0 }}
          >
            Delete this section
          </button>
        </div>

        {/* Navigation — back to list */}
        <div style={{ padding: '20px 16px 0' }}>
          <button type="button" onClick={onBack}
            style={{ background: 'none', border: 'none', padding: '0 0 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: C.slate, fontSize: 13, fontWeight: 600, fontFamily: 'inherit', outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            aria-label="Back to section list">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 17l-5-5m0 0l5-5m-5 5h12" /></svg>
            Back to Roof Sections
          </button>
        </div>

      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function RoofStep({
  token, roofSections, roofLoading,
  onCreateRoofSection, onUpdateRoofSection, onDeleteRoofSection,
  onAddDamageSpot, onDeleteDamageSpot,
  onContinue, onBack,
}: RoofStepProps) {
  // 'list' = summary screen, 'detail' = section form
  const [screen, setScreen] = useState<'list' | 'detail'>('list')
  const [activeRoofId, setActiveRoofId] = useState<string | null>(null)

  // Type picker state
  const [showTypePicker, setShowTypePicker] = useState(false)
  const [pickerType, setPickerType] = useState<RoofSectionType | null>(null)
  const [pickerCustomName, setPickerCustomName] = useState('')
  const [pickerCreating, setPickerCreating] = useState(false)

  // Damage spots per section (tracked locally for the session)
  const [damageSpotsMap, setDamageSpotsMap] = useState<Record<string, RoofDamageSpot[]>>({})

  const activeSection = roofSections.find(r => r.id === activeRoofId) ?? null
  const atLeastOneDone = roofSections.some(isSectionDone)

  // ── Screen B: detail ──────────────────────────────────────────────────────
  if (screen === 'detail' && activeSection) {
    const sectionId = activeSection.id!
    const damageSpots = damageSpotsMap[sectionId] ?? []

    const handleUpdate = (data: Partial<RoofData>) => {
      onUpdateRoofSection(sectionId, data)
    }

    const handleAddDamageSpot = async (photoDocumentId: string | null, caption: string | null): Promise<RoofDamageSpot | null> => {
      const spot = await onAddDamageSpot(sectionId, photoDocumentId, caption)
      if (spot) {
        setDamageSpotsMap(prev => ({
          ...prev,
          [sectionId]: [...(prev[sectionId] ?? []), spot],
        }))
      }
      return spot
    }

    const handleDeleteDamageSpot = async (spotId: string) => {
      setDamageSpotsMap(prev => ({
        ...prev,
        [sectionId]: (prev[sectionId] ?? []).filter(s => s.id !== spotId),
      }))
      await onDeleteDamageSpot(sectionId, spotId)
    }

    const handleDeleteSection = async () => {
      await onDeleteRoofSection(sectionId)
      setScreen('list')
      setActiveRoofId(null)
    }

    return (
      <SectionDetailForm
        token={token}
        section={activeSection}
        damageSpots={damageSpots}
        onUpdate={handleUpdate}
        onAddDamageSpot={handleAddDamageSpot}
        onDeleteDamageSpot={handleDeleteDamageSpot}
        onDeleteSection={handleDeleteSection}
        onBack={() => setScreen('list')}
      />
    )
  }

  // ── Screen A: section list ────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', backgroundColor: C.bg, fontFamily: '"DM Sans","Inter",system-ui,-apple-system,sans-serif' }}>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 0 120px 0' }}>

        {/* Header */}
        <div style={{ background: `linear-gradient(135deg, ${C.navy} 0%, #1E3A5F 100%)`, padding: '20px 20px 28px', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: -40, right: -40, width: 140, height: 140, borderRadius: '50%', background: 'rgba(13,148,136,0.15)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', bottom: -20, left: '30%', width: 80, height: 80, borderRadius: '50%', background: 'rgba(249,115,22,0.10)', pointerEvents: 'none' }} />
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, backgroundColor: 'rgba(13,148,136,0.2)', border: '1px solid rgba(13,148,136,0.4)', borderRadius: 20, padding: '3px 10px', marginBottom: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#5EEAD4', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Step 3 of 5</span>
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: C.white, margin: 0, letterSpacing: '-0.02em', lineHeight: 1.15 }}>Roof</h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginTop: 5, fontWeight: 400 }}>Document each roof section separately</p>
        </div>

        {/* Section cards */}
        <div style={{ padding: '20px 16px 0' }}>
          {roofLoading && roofSections.length === 0 && (
            <p style={{ fontSize: 14, color: C.slate, textAlign: 'center', padding: '32px 0' }}>Loading...</p>
          )}
          {!roofLoading && roofSections.length === 0 && (
            <p style={{ fontSize: 14, color: C.slate, textAlign: 'center', padding: '32px 0' }}>
              No roof sections yet. Add one below.
            </p>
          )}
          {roofSections.map((section) => {
            const done = isSectionDone(section)
            const photoCount = [section.overview_photo_id, section.slope_photo_id, section.shingles_photo_id, section.ridge_photo_id].filter(Boolean).length
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => { setActiveRoofId(section.id ?? null); setScreen('detail') }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '14px 16px', marginBottom: 10, borderRadius: 12,
                  border: `1.5px solid ${done ? C.teal : C.border}`,
                  backgroundColor: done ? C.tealLight : C.white,
                  cursor: 'pointer', outline: 'none', fontFamily: 'inherit',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <div style={{ textAlign: 'left' }}>
                  <p style={{ fontSize: 15, fontWeight: 700, color: C.navy, margin: 0 }}>{getSectionLabel(section)}</p>
                  <p style={{ fontSize: 12, color: done ? C.teal : C.slate, margin: '2px 0 0', fontWeight: 500 }}>
                    {done ? '✓ Done' : `${photoCount} of 4 photos`}
                  </p>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.slate} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>
            )
          })}

          {/* Add section button */}
          <button
            type="button"
            onClick={() => { setPickerType(null); setPickerCustomName(''); setShowTypePicker(true) }}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '14px 16px', borderRadius: 12,
              border: `2px dashed ${C.borderStrong}`,
              backgroundColor: C.white, cursor: 'pointer', outline: 'none', fontFamily: 'inherit',
              WebkitTapHighlightColor: 'transparent', marginTop: 4,
            }}
          >
            <span style={{ fontSize: 20, color: C.teal, lineHeight: 1 }}>+</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: C.teal }}>Add Roof Section</span>
          </button>
        </div>

      </div>

      {/* Type picker bottom sheet */}
      {showTypePicker && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 50, display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ width: '100%', maxWidth: 480, margin: '0 auto', backgroundColor: C.white, borderRadius: '20px 20px 0 0', padding: '20px 16px 32px' }}>
            <p style={{ fontSize: 16, fontWeight: 800, color: C.navy, margin: '0 0 16px' }}>Select Roof Section</p>
            {SECTION_TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setPickerType(opt.value)}
                style={{
                  width: '100%', padding: '12px 14px', borderRadius: 10, marginBottom: 8,
                  border: `1.5px solid ${pickerType === opt.value ? C.teal : C.border}`,
                  backgroundColor: pickerType === opt.value ? C.tealLight : C.white,
                  color: C.navy, fontSize: 14, fontWeight: 600,
                  cursor: 'pointer', outline: 'none', textAlign: 'left', fontFamily: 'inherit',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                {opt.label}
              </button>
            ))}
            {pickerType === 'other' && (
              <input
                type="text"
                placeholder="e.g. Shed, Pool House..."
                value={pickerCustomName}
                onChange={(e) => setPickerCustomName(e.target.value)}
                style={{ width: '100%', height: 44, borderRadius: 10, border: `1.5px solid ${C.border}`, padding: '0 12px', fontSize: 14, color: C.navy, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 8 }}
              />
            )}
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button
                type="button"
                onClick={() => { setShowTypePicker(false); setPickerType(null); setPickerCustomName('') }}
                style={{ flex: 1, height: 44, borderRadius: 10, border: `1.5px solid ${C.border}`, backgroundColor: C.white, color: C.navyMid, fontSize: 14, fontWeight: 700, cursor: 'pointer', outline: 'none', fontFamily: 'inherit' }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!pickerType || pickerCreating || (pickerType === 'other' && !pickerCustomName.trim())}
                onClick={async () => {
                  if (!pickerType) return
                  setPickerCreating(true)
                  const section = await onCreateRoofSection({
                    section_type: pickerType,
                    section_custom_name: pickerType === 'other' ? pickerCustomName.trim() : null,
                  })
                  setPickerCreating(false)
                  setShowTypePicker(false)
                  setPickerType(null)
                  setPickerCustomName('')
                  if (section) { setActiveRoofId(section.id ?? null); setScreen('detail') }
                }}
                style={{
                  flex: 1, height: 44, borderRadius: 10, border: 'none',
                  backgroundColor: (!pickerType || pickerCreating || (pickerType === 'other' && !pickerCustomName.trim())) ? '#FED7AA' : C.orange,
                  color: C.white, fontSize: 14, fontWeight: 800, cursor: 'pointer', outline: 'none', fontFamily: 'inherit',
                }}
              >
                {pickerCreating ? 'Creating...' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sticky footer */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: '16px', backgroundColor: C.white, borderTop: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 480, margin: '0 auto' }}>
          <button type="button" onClick={onBack}
            style={{ background: 'none', border: 'none', padding: '0 0 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: C.slate, fontSize: 13, fontWeight: 600, fontFamily: 'inherit', outline: 'none' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 17l-5-5m0 0l5-5m-5 5h12" /></svg>
            Back
          </button>
          <button type="button" onClick={onContinue} disabled={!atLeastOneDone}
            style={{ width: '100%', height: 54, borderRadius: 14, border: 'none', backgroundColor: !atLeastOneDone ? '#FED7AA' : C.orange, color: !atLeastOneDone ? '#FDBA74' : C.white, fontSize: 16, fontWeight: 800, cursor: !atLeastOneDone ? 'not-allowed' : 'pointer', fontFamily: 'inherit', outline: 'none' }}>
            Continue →
          </button>
          {!atLeastOneDone && (
            <p style={{ textAlign: 'center', fontSize: 12, color: C.slate, marginTop: 8 }}>
              Complete at least one roof section to continue
            </p>
          )}
        </div>
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
