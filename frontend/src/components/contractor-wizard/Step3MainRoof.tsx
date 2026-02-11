import { useState } from 'react'
import { StepProps } from './types'

interface Step3MainRoofProps extends StepProps {
  setHasSecondaryRoof: (has: boolean) => void
}

export default function Step3MainRoof({
  wizardState,
  onNext,
  onBack,
  submitting,
  setHasSecondaryRoof,
}: Step3MainRoofProps) {
  const [formData, setFormData] = useState({
    // Basic Info
    roof_type: wizardState.wizardData.roof_type || '',
    roof_pitch: wizardState.wizardData.roof_pitch || '',
    roof_square_footage: wizardState.wizardData.roof_square_footage || '',

    // Fascia
    fascia_lf: wizardState.wizardData.fascia_lf || '',
    fascia_paint: wizardState.wizardData.fascia_paint || false,

    // Soffit
    soffit_lf: wizardState.wizardData.soffit_lf || '',
    soffit_paint: wizardState.wizardData.soffit_paint || false,

    // Drip Edge
    drip_edge_lf: wizardState.wizardData.drip_edge_lf || '',
    drip_edge_paint: wizardState.wizardData.drip_edge_paint || false,

    // Vents & Accessories
    pipe_jacks_count: wizardState.wizardData.pipe_jacks_count || '',
    pipe_jacks_paint: wizardState.wizardData.pipe_jacks_paint || false,
    ex_vents_count: wizardState.wizardData.ex_vents_count || '',
    ex_vents_paint: wizardState.wizardData.ex_vents_paint || false,
    turbines_count: wizardState.wizardData.turbines_count || '',
    turbines_paint: wizardState.wizardData.turbines_paint || false,
    furnaces_count: wizardState.wizardData.furnaces_count || '',
    furnaces_paint: wizardState.wizardData.furnaces_paint || false,
    power_vents_count: wizardState.wizardData.power_vents_count || '',
    power_vents_paint: wizardState.wizardData.power_vents_paint || false,

    // Other Items
    ridge_lf: wizardState.wizardData.ridge_lf || '',
    satellites_count: wizardState.wizardData.satellites_count || '',
    step_flashing_lf: wizardState.wizardData.step_flashing_lf || '',
    chimney_flashing: wizardState.wizardData.chimney_flashing || false,
    rain_diverter_lf: wizardState.wizardData.rain_diverter_lf || '',
    skylights_count: wizardState.wizardData.skylights_count || '',
  })

  const [secondaryRoof, setSecondaryRoof] = useState<boolean | null>(
    wizardState.hasSecondaryRoof
  )

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleContinue = async () => {
    if (secondaryRoof === null) {
      alert('Please indicate if there is a secondary roof structure')
      return
    }

    setHasSecondaryRoof(secondaryRoof)
    await onNext(formData as any)
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
              Main Roof Assessment
            </h2>
            <p className="text-sm text-slate">All fields are optional - fill in what applies</p>
          </div>
        </div>

        {/* Basic Info Section */}
        <section className="glass-card rounded-2xl p-5 space-y-4 animate-slide-up delay-100">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-teal/10 flex items-center justify-center">
              <svg className="w-4 h-4 text-teal" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-base font-bold text-navy">Basic Information</h3>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-navy mb-1.5">Roof Type</label>
              <input
                type="text"
                value={formData.roof_type}
                onChange={(e) => handleInputChange('roof_type', e.target.value)}
                placeholder="e.g., Composition Shingle"
                className="w-full px-4 py-3 rounded-xl glass-input text-navy placeholder-slate/40 focus:ring-2 focus:ring-teal/20 transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-navy mb-1.5">Roof Pitch</label>
              <input
                type="text"
                value={formData.roof_pitch}
                onChange={(e) => handleInputChange('roof_pitch', e.target.value)}
                placeholder="e.g., 6/12"
                className="w-full px-4 py-3 rounded-xl glass-input text-navy placeholder-slate/40 focus:ring-2 focus:ring-teal/20 transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-navy mb-1.5">Square Footage</label>
              <input
                type="number"
                inputMode="decimal"
                value={formData.roof_square_footage}
                onChange={(e) => handleInputChange('roof_square_footage', e.target.value)}
                placeholder="e.g., 2400"
                className="w-full px-4 py-3 rounded-xl glass-input text-navy placeholder-slate/40 focus:ring-2 focus:ring-teal/20 transition-all"
              />
            </div>
          </div>
        </section>

        {/* Fascia Section */}
        <section className="glass-card rounded-2xl p-5 space-y-4 animate-slide-up delay-150">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-navy/10 flex items-center justify-center">
              <svg className="w-4 h-4 text-navy" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 8h16M4 16h16" />
              </svg>
            </div>
            <h3 className="text-base font-bold text-navy">Fascia</h3>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-navy mb-1.5">Linear Feet</label>
              <input
                type="number"
                inputMode="decimal"
                value={formData.fascia_lf}
                onChange={(e) => handleInputChange('fascia_lf', e.target.value)}
                placeholder="e.g., 120"
                className="w-full px-4 py-3 rounded-xl glass-input text-navy placeholder-slate/40 focus:ring-2 focus:ring-teal/20 transition-all"
              />
            </div>

            <label className="flex items-center gap-3 p-3 rounded-xl bg-slate/5 hover:bg-slate/10 transition-colors cursor-pointer">
              <input
                type="checkbox"
                checked={formData.fascia_paint}
                onChange={(e) => handleInputChange('fascia_paint', e.target.checked)}
                className="w-5 h-5 rounded border-2 border-slate/30 text-teal focus:ring-2 focus:ring-teal/20 cursor-pointer"
              />
              <span className="text-sm font-medium text-navy">Needs Paint</span>
            </label>
          </div>
        </section>

        {/* Soffit Section */}
        <section className="glass-card rounded-2xl p-5 space-y-4 animate-slide-up delay-200">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-navy/10 flex items-center justify-center">
              <svg className="w-4 h-4 text-navy" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 8h16M4 16h16" />
              </svg>
            </div>
            <h3 className="text-base font-bold text-navy">Soffit</h3>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-navy mb-1.5">Linear Feet</label>
              <input
                type="number"
                inputMode="decimal"
                value={formData.soffit_lf}
                onChange={(e) => handleInputChange('soffit_lf', e.target.value)}
                placeholder="e.g., 110"
                className="w-full px-4 py-3 rounded-xl glass-input text-navy placeholder-slate/40 focus:ring-2 focus:ring-teal/20 transition-all"
              />
            </div>

            <label className="flex items-center gap-3 p-3 rounded-xl bg-slate/5 hover:bg-slate/10 transition-colors cursor-pointer">
              <input
                type="checkbox"
                checked={formData.soffit_paint}
                onChange={(e) => handleInputChange('soffit_paint', e.target.checked)}
                className="w-5 h-5 rounded border-2 border-slate/30 text-teal focus:ring-2 focus:ring-teal/20 cursor-pointer"
              />
              <span className="text-sm font-medium text-navy">Needs Paint</span>
            </label>
          </div>
        </section>

        {/* Drip Edge Section */}
        <section className="glass-card rounded-2xl p-5 space-y-4 animate-slide-up delay-250">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-navy/10 flex items-center justify-center">
              <svg className="w-4 h-4 text-navy" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            </div>
            <h3 className="text-base font-bold text-navy">Drip Edge</h3>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-navy mb-1.5">Linear Feet</label>
              <input
                type="number"
                inputMode="decimal"
                value={formData.drip_edge_lf}
                onChange={(e) => handleInputChange('drip_edge_lf', e.target.value)}
                placeholder="e.g., 130"
                className="w-full px-4 py-3 rounded-xl glass-input text-navy placeholder-slate/40 focus:ring-2 focus:ring-teal/20 transition-all"
              />
            </div>

            <label className="flex items-center gap-3 p-3 rounded-xl bg-slate/5 hover:bg-slate/10 transition-colors cursor-pointer">
              <input
                type="checkbox"
                checked={formData.drip_edge_paint}
                onChange={(e) => handleInputChange('drip_edge_paint', e.target.checked)}
                className="w-5 h-5 rounded border-2 border-slate/30 text-teal focus:ring-2 focus:ring-teal/20 cursor-pointer"
              />
              <span className="text-sm font-medium text-navy">Needs Paint</span>
            </label>
          </div>
        </section>

        {/* Vents & Accessories Section */}
        <section className="glass-card rounded-2xl p-5 space-y-4 animate-slide-up delay-300">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-teal/10 flex items-center justify-center">
              <svg className="w-4 h-4 text-teal" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
              </svg>
            </div>
            <h3 className="text-base font-bold text-navy">Vents & Accessories</h3>
          </div>

          <div className="space-y-4">
            {[
              { label: 'Pipe Jacks', countField: 'pipe_jacks_count', paintField: 'pipe_jacks_paint' },
              { label: 'Ex Vents', countField: 'ex_vents_count', paintField: 'ex_vents_paint' },
              { label: 'Turbines', countField: 'turbines_count', paintField: 'turbines_paint' },
              { label: 'Furnaces', countField: 'furnaces_count', paintField: 'furnaces_paint' },
              { label: 'Power Vents', countField: 'power_vents_count', paintField: 'power_vents_paint' },
            ].map((item) => (
              <div key={item.countField} className="p-3 rounded-xl bg-slate/5">
                <p className="text-sm font-semibold text-navy mb-2">{item.label}</p>
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <input
                      type="number"
                      inputMode="numeric"
                      value={formData[item.countField as keyof typeof formData] as string}
                      onChange={(e) => handleInputChange(item.countField, e.target.value)}
                      placeholder="Count"
                      className="w-full px-3 py-2 rounded-lg glass-input text-navy placeholder-slate/40 text-sm focus:ring-2 focus:ring-teal/20 transition-all"
                    />
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData[item.paintField as keyof typeof formData] as boolean}
                      onChange={(e) => handleInputChange(item.paintField, e.target.checked)}
                      className="w-4 h-4 rounded border-2 border-slate/30 text-teal focus:ring-2 focus:ring-teal/20 cursor-pointer"
                    />
                    <span className="text-xs font-medium text-navy whitespace-nowrap">Needs Paint</span>
                  </label>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Other Items Section */}
        <section className="glass-card rounded-2xl p-5 space-y-4 animate-slide-up delay-350">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-navy/10 flex items-center justify-center">
              <svg className="w-4 h-4 text-navy" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </div>
            <h3 className="text-base font-bold text-navy">Other Items</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { label: 'Ridge', field: 'ridge_lf', placeholder: 'Linear feet' },
              { label: 'Satellites', field: 'satellites_count', placeholder: 'Count' },
              { label: 'Step Flashing', field: 'step_flashing_lf', placeholder: 'Linear feet' },
              { label: 'Chimney Flashing', field: 'chimney_flashing', placeholder: 'Yes/No' },
              { label: 'Rain Diverter', field: 'rain_diverter_lf', placeholder: 'Linear feet' },
              { label: 'Skylights', field: 'skylights_count', placeholder: 'Count' },
            ].map((item) => (
              <div key={item.field}>
                <label className="block text-sm font-medium text-navy mb-1.5">{item.label}</label>
                <input
                  type="text"
                  value={formData[item.field as keyof typeof formData] as string}
                  onChange={(e) => handleInputChange(item.field, e.target.value)}
                  placeholder={item.placeholder}
                  className="w-full px-3 py-2.5 rounded-lg glass-input text-navy placeholder-slate/40 text-sm focus:ring-2 focus:ring-teal/20 transition-all"
                />
              </div>
            ))}
          </div>
        </section>

        {/* Secondary Roof Question */}
        <section className="glass-card-strong rounded-2xl p-6 space-y-4 animate-slide-up delay-400 border-2 border-teal/20">
          <div>
            <h3 className="text-lg font-display font-bold text-navy mb-1">
              Is there a secondary roof structure?
            </h3>
            <p className="text-sm text-slate">
              Such as a garage, porch, or separate structure
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setSecondaryRoof(true)}
              className={`
                py-4 px-6 rounded-xl font-bold text-base transition-all
                ${
                  secondaryRoof === true
                    ? 'bg-teal text-white shadow-lg scale-105'
                    : 'bg-slate/10 text-navy hover:bg-slate/20'
                }
              `}
            >
              <div className="flex flex-col items-center gap-2">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Yes
              </div>
            </button>

            <button
              type="button"
              onClick={() => setSecondaryRoof(false)}
              className={`
                py-4 px-6 rounded-xl font-bold text-base transition-all
                ${
                  secondaryRoof === false
                    ? 'bg-teal text-white shadow-lg scale-105'
                    : 'bg-slate/10 text-navy hover:bg-slate/20'
                }
              `}
            >
              <div className="flex flex-col items-center gap-2">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
                No
              </div>
            </button>
          </div>
        </section>

        {/* Continue Button */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-white via-white to-transparent backdrop-blur-sm">
          <div className="max-w-2xl mx-auto">
            <button
              type="button"
              onClick={handleContinue}
              disabled={submitting || secondaryRoof === null}
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
