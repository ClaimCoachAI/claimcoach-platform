import { useState } from 'react'
import { StepProps, ScopeSheetData } from './types'

export default function Step9Dimensions({
  wizardState,
  onNext,
  onBack,
  submitting,
}: StepProps) {
  const [formData, setFormData] = useState({
    porch_paint: wizardState.wizardData.porch_paint || false,
    patio_paint: wizardState.wizardData.patio_paint || false,
    fence: wizardState.wizardData.fence || '',
    additional_items_main: wizardState.wizardData.additional_items_main || '',
    additional_items_other: wizardState.wizardData.additional_items_other || '',
    notes: wizardState.wizardData.notes || '',
  })

  const handleFieldChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleContinue = async () => {
    await onNext(formData as Partial<ScopeSheetData>)
  }

  return (
    <div className="min-h-[calc(100vh-200px)] px-4 py-8 pb-32">
      <div className="max-w-2xl mx-auto space-y-6">
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
            <h2 className="text-3xl font-display font-bold text-navy mb-2">
              Dimensions & Notes
            </h2>
            <p className="text-sm text-slate">Any additional observations</p>
          </div>
        </div>

        {/* Dimensions Section */}
        <section className="glass-card rounded-2xl p-5 space-y-3 animate-slide-up delay-100">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-teal/10 flex items-center justify-center">
              <svg className="w-4 h-4 text-teal" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            </div>
            <h3 className="text-base font-bold text-navy">Property Features</h3>
          </div>

          <div className="space-y-3">
            <label className="flex items-center gap-3 p-3 rounded-xl bg-slate/5 hover:bg-slate/10 transition-colors cursor-pointer">
              <input
                type="checkbox"
                checked={formData.porch_paint}
                onChange={(e) => handleFieldChange('porch_paint', e.target.checked)}
                className="w-5 h-5 rounded border-2 border-slate/30 text-teal focus:ring-2 focus:ring-teal/20 cursor-pointer"
              />
              <span className="text-sm font-medium text-navy">Porch Needs Paint</span>
            </label>

            <label className="flex items-center gap-3 p-3 rounded-xl bg-slate/5 hover:bg-slate/10 transition-colors cursor-pointer">
              <input
                type="checkbox"
                checked={formData.patio_paint}
                onChange={(e) => handleFieldChange('patio_paint', e.target.checked)}
                className="w-5 h-5 rounded border-2 border-slate/30 text-teal focus:ring-2 focus:ring-teal/20 cursor-pointer"
              />
              <span className="text-sm font-medium text-navy">Patio Needs Paint</span>
            </label>

            <div>
              <label className="block text-sm font-medium text-navy mb-1.5">Fence</label>
              <input
                type="text"
                value={formData.fence}
                onChange={(e) => handleFieldChange('fence', e.target.value)}
                placeholder="Describe fence damage if applicable"
                className="w-full px-4 py-3 rounded-xl glass-input text-navy placeholder-slate/40 focus:ring-2 focus:ring-teal/20 transition-all"
              />
            </div>
          </div>
        </section>

        {/* Additional Items Section */}
        <section className="glass-card rounded-2xl p-5 space-y-4 animate-slide-up delay-150">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-navy/10 flex items-center justify-center">
              <svg className="w-4 h-4 text-navy" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-base font-bold text-navy">Additional Observations</h3>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-navy mb-1.5">Additional Items (Main Roof)</label>
              <textarea
                value={formData.additional_items_main}
                onChange={(e) => handleFieldChange('additional_items_main', e.target.value)}
                rows={4}
                placeholder="Any additional main roof observations not captured above..."
                className="w-full px-4 py-3 rounded-xl glass-input text-navy placeholder-slate/40 focus:ring-2 focus:ring-teal/20 transition-all resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-navy mb-1.5">Additional Items (Secondary Roof)</label>
              <textarea
                value={formData.additional_items_other}
                onChange={(e) => handleFieldChange('additional_items_other', e.target.value)}
                rows={4}
                placeholder="Any additional secondary roof observations..."
                className="w-full px-4 py-3 rounded-xl glass-input text-navy placeholder-slate/40 focus:ring-2 focus:ring-teal/20 transition-all resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-navy mb-1.5">General Notes</label>
              <textarea
                value={formData.notes}
                onChange={(e) => handleFieldChange('notes', e.target.value)}
                rows={6}
                placeholder="Any other observations about the property damage, access issues, or important context..."
                className="w-full px-4 py-3 rounded-xl glass-input text-navy placeholder-slate/40 focus:ring-2 focus:ring-teal/20 transition-all resize-none"
              />
            </div>
          </div>
        </section>

        {/* Continue Button */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-white via-white to-transparent backdrop-blur-sm">
          <div className="max-w-2xl mx-auto">
            <button
              type="button"
              onClick={handleContinue}
              disabled={submitting}
              className="w-full btn-primary py-4 px-6 rounded-2xl text-base font-bold shadow-xl hover:shadow-2xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="flex items-center justify-center gap-2">
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
                    Continue to Review
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
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
