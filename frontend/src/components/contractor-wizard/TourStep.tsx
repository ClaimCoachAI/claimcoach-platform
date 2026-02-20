import { useState, useRef } from 'react'
import axios from 'axios'
import { ScopeArea, UploadingPhoto } from './types'
import { CategoryDef } from './taxonomy'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080'

interface TourStepProps {
  area: ScopeArea
  areaIndex: number
  totalAreas: number
  categoryDef: CategoryDef
  token: string
  onComplete: (updatedArea: ScopeArea) => void
  onBack: () => void
  saving: boolean
}

async function uploadFile(token: string, file: File): Promise<string> {
  const { data: { data: urlData } } = await axios.post(
    `${API_URL}/api/magic-links/${token}/documents/upload-url`,
    { file_name: file.name, file_size: file.size, mime_type: file.type, document_type: 'contractor_photo' }
  )
  await fetch(urlData.upload_url, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type },
  })
  await axios.post(`${API_URL}/api/magic-links/${token}/documents/${urlData.document_id}/confirm`)
  return urlData.document_id as string
}

export default function TourStep({
  area,
  areaIndex,
  totalAreas,
  categoryDef,
  token,
  onComplete,
  onBack,
  saving,
}: TourStepProps) {
  const [localArea, setLocalArea] = useState<ScopeArea>({ ...area })
  const [uploadingPhotos, setUploadingPhotos] = useState<UploadingPhoto[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isLastStep = areaIndex + 1 >= totalAreas

  const toggleTag = (tagKey: string) => {
    setLocalArea(prev => ({
      ...prev,
      tags: prev.tags.includes(tagKey)
        ? prev.tags.filter(t => t !== tagKey)
        : [...prev.tags, tagKey],
    }))
  }

  const setDimension = (key: string, value: string) => {
    const num = parseFloat(value)
    setLocalArea(prev => ({
      ...prev,
      dimensions: { ...prev.dimensions, [key]: isNaN(num) ? 0 : num },
    }))
  }

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return
    const files = Array.from(e.target.files)
    e.target.value = ''

    const startIdx = uploadingPhotos.length
    const newUploads: UploadingPhoto[] = files.map(f => ({
      file: f,
      status: 'uploading' as const,
      previewUrl: URL.createObjectURL(f),
    }))
    setUploadingPhotos(prev => [...prev, ...newUploads])

    for (let i = 0; i < files.length; i++) {
      try {
        const docId = await uploadFile(token, files[i])
        setUploadingPhotos(prev => {
          const updated = [...prev]
          updated[startIdx + i] = { ...updated[startIdx + i], status: 'done', documentId: docId }
          return updated
        })
        setLocalArea(prev => ({ ...prev, photo_ids: [...prev.photo_ids, docId] }))
      } catch {
        setUploadingPhotos(prev => {
          const updated = [...prev]
          updated[startIdx + i] = { ...updated[startIdx + i], status: 'error' }
          return updated
        })
      }
    }
  }

  return (
    <div className="min-h-[calc(100vh-200px)] px-4 py-6 pb-36">
      <div className="max-w-md mx-auto space-y-7">

        {/* Header */}
        <div className="space-y-1 animate-fade-in">
          <p className="text-xs font-semibold text-slate/50 uppercase tracking-widest">
            Area {areaIndex + 1} of {totalAreas}
          </p>
          <h2 className="text-2xl font-display font-bold text-navy flex items-center gap-2.5">
            <span className="text-3xl leading-none">{categoryDef.emoji}</span>
            <span>{categoryDef.label}</span>
          </h2>
        </div>

        {/* Photos */}
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-navy">Photos</h3>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center justify-center gap-3 p-5 rounded-2xl
              border-2 border-dashed border-teal/40 bg-teal/5
              hover:bg-teal/10 hover:border-teal transition-all duration-200 active:scale-[0.98]"
          >
            <svg className="w-7 h-7 text-teal" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
            </svg>
            <span className="text-base font-semibold text-teal">Take Photos</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            onChange={handlePhotoSelect}
            className="hidden"
          />

          {uploadingPhotos.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {uploadingPhotos.map((p, i) => (
                <div key={i} className="relative aspect-square rounded-xl overflow-hidden bg-slate/10">
                  <img src={p.previewUrl} alt="" className="w-full h-full object-cover" />
                  {p.status === 'uploading' && (
                    <div className="absolute inset-0 bg-navy/50 flex items-center justify-center">
                      <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                  {p.status === 'error' && (
                    <div className="absolute inset-0 bg-red-500/60 flex items-center justify-center">
                      <span className="text-white text-xs font-bold">Failed</span>
                    </div>
                  )}
                  {p.status === 'done' && (
                    <div className="absolute bottom-1 right-1 w-5 h-5 rounded-full bg-teal flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Damage Tags */}
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-navy">What's damaged?</h3>
          <div className="grid grid-cols-2 gap-2">
            {categoryDef.tags.map(tag => {
              const isOn = localArea.tags.includes(tag.key)
              return (
                <button
                  key={tag.key}
                  type="button"
                  onClick={() => toggleTag(tag.key)}
                  className={`
                    px-3 py-4 rounded-xl border-2 text-sm font-semibold
                    text-center transition-all duration-150 leading-tight active:scale-[0.97]
                    ${isOn
                      ? 'border-teal bg-teal text-white shadow-sm'
                      : 'border-slate/20 bg-white text-navy hover:border-teal/40'
                    }
                  `}
                >
                  {tag.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Dimensions */}
        {categoryDef.dimensionType && (
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-navy">
              Dimensions <span className="text-slate/50 font-normal">(optional)</span>
            </h3>
            {categoryDef.dimensionType === 'sqft' ? (
              <div className="relative">
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="0"
                  value={localArea.dimensions['square_footage'] || ''}
                  onChange={e => setDimension('square_footage', e.target.value)}
                  className="w-full px-4 py-4 rounded-xl border-2 border-slate/20
                    focus:border-teal focus:outline-none text-navy font-medium text-lg pr-20"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate/50 text-sm font-medium">sq ft</span>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate/60 font-medium mb-1.5 block">Length (ft)</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    placeholder="0"
                    value={localArea.dimensions['length'] || ''}
                    onChange={e => setDimension('length', e.target.value)}
                    className="w-full px-4 py-4 rounded-xl border-2 border-slate/20
                      focus:border-teal focus:outline-none text-navy font-medium text-lg"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate/60 font-medium mb-1.5 block">Width (ft)</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    placeholder="0"
                    value={localArea.dimensions['width'] || ''}
                    onChange={e => setDimension('width', e.target.value)}
                    className="w-full px-4 py-4 rounded-xl border-2 border-slate/20
                      focus:border-teal focus:outline-none text-navy font-medium text-lg"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Notes */}
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-navy">
            Notes <span className="text-slate/50 font-normal">(optional)</span>
          </h3>
          <textarea
            value={localArea.notes}
            onChange={e => setLocalArea(prev => ({ ...prev, notes: e.target.value }))}
            placeholder="Any additional observations for this area..."
            rows={3}
            className="w-full px-4 py-3 rounded-xl border-2 border-slate/20
              focus:border-teal focus:outline-none text-navy resize-none
              placeholder:text-slate/40"
          />
        </div>

        {/* Spacer for sticky footer */}
        <div className="h-4" />
      </div>

      {/* Sticky footer actions */}
      <div className="fixed bottom-0 left-0 right-0 px-4 py-5 bg-gradient-to-t from-white via-white to-white/0">
        <div className="max-w-md mx-auto space-y-3">
          <button
            type="button"
            onClick={() => onComplete(localArea)}
            disabled={saving}
            className="w-full btn-primary py-5 px-6 rounded-2xl text-lg font-bold shadow-xl
              hover:shadow-2xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Saving...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                {isLastStep ? 'Review & Submit' : 'Next Area'}
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={onBack}
            className="w-full py-3 px-6 rounded-2xl text-sm font-medium text-slate hover:text-navy transition-colors"
          >
            ← Back
          </button>
        </div>
      </div>
    </div>
  )
}
