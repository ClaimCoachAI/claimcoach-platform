import React, { useState, useCallback, useEffect, useRef } from 'react'
import type {
  RoofData, RoofDamageSpot, RoofPhotoSlot,
  Pitch, RoofShingleType, DeckingCondition,
} from '../types'
import { usePhotoUpload } from '../usePhotoUpload'

// ─── Props ────────────────────────────────────────────────────────────────────
interface RoofStepProps {
  token: string
  roof: RoofData | null
  damageSpots: RoofDamageSpot[]
  onSaveRoof: (data: Partial<RoofData>) => Promise<void>
  onAddDamageSpot: (photoDocumentId: string | null, caption: string | null) => Promise<RoofDamageSpot | null>
  onDeleteDamageSpot: (spotId: string) => Promise<void>
  onContinue: () => void
  onBack: () => void
  loading: boolean
  error: string | null
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

// ─── NamedPhotoSlot ───────────────────────────────────────────────────────────
function NamedPhotoSlot({
  slotKey: _slotKey, label, token, photoId, photoUrl, onSaveRoof, photoIdField,
}: {
  slotKey: RoofPhotoSlot
  label: string
  token: string
  photoId: string | null
  photoUrl: string | null
  onSaveRoof: (data: Partial<RoofData>) => Promise<void>
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
        await onSaveRoof({ [photoIdField]: result.documentId } as Partial<RoofData>)
      }
    },
    [uploadPhoto, onSaveRoof, clearUploadError, photoIdField],
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

// ─── Main component ────────────────────────────────────────────────────────────
export default function RoofStep({
  token, roof, damageSpots, onSaveRoof, onAddDamageSpot, onDeleteDamageSpot,
  onContinue, onBack, loading, error,
}: RoofStepProps) {
  const [localLayers, setLocalLayers] = useState<string>(roof?.layers != null ? String(roof.layers) : '')
  const [localSquares, setLocalSquares] = useState<string>(roof?.squares != null ? String(roof.squares) : '')
  const [localNotes, setLocalNotes] = useState<string>(roof?.notes ?? '')

  // Sync local inputs when roof prop updates (server refresh after debounced save)
  useEffect(() => {
    setLocalLayers(roof?.layers != null ? String(roof.layers) : '')
    setLocalSquares(roof?.squares != null ? String(roof.squares) : '')
    setLocalNotes(roof?.notes ?? '')
  }, [roof])

  const allPhotosUploaded = PHOTO_SLOTS.every(
    (s) => (roof?.[s.photoIdField] as string | null) !== null,
  )
  const isDisabled = loading || !allPhotosUploaded
  const anyDamage = Boolean(roof?.has_ridge_damage || roof?.has_valley_damage || roof?.has_flashing_damage)

  const sectionLabel: React.CSSProperties = {
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
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginTop: 5, fontWeight: 400 }}>Document all four roof sections</p>
        </div>

        {/* 2×2 Photo Grid */}
        <div style={{ padding: '20px 16px 0' }}>
          <div style={sectionLabel}><span style={sectionDot} />Required Photos</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {PHOTO_SLOTS.map((slot) => (
              <NamedPhotoSlot
                key={slot.key}
                slotKey={slot.key}
                label={slot.label}
                token={token}
                photoId={(roof?.[slot.photoIdField] as string | null) ?? null}
                photoUrl={(roof?.[slot.photoUrlField] as string | null) ?? null}
                onSaveRoof={onSaveRoof}
                photoIdField={slot.photoIdField}
              />
            ))}
          </div>
        </div>

        {/* Roof Details */}
        <div style={{ padding: '20px 16px 0' }}>
          <div style={sectionLabel}><span style={sectionDot} />Roof Details</div>

          {/* Pitch */}
          <label style={labelStyle}>Pitch</label>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 12, WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            {PITCH_OPTIONS.map((opt) => (
              <button key={opt.value} type="button" style={pillBtn(roof?.pitch === opt.value)} onClick={() => void onSaveRoof({ pitch: opt.value })} aria-pressed={roof?.pitch === opt.value}>{opt.label}</button>
            ))}
          </div>

          {/* Shingle type */}
          <label style={labelStyle}>Shingle Type</label>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 12, WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            {SHINGLE_OPTIONS.map((opt) => (
              <button key={opt.value} type="button" style={pillBtn(roof?.shingle_type === opt.value)} onClick={() => void onSaveRoof({ shingle_type: opt.value })} aria-pressed={roof?.shingle_type === opt.value}>{opt.label}</button>
            ))}
          </div>

          {/* Layers + Squares */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle} htmlFor="roof-layers">Layers</label>
              <input id="roof-layers" type="number" inputMode="numeric" min={1} max={5} value={localLayers}
                onChange={(e) => setLocalLayers(e.target.value)}
                onBlur={() => { const v = parseInt(localLayers, 10); void onSaveRoof({ layers: isNaN(v) ? null : v }) }}
                style={inputStyle} placeholder="1" />
            </div>
            <div>
              <label style={labelStyle} htmlFor="roof-squares">Squares (approx.)</label>
              <input id="roof-squares" type="number" inputMode="numeric" min={0} value={localSquares}
                onChange={(e) => setLocalSquares(e.target.value)}
                onBlur={() => { const v = parseFloat(localSquares); void onSaveRoof({ squares: isNaN(v) ? null : v }) }}
                style={inputStyle} placeholder="24" />
            </div>
          </div>
        </div>

        {/* Damage */}
        <div style={{ padding: '20px 16px 0' }}>
          <div style={sectionLabel}><span style={sectionDot} />Damage</div>

          {/* Three damage flag rows */}
          {(
            [
              { label: 'Ridge damage', field: 'has_ridge_damage' as const, value: roof?.has_ridge_damage },
              { label: 'Valley damage', field: 'has_valley_damage' as const, value: roof?.has_valley_damage },
              { label: 'Flashing damage', field: 'has_flashing_damage' as const, value: roof?.has_flashing_damage },
            ] as Array<{ label: string; field: 'has_ridge_damage' | 'has_valley_damage' | 'has_flashing_damage'; value: boolean | undefined }>
          ).map(({ label, field, value }) => {
            const current: boolean | null = value === undefined ? null : value
            return (
              <div key={field} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: C.navyMid }}>{label}</span>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button type="button" style={damageToggle(current === true)} onClick={() => void onSaveRoof({ [field]: true })} aria-pressed={current === true}>YES</button>
                  <button type="button" style={damageToggle(current === false && roof !== null ? false : null)} onClick={() => void onSaveRoof({ [field]: false })} aria-pressed={current === false && roof !== null}>NO</button>
                </div>
              </div>
            )
          })}

          {/* Decking condition */}
          <label style={{ ...labelStyle, marginTop: 8 }}>Decking Condition</label>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            {DECKING_OPTIONS.map((opt) => (
              <button key={opt.value} type="button" style={pillBtn(roof?.decking_condition === opt.value)} onClick={() => void onSaveRoof({ decking_condition: opt.value })} aria-pressed={roof?.decking_condition === opt.value}>{opt.label}</button>
            ))}
          </div>
        </div>

        {/* Damage Photos — conditional */}
        {anyDamage && (
          <div style={{ padding: '20px 16px 0' }}>
            <div style={sectionLabel}><span style={sectionDot} />Damage Photos</div>
            <DamagePhotoGallery token={token} spots={damageSpots} onAdd={onAddDamageSpot} onDelete={onDeleteDamageSpot} />
          </div>
        )}

        {/* Notes */}
        <div style={{ padding: '20px 16px 0' }}>
          <div style={sectionLabel}><span style={sectionDot} />Notes</div>
          <textarea
            value={localNotes}
            onChange={(e) => setLocalNotes(e.target.value)}
            onBlur={() => void onSaveRoof({ notes: localNotes.trim() || null })}
            rows={3}
            placeholder="Additional observations..."
            style={{ width: '100%', borderRadius: 10, border: `1.5px solid ${C.border}`, backgroundColor: C.white, padding: '10px 12px', fontSize: 14, fontWeight: 400, color: C.navy, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.5 }}
          />
        </div>

        {/* Error */}
        {error && (
          <div style={{ margin: '16px 16px 0', backgroundColor: C.errorBg, border: `1px solid ${C.errorBorder}`, borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'flex-start', gap: 8 }} role="alert">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.errorText} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p style={{ fontSize: 13, color: C.errorText, fontWeight: 500, lineHeight: 1.4, margin: 0 }}>{error}</p>
          </div>
        )}

        {/* Navigation */}
        <div style={{ padding: '20px 16px 0' }}>
          <button type="button" onClick={onBack}
            style={{ background: 'none', border: 'none', padding: '0 0 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: C.slate, fontSize: 13, fontWeight: 600, fontFamily: 'inherit', outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            aria-label="Go back">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 17l-5-5m0 0l5-5m-5 5h12" /></svg>
            Back
          </button>

          <button type="button" onClick={onContinue} disabled={isDisabled} aria-disabled={isDisabled}
            style={{ width: '100%', height: 54, borderRadius: 14, border: 'none', backgroundColor: isDisabled ? '#FED7AA' : C.orange, color: isDisabled ? '#FDBA74' : C.white, fontSize: 16, fontWeight: 800, cursor: isDisabled ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: isDisabled ? 'none' : '0 4px 14px rgba(249,115,22,0.35)', letterSpacing: '0.01em', fontFamily: 'inherit', outline: 'none', WebkitTapHighlightColor: 'transparent', transition: 'background-color 0.15s ease' }}>
            {loading ? (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: 'spin 0.8s linear infinite' }}>
                  <path d="M21 12a9 9 0 11-6.219-8.56" strokeLinecap="round" />
                </svg>
                Saving...
              </>
            ) : (
              <>
                Continue
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </>
            )}
          </button>

          {!allPhotosUploaded && (
            <p style={{ textAlign: 'center', fontSize: 12, color: C.slate, marginTop: 10, fontWeight: 500 }}>
              Upload all 4 photos to continue
            </p>
          )}
        </div>

      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
