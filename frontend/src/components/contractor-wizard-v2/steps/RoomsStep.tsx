import React, { useState } from 'react'
import {
  InspectionRoom,
  UpdateRoomInput,
  DAMAGED_MATERIALS,
  DamagedMaterial,
} from '../types'

// ── Types ─────────────────────────────────────────────────────────────────────

interface RoomsStepProps {
  rooms: InspectionRoom[]
  roomsLoading: boolean
  onCreateRoom: () => Promise<void>
  onUpdateRoom: (roomId: string, input: UpdateRoomInput) => void
  onDeleteRoom: (roomId: string) => Promise<void>
  onAddRoomPhoto: (roomId: string, input: { caption?: string }) => Promise<void>
  onDeleteRoomPhoto: (roomId: string, photoId: string) => Promise<void>
  onContinue: () => void
  onBack: () => void
}

// ── DamagedMaterialPills ──────────────────────────────────────────────────────

interface DamagedMaterialPillsProps {
  selected: DamagedMaterial[]
  onChange: (next: DamagedMaterial[]) => void
}

function DamagedMaterialPills({ selected, onChange }: DamagedMaterialPillsProps) {
  const toggle = (material: DamagedMaterial) => {
    const next = selected.includes(material)
      ? selected.filter(m => m !== material)
      : [...selected, material]
    onChange(next)
  }

  const pillContainerStyle: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    marginTop: '8px',
  }

  const pillStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 14px',
    borderRadius: '20px',
    border: `1.5px solid ${active ? '#2563eb' : '#d1d5db'}`,
    backgroundColor: active ? '#eff6ff' : '#ffffff',
    color: active ? '#1d4ed8' : '#374151',
    fontSize: '13px',
    fontWeight: active ? 600 : 400,
    cursor: 'pointer',
    userSelect: 'none',
  })

  return (
    <div>
      <label style={{ fontSize: '13px', color: '#6b7280', fontWeight: 500 }}>
        Damaged materials
      </label>
      <div style={pillContainerStyle}>
        {DAMAGED_MATERIALS.map(material => (
          <button
            key={material}
            type="button"
            style={pillStyle(selected.includes(material))}
            onClick={() => toggle(material)}
          >
            {material}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── RoomPhotoGallery ──────────────────────────────────────────────────────────

interface RoomPhotoGalleryProps {
  photos: InspectionRoom['photos']
  onDelete: (photoId: string) => void
  onAdd: () => void
}

function RoomPhotoGallery({ photos, onDelete, onAdd }: RoomPhotoGalleryProps) {
  const scrollStyle: React.CSSProperties = {
    display: 'flex',
    gap: '8px',
    overflowX: 'auto',
    paddingBottom: '4px',
  }

  const thumbStyle: React.CSSProperties = {
    flexShrink: 0,
    width: '72px',
    height: '72px',
    borderRadius: '8px',
    objectFit: 'cover',
    backgroundColor: '#f3f4f6',
    border: '1px solid #e5e7eb',
    position: 'relative',
  }

  const addTileStyle: React.CSSProperties = {
    flexShrink: 0,
    width: '72px',
    height: '72px',
    borderRadius: '8px',
    border: '1.5px dashed #9ca3af',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    backgroundColor: '#f9fafb',
    color: '#6b7280',
    fontSize: '24px',
  }

  return (
    <div>
      <label style={{ fontSize: '13px', color: '#6b7280', fontWeight: 500 }}>
        Damage photos
      </label>
      <div style={scrollStyle}>
        {photos.map(photo => (
          <div key={photo.id} style={{ position: 'relative' }}>
            {photo.photo_url ? (
              <img src={photo.photo_url} style={thumbStyle} alt={photo.caption ?? 'damage photo'} />
            ) : (
              <div style={{ ...thumbStyle, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '28px' }}>📷</span>
              </div>
            )}
            <button
              type="button"
              onClick={() => onDelete(photo.id)}
              aria-label={`Remove photo${photo.caption ? `: ${photo.caption}` : ''}`}
              style={{
                position: 'absolute',
                top: '2px',
                right: '2px',
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                border: 'none',
                backgroundColor: 'rgba(0,0,0,0.6)',
                color: '#fff',
                fontSize: '11px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
              }}
            >
              ×
            </button>
          </div>
        ))}
        <button type="button" style={addTileStyle} onClick={onAdd} aria-label="Add damage photo">+</button>
      </div>
    </div>
  )
}

// ── RoomCard ──────────────────────────────────────────────────────────────────

interface RoomCardProps {
  room: InspectionRoom
  isExpanded: boolean
  onToggle: () => void
  onUpdate: (input: UpdateRoomInput) => void
  onDelete: () => void
  onAddPhoto: () => void
  onDeletePhoto: (photoId: string) => void
}

function RoomCard({
  room,
  isExpanded,
  onToggle,
  onUpdate,
  onDelete,
  onAddPhoto,
  onDeletePhoto,
}: RoomCardProps) {
  const buildInput = (overrides: Partial<UpdateRoomInput>): UpdateRoomInput => ({
    name: room.name,
    length_ft: room.length_ft,
    width_ft: room.width_ft,
    height_ft: room.height_ft,
    damaged_materials: room.damaged_materials,
    notes: room.notes,
    ...overrides,
  })

  const cardStyle: React.CSSProperties = {
    border: '1px solid #e5e7eb',
    borderRadius: '12px',
    backgroundColor: '#ffffff',
    overflow: 'hidden',
  }

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 16px',
    cursor: 'pointer',
    backgroundColor: isExpanded ? '#f8faff' : '#ffffff',
  }

  const bodyStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    padding: '0 16px 16px',
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    borderRadius: '8px',
    border: '1px solid #d1d5db',
    fontSize: '14px',
    boxSizing: 'border-box',
  }

  const dimRowStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: '8px',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: '11px',
    color: '#6b7280',
    marginBottom: '4px',
    display: 'block',
  }

  const deleteButtonStyle: React.CSSProperties = {
    alignSelf: 'flex-end',
    padding: '6px 14px',
    borderRadius: '8px',
    border: '1px solid #fca5a5',
    backgroundColor: '#fff5f5',
    color: '#dc2626',
    fontSize: '13px',
    cursor: 'pointer',
  }

  return (
    <div style={cardStyle}>
      <button
        type="button"
        style={{ ...headerStyle, width: '100%', background: 'none', border: 'none', textAlign: 'left' }}
        onClick={onToggle}
        aria-expanded={isExpanded}
      >
        <span style={{ fontWeight: 600, fontSize: '15px', color: '#111827' }}>{room.name}</span>
        <span style={{ color: '#6b7280', fontSize: '18px' }}>{isExpanded ? '−' : '+'}</span>
      </button>
      {isExpanded && (
        <div style={bodyStyle}>
          {/* Room name */}
          <div>
            <label style={labelStyle}>Room name</label>
            <input
              style={inputStyle}
              value={room.name}
              onChange={e => onUpdate(buildInput({ name: e.target.value }))}
              placeholder="e.g. Living Room"
            />
          </div>

          {/* Dimensions */}
          <div>
            <label style={labelStyle}>Dimensions (ft)</label>
            <div style={dimRowStyle}>
              <div>
                <span style={labelStyle}>Length</span>
                <input
                  type="number"
                  style={inputStyle}
                  value={room.length_ft ?? ''}
                  onChange={e => onUpdate(buildInput({ length_ft: e.target.value ? parseFloat(e.target.value) : null }))}
                  placeholder="—"
                />
              </div>
              <div>
                <span style={labelStyle}>Width</span>
                <input
                  type="number"
                  style={inputStyle}
                  value={room.width_ft ?? ''}
                  onChange={e => onUpdate(buildInput({ width_ft: e.target.value ? parseFloat(e.target.value) : null }))}
                  placeholder="—"
                />
              </div>
              <div>
                <span style={labelStyle}>Height</span>
                <input
                  type="number"
                  style={inputStyle}
                  value={room.height_ft ?? ''}
                  onChange={e => onUpdate(buildInput({ height_ft: e.target.value ? parseFloat(e.target.value) : null }))}
                  placeholder="—"
                />
              </div>
            </div>
          </div>

          {/* Damaged materials */}
          <DamagedMaterialPills
            selected={room.damaged_materials}
            onChange={next => onUpdate(buildInput({ damaged_materials: next }))}
          />

          {/* Damage photos */}
          <RoomPhotoGallery
            photos={room.photos}
            onDelete={onDeletePhoto}
            onAdd={onAddPhoto}
          />

          {/* Notes */}
          <div>
            <label style={labelStyle}>Notes</label>
            <textarea
              style={{ ...inputStyle, resize: 'vertical', minHeight: '60px' }}
              value={room.notes ?? ''}
              onChange={e => onUpdate(buildInput({ notes: e.target.value || null }))}
              placeholder="Any additional notes…"
            />
          </div>

          <button type="button" style={deleteButtonStyle} onClick={onDelete}>
            🗑 Delete room
          </button>
        </div>
      )}
    </div>
  )
}

// ── RoomsStep ─────────────────────────────────────────────────────────────────

export default function RoomsStep({
  rooms,
  roomsLoading,
  onCreateRoom,
  onUpdateRoom,
  onDeleteRoom,
  onAddRoomPhoto,
  onDeleteRoomPhoto,
  onContinue,
  onBack,
}: RoomsStepProps) {
  const [expandedRoomId, setExpandedRoomId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const handleCreateRoom = async () => {
    setCreating(true)
    try {
      await onCreateRoom()
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteRoom = async (roomId: string) => {
    if (!window.confirm('Delete this room?')) return
    if (expandedRoomId === roomId) setExpandedRoomId(null)
    await onDeleteRoom(roomId)
  }

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

  const addButtonStyle: React.CSSProperties = {
    width: '100%',
    padding: '14px',
    borderRadius: '12px',
    border: '1.5px dashed #9ca3af',
    backgroundColor: '#ffffff',
    color: '#374151',
    fontSize: '15px',
    fontWeight: 500,
    cursor: creating ? 'not-allowed' : 'pointer',
    opacity: creating ? 0.6 : 1,
  }

  const footerStyle: React.CSSProperties = {
    padding: '16px',
    backgroundColor: '#ffffff',
    borderTop: '1px solid #e5e7eb',
    display: 'flex',
    gap: '12px',
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

  const continueBtnStyle: React.CSSProperties = {
    flex: 2,
    padding: '14px',
    borderRadius: '10px',
    border: 'none',
    backgroundColor: rooms.length > 0 ? '#2563eb' : '#9ca3af',
    color: '#ffffff',
    fontSize: '15px',
    fontWeight: 600,
    cursor: rooms.length > 0 ? 'pointer' : 'not-allowed',
  }

  if (roomsLoading) {
    return (
      <div style={{ ...containerStyle, alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#6b7280' }}>Loading rooms…</p>
      </div>
    )
  }

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>Step 4 of 5</p>
        <h2 style={{ fontSize: '20px', fontWeight: 700, margin: '4px 0 0', color: '#111827' }}>
          Rooms / Interior
        </h2>
      </div>

      <div style={bodyStyle}>
        {rooms.map(room => (
          <RoomCard
            key={room.id}
            room={room}
            isExpanded={expandedRoomId === room.id}
            onToggle={() => setExpandedRoomId(prev => prev === room.id ? null : room.id)}
            onUpdate={input => onUpdateRoom(room.id, input)}
            onDelete={() => handleDeleteRoom(room.id)}
            onAddPhoto={() => onAddRoomPhoto(room.id, {})}
            onDeletePhoto={photoId => onDeleteRoomPhoto(room.id, photoId)}
          />
        ))}

        <button
          type="button"
          style={addButtonStyle}
          onClick={handleCreateRoom}
          disabled={creating}
        >
          {creating ? 'Adding…' : '+ Add Room'}
        </button>
      </div>

      <div style={footerStyle}>
        <button type="button" style={backBtnStyle} onClick={onBack}>← Back</button>
        <button
          type="button"
          style={continueBtnStyle}
          disabled={rooms.length === 0}
          onClick={onContinue}
        >
          Continue →
        </button>
      </div>
    </div>
  )
}
