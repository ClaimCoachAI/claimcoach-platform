import { StepProps } from './types'

interface ExteriorSideFormProps extends StepProps {
  side: 'front' | 'right' | 'back' | 'left'
}

export default function ExteriorSideForm({
  side,
  wizardState,
  onNext,
  onBack,
  onUpdateData,
  submitting,
}: ExteriorSideFormProps) {
  // Capitalize side name for display
  const sideName = side.charAt(0).toUpperCase() + side.slice(1)

  // Get field values with side prefix
  const getFieldValue = (fieldName: string) => {
    const fullFieldName = `${side}_${fieldName}`
    return (wizardState.wizardData as any)[fullFieldName] || ''
  }

  // Update field with side prefix
  const handleFieldChange = (fieldName: string, value: string | boolean | number) => {
    const fullFieldName = `${side}_${fieldName}`
    onUpdateData({ [fullFieldName]: value } as any)
  }

  const handleContinue = async () => {
    await onNext()
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
              {sideName} Exterior
            </h2>
            <p className="text-sm text-slate">All fields are optional - document visible damage</p>
          </div>
        </div>

        {/* Siding Section */}
        <section className="glass-card rounded-2xl p-5 space-y-4 animate-slide-up delay-100">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-teal/10 flex items-center justify-center">
              <svg className="w-4 h-4 text-teal" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <h3 className="text-base font-bold text-navy">Siding</h3>
          </div>

          <div className="space-y-4">
            {/* Siding 1 */}
            <div className="p-4 rounded-xl bg-slate/5">
              <p className="text-sm font-semibold text-navy mb-3">Siding Type 1</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-navy/60 mb-1.5">Replace (SF)</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={getFieldValue('siding_1_replace_sf')}
                    onChange={(e) => handleFieldChange('siding_1_replace_sf', e.target.value)}
                    placeholder="0"
                    className="w-full px-3 py-2.5 rounded-lg glass-input text-navy placeholder-slate/40 text-sm focus:ring-2 focus:ring-teal/20 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-navy/60 mb-1.5">Paint (SF)</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={getFieldValue('siding_1_paint_sf')}
                    onChange={(e) => handleFieldChange('siding_1_paint_sf', e.target.value)}
                    placeholder="0"
                    className="w-full px-3 py-2.5 rounded-lg glass-input text-navy placeholder-slate/40 text-sm focus:ring-2 focus:ring-teal/20 transition-all"
                  />
                </div>
              </div>
            </div>

            {/* Siding 2 */}
            <div className="p-4 rounded-xl bg-slate/5">
              <p className="text-sm font-semibold text-navy mb-3">Siding Type 2</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-navy/60 mb-1.5">Replace (SF)</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={getFieldValue('siding_2_replace_sf')}
                    onChange={(e) => handleFieldChange('siding_2_replace_sf', e.target.value)}
                    placeholder="0"
                    className="w-full px-3 py-2.5 rounded-lg glass-input text-navy placeholder-slate/40 text-sm focus:ring-2 focus:ring-teal/20 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-navy/60 mb-1.5">Paint (SF)</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={getFieldValue('siding_2_paint_sf')}
                    onChange={(e) => handleFieldChange('siding_2_paint_sf', e.target.value)}
                    placeholder="0"
                    className="w-full px-3 py-2.5 rounded-lg glass-input text-navy placeholder-slate/40 text-sm focus:ring-2 focus:ring-teal/20 transition-all"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Gutters Section */}
        <section className="glass-card rounded-2xl p-5 space-y-4 animate-slide-up delay-150">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-navy/10 flex items-center justify-center">
              <svg className="w-4 h-4 text-navy" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            </div>
            <h3 className="text-base font-bold text-navy">Gutters</h3>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-navy mb-1.5">Linear Feet</label>
              <input
                type="number"
                inputMode="decimal"
                value={getFieldValue('gutters_lf')}
                onChange={(e) => handleFieldChange('gutters_lf', e.target.value)}
                placeholder="e.g., 40"
                className="w-full px-4 py-3 rounded-xl glass-input text-navy placeholder-slate/40 focus:ring-2 focus:ring-teal/20 transition-all"
              />
            </div>

            <label className="flex items-center gap-3 p-3 rounded-xl bg-slate/5 hover:bg-slate/10 transition-colors cursor-pointer">
              <input
                type="checkbox"
                checked={!!getFieldValue('gutters_paint')}
                onChange={(e) => handleFieldChange('gutters_paint', e.target.checked)}
                className="w-5 h-5 rounded border-2 border-slate/30 text-teal focus:ring-2 focus:ring-teal/20 cursor-pointer"
              />
              <span className="text-sm font-medium text-navy">Needs Paint</span>
            </label>
          </div>
        </section>

        {/* Openings Section */}
        <section className="glass-card rounded-2xl p-5 space-y-4 animate-slide-up delay-200">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-teal/10 flex items-center justify-center">
              <svg className="w-4 h-4 text-teal" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
              </svg>
            </div>
            <h3 className="text-base font-bold text-navy">Openings</h3>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-navy mb-1.5">Windows</label>
              <input
                type="text"
                value={getFieldValue('windows')}
                onChange={(e) => handleFieldChange('windows', e.target.value)}
                placeholder="e.g., 3 double-hung, 1 casement"
                className="w-full px-4 py-3 rounded-xl glass-input text-navy placeholder-slate/40 focus:ring-2 focus:ring-teal/20 transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-navy mb-1.5">Screens</label>
              <input
                type="text"
                value={getFieldValue('screens')}
                onChange={(e) => handleFieldChange('screens', e.target.value)}
                placeholder="e.g., 2 torn, 1 missing"
                className="w-full px-4 py-3 rounded-xl glass-input text-navy placeholder-slate/40 focus:ring-2 focus:ring-teal/20 transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-navy mb-1.5">Doors</label>
              <input
                type="text"
                value={getFieldValue('doors')}
                onChange={(e) => handleFieldChange('doors', e.target.value)}
                placeholder="e.g., Front door damaged"
                className="w-full px-4 py-3 rounded-xl glass-input text-navy placeholder-slate/40 focus:ring-2 focus:ring-teal/20 transition-all"
              />
            </div>
          </div>
        </section>

        {/* AC Unit Section */}
        <section className="glass-card rounded-2xl p-5 space-y-3 animate-slide-up delay-250">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-navy/10 flex items-center justify-center">
              <svg className="w-4 h-4 text-navy" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
              </svg>
            </div>
            <h3 className="text-base font-bold text-navy">AC Unit</h3>
          </div>

          <div className="space-y-3">
            <label className="flex items-center gap-3 p-3 rounded-xl bg-slate/5 hover:bg-slate/10 transition-colors cursor-pointer">
              <input
                type="checkbox"
                checked={!!getFieldValue('ac_replace')}
                onChange={(e) => handleFieldChange('ac_replace', e.target.checked)}
                className="w-5 h-5 rounded border-2 border-slate/30 text-teal focus:ring-2 focus:ring-teal/20 cursor-pointer"
              />
              <span className="text-sm font-medium text-navy">Replace Unit</span>
            </label>

            <label className="flex items-center gap-3 p-3 rounded-xl bg-slate/5 hover:bg-slate/10 transition-colors cursor-pointer">
              <input
                type="checkbox"
                checked={!!getFieldValue('ac_comb_fins')}
                onChange={(e) => handleFieldChange('ac_comb_fins', e.target.checked)}
                className="w-5 h-5 rounded border-2 border-slate/30 text-teal focus:ring-2 focus:ring-teal/20 cursor-pointer"
              />
              <span className="text-sm font-medium text-navy">Comb Fins Damaged</span>
            </label>
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
                    Continue
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
