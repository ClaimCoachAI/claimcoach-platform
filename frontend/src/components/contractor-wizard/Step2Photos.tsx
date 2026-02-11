import { useRef, useState } from 'react'
import { StepProps, UploadedFile } from './types'
import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080'

interface Step2PhotosProps extends StepProps {
  token: string
}

export default function Step2Photos({
  wizardState,
  onNext,
  onBack,
  onUpdateData,
  submitting,
  token,
}: Step2PhotosProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [photos, setPhotos] = useState<UploadedFile[]>(wizardState.photos || [])
  const [uploading, setUploading] = useState(false)

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return

    const newFiles = Array.from(e.target.files)
    setUploading(true)

    // Add files to state with uploading status
    const newPhotos: UploadedFile[] = newFiles.map(file => ({
      file,
      uploading: true,
      uploaded: false,
    }))

    setPhotos(prev => [...prev, ...newPhotos])

    // Upload each file
    for (let i = 0; i < newFiles.length; i++) {
      const file = newFiles[i]
      const photoIndex = photos.length + i

      try {
        const documentId = await uploadFile(file, 'contractor_photo')
        setPhotos(prev => {
          const updated = [...prev]
          updated[photoIndex] = {
            ...updated[photoIndex],
            uploading: false,
            uploaded: true,
            documentId,
          }
          return updated
        })
      } catch (err) {
        console.error('Photo upload error:', err)
        setPhotos(prev => {
          const updated = [...prev]
          updated[photoIndex] = {
            ...updated[photoIndex],
            uploading: false,
            error: 'Upload failed',
          }
          return updated
        })
      }
    }

    setUploading(false)

    // Clear input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const uploadFile = async (file: File, documentType: string): Promise<string> => {
    // Step 1: Request upload URL
    const uploadUrlResponse = await axios.post(
      `${API_URL}/api/magic-links/${token}/documents/upload-url`,
      {
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type,
        document_type: documentType,
      }
    )

    const { upload_url, document_id } = uploadUrlResponse.data.data

    // Step 2: Upload file to storage
    await axios.put(upload_url, file, {
      headers: {
        'Content-Type': file.type,
      },
    })

    // Step 3: Confirm upload
    await axios.post(
      `${API_URL}/api/magic-links/${token}/documents/${document_id}/confirm`
    )

    return document_id
  }

  const removePhoto = (index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index))
  }

  const handleContinue = async () => {
    // Update wizard state with photos before continuing
    onUpdateData({ photos } as any)
    await onNext()
  }

  const uploadedPhotos = photos.filter(p => p.uploaded)
  const hasMinimumPhotos = uploadedPhotos.length >= 1

  return (
    <div className="min-h-[calc(100vh-200px)] px-4 py-8 pb-32">
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Header */}
        <div className="space-y-4 animate-fade-in">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 text-sm font-medium text-navy/60 hover:text-navy transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>

          <div>
            <h2 className="text-3xl font-display font-bold text-navy mb-3">
              Upload Damage Photos
            </h2>
            <p className="text-base text-slate leading-relaxed">
              Visual documentation helps ensure accurate assessment
            </p>
          </div>
        </div>

        {/* Instructions Card */}
        <div className="glass-card-strong rounded-2xl p-6 space-y-4 animate-slide-up delay-100">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-teal/20 to-teal/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-teal" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-navy mb-3">Photo Guidelines</h3>
              <ul className="space-y-2">
                {[
                  'Take overall views of affected areas',
                  'Capture close-ups of specific damage',
                  'Include roof damage from multiple angles',
                ].map((instruction, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate">
                    <svg className="w-5 h-5 text-teal flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span>{instruction}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Camera Button */}
        <div className="animate-slide-up delay-200">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            capture="environment"
            multiple
            onChange={handlePhotoSelect}
            className="hidden"
            id="photo-input"
          />
          <label
            htmlFor="photo-input"
            className={`
              group relative block w-full rounded-2xl overflow-hidden cursor-pointer
              transition-all duration-300 hover:shadow-2xl
              ${uploading ? 'opacity-50 cursor-wait' : 'hover:scale-[1.02]'}
            `}
          >
            <div className="relative bg-gradient-to-br from-teal via-teal-dark to-[#2A4A70] p-8 text-center">
              {/* Animated background pattern */}
              <div className="absolute inset-0 opacity-10">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.1),transparent_50%)]" />
              </div>

              {/* Content */}
              <div className="relative space-y-4">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-white/20 backdrop-blur-sm group-hover:bg-white/30 transition-all duration-300 group-hover:scale-110">
                  <svg
                    className="w-10 h-10 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                    />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>

                <div>
                  <p className="text-xl font-bold text-white mb-1">
                    {uploading ? 'Uploading...' : 'Take Photos'}
                  </p>
                  <p className="text-sm text-white/80">
                    Tap to open camera or select from gallery
                  </p>
                </div>

                {uploading && (
                  <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-white border-t-transparent" />
                )}
              </div>

              {/* Shine effect */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000" />
            </div>
          </label>
        </div>

        {/* Photo Grid */}
        {photos.length > 0 && (
          <div className="space-y-4 animate-slide-up delay-300">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-navy">
                Uploaded Photos ({uploadedPhotos.length})
              </h3>
              {!hasMinimumPhotos && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200">
                  <svg className="w-4 h-4 text-amber-600" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="text-xs font-semibold text-amber-800">Min. 1 photo required</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {photos.map((photo, index) => (
                <div
                  key={index}
                  className="relative aspect-square rounded-xl overflow-hidden glass-card group animate-scale-in"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  {/* Photo Preview */}
                  <img
                    src={URL.createObjectURL(photo.file)}
                    alt={photo.file.name}
                    className="w-full h-full object-cover"
                  />

                  {/* Uploading Overlay */}
                  {photo.uploading && (
                    <div className="absolute inset-0 bg-navy/60 backdrop-blur-sm flex items-center justify-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-3 border-white border-t-transparent" />
                    </div>
                  )}

                  {/* Success Checkmark */}
                  {photo.uploaded && (
                    <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-teal flex items-center justify-center shadow-lg animate-scale-in">
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}

                  {/* Error State */}
                  {photo.error && (
                    <div className="absolute inset-0 bg-red-500/80 flex items-center justify-center">
                      <p className="text-xs text-white font-semibold">{photo.error}</p>
                    </div>
                  )}

                  {/* Remove Button */}
                  {!photo.uploading && (
                    <button
                      onClick={() => removePhoto(index)}
                      className="absolute top-2 right-2 w-7 h-7 rounded-full bg-navy/80 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                      title="Remove photo"
                    >
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}

                  {/* File Name */}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-navy/80 to-transparent p-2">
                    <p className="text-xs text-white truncate">{photo.file.name}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {photos.length === 0 && (
          <div className="glass-card rounded-2xl p-12 text-center animate-slide-up delay-300">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-slate/10 flex items-center justify-center">
              <svg className="w-8 h-8 text-slate/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </div>
            <p className="text-sm text-slate">No photos uploaded yet</p>
          </div>
        )}

        {/* Continue Button */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-white via-white to-transparent backdrop-blur-sm">
          <div className="max-w-2xl mx-auto">
            <button
              type="button"
              onClick={handleContinue}
              disabled={!hasMinimumPhotos || submitting || uploading}
              className="w-full btn-primary py-4 px-6 rounded-2xl text-base font-bold shadow-xl hover:shadow-2xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden group"
            >
              <span className="relative flex items-center justify-center gap-2">
                {submitting ? (
                  <>
                    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Saving...
                  </>
                ) : (
                  <>
                    Continue to Assessment
                    <svg
                      className="w-5 h-5 group-hover:translate-x-1 transition-transform"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      strokeWidth={2.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </>
                )}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
