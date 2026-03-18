import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getClaimMedia } from '../lib/api'

interface ClaimPhotoGalleryProps {
  claimId: string
  isActive: boolean
}

export default function ClaimPhotoGallery({ claimId, isActive }: ClaimPhotoGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const backdropRef = useRef<HTMLDivElement>(null)

  const { data: photos, isLoading, isError } = useQuery({
    queryKey: ['claim-media', claimId],
    queryFn: () => getClaimMedia(claimId),
    enabled: isActive,
  })

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (lightboxIndex === null || !photos) return
    if (e.key === 'ArrowRight') setLightboxIndex((lightboxIndex + 1) % photos.length)
    if (e.key === 'ArrowLeft')  setLightboxIndex((lightboxIndex - 1 + photos.length) % photos.length)
    if (e.key === 'Escape')     setLightboxIndex(null)
  }, [lightboxIndex, photos])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  if (isLoading) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            style={{
              aspectRatio: '1',
              background: '#f3f4f6',
              borderRadius: '12px',
              animation: 'pulse 1.5s ease-in-out infinite',
            }}
          />
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <p style={{ textAlign: 'center', color: 'var(--color-slate)', padding: '32px 0' }}>
        Something went wrong loading photos. Try refreshing the page.
      </p>
    )
  }

  if (!photos || photos.length === 0) {
    return (
      <p style={{ textAlign: 'center', color: 'var(--color-slate)', padding: '32px 0' }}>
        No photos uploaded yet. They'll appear here once your assessor completes the damage assessment.
      </p>
    )
  }

  const currentPhoto = lightboxIndex !== null ? photos[lightboxIndex] : null

  return (
    <>
      {/* Photo grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
        {photos.map((photo, i) => (
          <button
            key={i}
            onClick={() => setLightboxIndex(i)}
            className="photo-grid-btn"
            style={{
              aspectRatio: '1',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
              overflow: 'hidden',
              position: 'relative',
              cursor: 'pointer',
              padding: 0,
              background: 'none',
            }}
          >
            <img
              src={photo.url}
              alt={photo.caption}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
            <div className="photo-hover-overlay" style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0,0,0,0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: 0,
              transition: 'opacity 0.15s',
            }}>
              <svg width="28" height="28" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                <line x1="11" y1="8" x2="11" y2="14" />
                <line x1="8" y1="11" x2="14" y2="11" />
              </svg>
            </div>
          </button>
        ))}
      </div>

      {/* Lightbox */}
      {currentPhoto !== null && lightboxIndex !== null && (
        <div
          ref={backdropRef}
          onClick={(e) => { if (e.target === backdropRef.current) setLightboxIndex(null) }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,0.85)',
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <button
            onClick={() => setLightboxIndex((lightboxIndex - 1 + photos.length) % photos.length)}
            style={{
              position: 'fixed', left: '16px', top: '50%', transform: 'translateY(-50%)',
              background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%',
              width: '44px', height: '44px', display: 'flex', alignItems: 'center',
              justifyContent: 'center', cursor: 'pointer', color: 'white',
            }}
            aria-label="Previous photo"
          >
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            <img
              src={currentPhoto.url}
              alt={currentPhoto.caption}
              style={{ maxWidth: '90vw', maxHeight: '85vh', objectFit: 'contain', borderRadius: '8px' }}
            />
            <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: '14px', textAlign: 'center', margin: 0 }}>
              <span style={{ color: 'rgba(255,255,255,0.5)', marginRight: '8px' }}>
                {lightboxIndex + 1} / {photos.length}
              </span>
              {currentPhoto.caption}
            </p>
          </div>

          <button
            onClick={() => setLightboxIndex((lightboxIndex + 1) % photos.length)}
            style={{
              position: 'fixed', right: '16px', top: '50%', transform: 'translateY(-50%)',
              background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%',
              width: '44px', height: '44px', display: 'flex', alignItems: 'center',
              justifyContent: 'center', cursor: 'pointer', color: 'white',
            }}
            aria-label="Next photo"
          >
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      )}
    </>
  )
}
