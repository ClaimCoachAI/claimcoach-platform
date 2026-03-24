import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getClaimMedia, uploadClaimPhoto } from '../lib/api'

interface ClaimPhotoGalleryProps {
  claimId: string
  isActive: boolean
}

export default function ClaimPhotoGallery({ claimId, isActive }: ClaimPhotoGalleryProps) {
  const queryClient = useQueryClient()
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const backdropRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: photos, isLoading, isError } = useQuery({
    queryKey: ['claim-media', claimId],
    queryFn: () => getClaimMedia(claimId),
    enabled: isActive,
  })

  const uploadMutation = useMutation({
    mutationFn: (files: File[]) => Promise.all(files.map(f => uploadClaimPhoto(claimId, f))),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['claim-media', claimId] })
    },
  })

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return
    const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'))
    if (imageFiles.length > 0) uploadMutation.mutate(imageFiles)
  }, [uploadMutation])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    handleFiles(e.dataTransfer.files)
  }, [handleFiles])

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

  const isUploading = uploadMutation.isPending

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Upload area */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${dragOver ? '#0d9488' : 'rgba(148,163,184,0.35)'}`,
          borderRadius: '12px',
          padding: '20px',
          textAlign: 'center',
          background: dragOver ? 'rgba(13,148,136,0.04)' : 'transparent',
          transition: 'border-color 0.15s, background 0.15s',
          cursor: 'pointer',
        }}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={e => handleFiles(e.target.files)}
        />
        {isUploading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: '#0d9488' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite' }}>
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            <span style={{ fontSize: '13px', fontWeight: '500' }}>Uploading photos…</span>
          </div>
        ) : (
          <>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 8px' }}>
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <div style={{ fontSize: '13px', fontWeight: '500', color: '#334155' }}>
              Drop photos here or <span style={{ color: '#0d9488', textDecoration: 'underline' }}>click to upload</span>
            </div>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>JPG, PNG, HEIC, WEBP</div>
          </>
        )}
      </div>

      {uploadMutation.isError && (
        <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', fontSize: '12px', color: '#dc2626' }}>
          Upload failed. Please try again.
        </div>
      )}

      {/* Photo grid */}
      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} style={{ aspectRatio: '1', background: '#f3f4f6', borderRadius: '12px', animation: 'pulse 1.5s ease-in-out infinite' }} />
          ))}
        </div>
      ) : isError ? (
        <p style={{ textAlign: 'center', color: 'var(--color-slate)', padding: '16px 0' }}>
          Something went wrong loading photos. Try refreshing the page.
        </p>
      ) : !photos || photos.length === 0 ? (
        <p style={{ textAlign: 'center', color: 'var(--color-slate)', padding: '16px 0' }}>
          No photos yet. Upload them above.
        </p>
      ) : (
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
                position: 'absolute', inset: 0,
                background: 'rgba(0,0,0,0.35)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: 0, transition: 'opacity 0.15s',
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
      )}

      {/* Lightbox */}
      {photos && lightboxIndex !== null && photos[lightboxIndex] && (
        <div
          ref={backdropRef}
          onClick={(e) => { if (e.target === backdropRef.current) setLightboxIndex(null) }}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(15,23,42,0.85)',
            zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center',
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
              src={photos[lightboxIndex].url}
              alt={photos[lightboxIndex].caption}
              style={{ maxWidth: '90vw', maxHeight: '85vh', objectFit: 'contain', borderRadius: '8px' }}
            />
            <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: '14px', textAlign: 'center', margin: 0 }}>
              <span style={{ color: 'rgba(255,255,255,0.5)', marginRight: '8px' }}>
                {lightboxIndex + 1} / {photos.length}
              </span>
              {photos[lightboxIndex].caption}
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

          <button
            onClick={() => setLightboxIndex(null)}
            style={{
              position: 'fixed', right: '16px', top: '16px',
              background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%',
              width: '36px', height: '36px', display: 'flex', alignItems: 'center',
              justifyContent: 'center', cursor: 'pointer', color: 'white',
            }}
            aria-label="Close"
          >
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .photo-grid-btn:hover .photo-hover-overlay { opacity: 1 !important; }
      `}</style>
    </div>
  )
}
