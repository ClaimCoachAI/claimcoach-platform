import { useState } from 'react'

interface ScopeSheetFormProps {
  onSubmit: (data: ScopeSheetData) => void
  onBack: () => void
  submitting?: boolean
}

export interface ScopeSheetData {
  // Roof Main
  roof_type?: string
  roof_square_footage?: number
  roof_pitch?: string
  fascia_lf?: number
  fascia_paint: boolean
  soffit_lf?: number
  soffit_paint: boolean
  drip_edge_lf?: number
  drip_edge_paint: boolean
  pipe_jacks_count?: number
  pipe_jacks_paint: boolean
  ex_vents_count?: number
  ex_vents_paint: boolean
  turbines_count?: number
  turbines_paint: boolean
  furnaces_count?: number
  furnaces_paint: boolean
  power_vents_count?: number
  power_vents_paint: boolean
  ridge_lf?: number
  satellites_count?: number
  step_flashing_lf?: number
  chimney_flashing: boolean
  rain_diverter_lf?: number
  skylights_count?: number
  skylights_damaged: boolean

  // Roof Other
  roof_other_type?: string
  roof_other_pitch?: string
  roof_other_fascia_lf?: number
  roof_other_fascia_paint: boolean
  roof_other_soffit_lf?: number
  roof_other_soffit_paint: boolean
  roof_other_drip_edge_lf?: number
  roof_other_drip_edge_paint: boolean
  roof_other_pipe_jacks_count?: number
  roof_other_pipe_jacks_paint: boolean
  roof_other_ex_vents_count?: number
  roof_other_ex_vents_paint: boolean
  roof_other_turbines_count?: number
  roof_other_turbines_paint: boolean
  roof_other_furnaces_count?: number
  roof_other_furnaces_paint: boolean
  roof_other_power_vents_count?: number
  roof_other_power_vents_paint: boolean
  roof_other_ridge_lf?: number
  roof_other_satellites_count?: number
  roof_other_step_flashing_lf?: number
  roof_other_chimney_flashing: boolean
  roof_other_rain_diverter_lf?: number
  roof_other_skylights_count?: number
  roof_other_skylights_damaged: boolean

  // Dimensions
  porch_paint: boolean
  patio_paint: boolean
  fence?: string

  // Siding - Front
  front_siding_1_replace_sf?: number
  front_siding_1_paint_sf?: number
  front_siding_2_replace_sf?: number
  front_siding_2_paint_sf?: number
  front_gutters_lf?: number
  front_gutters_paint: boolean
  front_windows?: string
  front_screens?: string
  front_doors?: string
  front_ac_replace: boolean
  front_ac_comb_fins: boolean

  // Siding - Right
  right_siding_1_replace_sf?: number
  right_siding_1_paint_sf?: number
  right_siding_2_replace_sf?: number
  right_siding_2_paint_sf?: number
  right_gutters_lf?: number
  right_gutters_paint: boolean
  right_windows?: string
  right_screens?: string
  right_doors?: string
  right_ac_replace: boolean
  right_ac_comb_fins: boolean

  // Siding - Back
  back_siding_1_replace_sf?: number
  back_siding_1_paint_sf?: number
  back_siding_2_replace_sf?: number
  back_siding_2_paint_sf?: number
  back_gutters_lf?: number
  back_gutters_paint: boolean
  back_windows?: string
  back_screens?: string
  back_doors?: string
  back_ac_replace: boolean
  back_ac_comb_fins: boolean

  // Siding - Left
  left_siding_1_replace_sf?: number
  left_siding_1_paint_sf?: number
  left_siding_2_replace_sf?: number
  left_siding_2_paint_sf?: number
  left_gutters_lf?: number
  left_gutters_paint: boolean
  left_windows?: string
  left_screens?: string
  left_doors?: string
  left_ac_replace: boolean
  left_ac_comb_fins: boolean

  // Additional
  additional_items_main?: string
  additional_items_other?: string
  notes?: string
}

export function ScopeSheetForm({ onSubmit, onBack, submitting = false }: ScopeSheetFormProps) {
  const [formData, setFormData] = useState<ScopeSheetData>({
    // Initialize all boolean fields to false
    fascia_paint: false,
    soffit_paint: false,
    drip_edge_paint: false,
    pipe_jacks_paint: false,
    ex_vents_paint: false,
    turbines_paint: false,
    furnaces_paint: false,
    power_vents_paint: false,
    chimney_flashing: false,
    skylights_damaged: false,
    roof_other_fascia_paint: false,
    roof_other_soffit_paint: false,
    roof_other_drip_edge_paint: false,
    roof_other_pipe_jacks_paint: false,
    roof_other_ex_vents_paint: false,
    roof_other_turbines_paint: false,
    roof_other_furnaces_paint: false,
    roof_other_power_vents_paint: false,
    roof_other_chimney_flashing: false,
    roof_other_skylights_damaged: false,
    porch_paint: false,
    patio_paint: false,
    front_gutters_paint: false,
    front_ac_replace: false,
    front_ac_comb_fins: false,
    right_gutters_paint: false,
    right_ac_replace: false,
    right_ac_comb_fins: false,
    back_gutters_paint: false,
    back_ac_replace: false,
    back_ac_comb_fins: false,
    left_gutters_paint: false,
    left_ac_replace: false,
    left_ac_comb_fins: false,
  })

  const [activeTab, setActiveTab] = useState<'roof-main' | 'roof-other' | 'exterior' | 'additional'>('roof-main')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(formData)
  }

  const updateField = (field: keyof ScopeSheetData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Tab Navigation */}
      <div className="flex border-b border-gray-200 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('roof-main')}
          className={`px-4 py-2 text-sm font-medium whitespace-nowrap ${
            activeTab === 'roof-main'
              ? 'border-b-2 border-blue-500 text-blue-600'
              : 'text-gray-600 hover:text-gray-800'
          }`}
          disabled={submitting}
        >
          Roof (Main)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('roof-other')}
          className={`px-4 py-2 text-sm font-medium whitespace-nowrap ${
            activeTab === 'roof-other'
              ? 'border-b-2 border-blue-500 text-blue-600'
              : 'text-gray-600 hover:text-gray-800'
          }`}
          disabled={submitting}
        >
          Roof (Other)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('exterior')}
          className={`px-4 py-2 text-sm font-medium whitespace-nowrap ${
            activeTab === 'exterior'
              ? 'border-b-2 border-blue-500 text-blue-600'
              : 'text-gray-600 hover:text-gray-800'
          }`}
          disabled={submitting}
        >
          Exterior
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('additional')}
          className={`px-4 py-2 text-sm font-medium whitespace-nowrap ${
            activeTab === 'additional'
              ? 'border-b-2 border-blue-500 text-blue-600'
              : 'text-gray-600 hover:text-gray-800'
          }`}
          disabled={submitting}
        >
          Additional
        </button>
      </div>

      {/* Roof Main Tab */}
      {activeTab === 'roof-main' && (
        <div className="space-y-6">
          <h3 className="text-lg font-semibold text-gray-900">Main Roof</h3>

          {/* Basic Roof Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Roof Type</label>
              <input
                type="text"
                value={formData.roof_type || ''}
                onChange={(e) => updateField('roof_type', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., Composition Shingle"
                disabled={submitting}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Roof Pitch</label>
              <input
                type="text"
                value={formData.roof_pitch || ''}
                onChange={(e) => updateField('roof_pitch', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., 4/12"
                disabled={submitting}
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Square Footage</label>
              <input
                type="number"
                value={formData.roof_square_footage || ''}
                onChange={(e) => updateField('roof_square_footage', e.target.value ? parseInt(e.target.value) : undefined)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Total square footage"
                disabled={submitting}
              />
            </div>
          </div>

          {/* Fascia */}
          <div className="bg-gray-50 p-4 rounded-md">
            <h4 className="font-medium text-gray-900 mb-3">Fascia</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Linear Feet (LF)</label>
                <input
                  type="number"
                  value={formData.fascia_lf || ''}
                  onChange={(e) => updateField('fascia_lf', e.target.value ? parseInt(e.target.value) : undefined)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={submitting}
                />
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.fascia_paint}
                  onChange={(e) => updateField('fascia_paint', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  disabled={submitting}
                />
                <label className="ml-2 text-sm text-gray-700">Needs Paint</label>
              </div>
            </div>
          </div>

          {/* Soffit */}
          <div className="bg-gray-50 p-4 rounded-md">
            <h4 className="font-medium text-gray-900 mb-3">Soffit</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Linear Feet (LF)</label>
                <input
                  type="number"
                  value={formData.soffit_lf || ''}
                  onChange={(e) => updateField('soffit_lf', e.target.value ? parseInt(e.target.value) : undefined)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={submitting}
                />
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.soffit_paint}
                  onChange={(e) => updateField('soffit_paint', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  disabled={submitting}
                />
                <label className="ml-2 text-sm text-gray-700">Needs Paint</label>
              </div>
            </div>
          </div>

          {/* Drip Edge */}
          <div className="bg-gray-50 p-4 rounded-md">
            <h4 className="font-medium text-gray-900 mb-3">Drip Edge</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Linear Feet (LF)</label>
                <input
                  type="number"
                  value={formData.drip_edge_lf || ''}
                  onChange={(e) => updateField('drip_edge_lf', e.target.value ? parseInt(e.target.value) : undefined)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={submitting}
                />
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.drip_edge_paint}
                  onChange={(e) => updateField('drip_edge_paint', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  disabled={submitting}
                />
                <label className="ml-2 text-sm text-gray-700">Needs Paint</label>
              </div>
            </div>
          </div>

          {/* Vents and Accessories */}
          <div className="space-y-4">
            <h4 className="font-medium text-gray-900">Vents & Accessories</h4>

            {/* Pipe Jacks */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 p-3 rounded">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Pipe Jacks (Count)</label>
                <input
                  type="number"
                  value={formData.pipe_jacks_count || ''}
                  onChange={(e) => updateField('pipe_jacks_count', e.target.value ? parseInt(e.target.value) : undefined)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={submitting}
                />
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.pipe_jacks_paint}
                  onChange={(e) => updateField('pipe_jacks_paint', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  disabled={submitting}
                />
                <label className="ml-2 text-sm text-gray-700">Needs Paint</label>
              </div>
            </div>

            {/* Ex Vents */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 p-3 rounded">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ex Vents (Count)</label>
                <input
                  type="number"
                  value={formData.ex_vents_count || ''}
                  onChange={(e) => updateField('ex_vents_count', e.target.value ? parseInt(e.target.value) : undefined)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={submitting}
                />
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.ex_vents_paint}
                  onChange={(e) => updateField('ex_vents_paint', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  disabled={submitting}
                />
                <label className="ml-2 text-sm text-gray-700">Needs Paint</label>
              </div>
            </div>

            {/* Turbines */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 p-3 rounded">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Turbines (Count)</label>
                <input
                  type="number"
                  value={formData.turbines_count || ''}
                  onChange={(e) => updateField('turbines_count', e.target.value ? parseInt(e.target.value) : undefined)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={submitting}
                />
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.turbines_paint}
                  onChange={(e) => updateField('turbines_paint', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  disabled={submitting}
                />
                <label className="ml-2 text-sm text-gray-700">Needs Paint</label>
              </div>
            </div>

            {/* Furnaces */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 p-3 rounded">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Furnaces (Count)</label>
                <input
                  type="number"
                  value={formData.furnaces_count || ''}
                  onChange={(e) => updateField('furnaces_count', e.target.value ? parseInt(e.target.value) : undefined)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={submitting}
                />
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.furnaces_paint}
                  onChange={(e) => updateField('furnaces_paint', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  disabled={submitting}
                />
                <label className="ml-2 text-sm text-gray-700">Needs Paint</label>
              </div>
            </div>

            {/* Power Vents */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 p-3 rounded">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Power Vents (Count)</label>
                <input
                  type="number"
                  value={formData.power_vents_count || ''}
                  onChange={(e) => updateField('power_vents_count', e.target.value ? parseInt(e.target.value) : undefined)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={submitting}
                />
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.power_vents_paint}
                  onChange={(e) => updateField('power_vents_paint', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  disabled={submitting}
                />
                <label className="ml-2 text-sm text-gray-700">Needs Paint</label>
              </div>
            </div>
          </div>

          {/* Other Roof Items */}
          <div className="space-y-4">
            <h4 className="font-medium text-gray-900">Other Items</h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ridge (LF)</label>
                <input
                  type="number"
                  value={formData.ridge_lf || ''}
                  onChange={(e) => updateField('ridge_lf', e.target.value ? parseInt(e.target.value) : undefined)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={submitting}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Satellites (Count)</label>
                <input
                  type="number"
                  value={formData.satellites_count || ''}
                  onChange={(e) => updateField('satellites_count', e.target.value ? parseInt(e.target.value) : undefined)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={submitting}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Step Flashing (LF)</label>
                <input
                  type="number"
                  value={formData.step_flashing_lf || ''}
                  onChange={(e) => updateField('step_flashing_lf', e.target.value ? parseInt(e.target.value) : undefined)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={submitting}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rain Diverter (LF)</label>
                <input
                  type="number"
                  value={formData.rain_diverter_lf || ''}
                  onChange={(e) => updateField('rain_diverter_lf', e.target.value ? parseInt(e.target.value) : undefined)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={submitting}
                />
              </div>
            </div>

            <div className="flex items-center space-x-6">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.chimney_flashing}
                  onChange={(e) => updateField('chimney_flashing', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  disabled={submitting}
                />
                <label className="ml-2 text-sm text-gray-700">Chimney Flashing</label>
              </div>
            </div>

            {/* Skylights */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 p-3 rounded">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Skylights (Count)</label>
                <input
                  type="number"
                  value={formData.skylights_count || ''}
                  onChange={(e) => updateField('skylights_count', e.target.value ? parseInt(e.target.value) : undefined)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={submitting}
                />
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.skylights_damaged}
                  onChange={(e) => updateField('skylights_damaged', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  disabled={submitting}
                />
                <label className="ml-2 text-sm text-gray-700">Damaged</label>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Roof Other Tab */}
      {activeTab === 'roof-other' && (
        <div className="space-y-6">
          <h3 className="text-lg font-semibold text-gray-900">Other Roof Structure</h3>
          <p className="text-sm text-gray-600">If the property has a secondary roof structure (e.g., garage, porch), fill out this section.</p>

          {/* Basic Roof Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Roof Type</label>
              <input
                type="text"
                value={formData.roof_other_type || ''}
                onChange={(e) => updateField('roof_other_type', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., Hip"
                disabled={submitting}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Roof Pitch</label>
              <input
                type="text"
                value={formData.roof_other_pitch || ''}
                onChange={(e) => updateField('roof_other_pitch', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., 4/12"
                disabled={submitting}
              />
            </div>
          </div>

          {/* Fascia */}
          <div className="bg-gray-50 p-4 rounded-md">
            <h4 className="font-medium text-gray-900 mb-3">Fascia</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Linear Feet (LF)</label>
                <input
                  type="number"
                  value={formData.roof_other_fascia_lf || ''}
                  onChange={(e) => updateField('roof_other_fascia_lf', e.target.value ? parseInt(e.target.value) : undefined)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={submitting}
                />
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.roof_other_fascia_paint}
                  onChange={(e) => updateField('roof_other_fascia_paint', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  disabled={submitting}
                />
                <label className="ml-2 text-sm text-gray-700">Needs Paint</label>
              </div>
            </div>
          </div>

          {/* Soffit */}
          <div className="bg-gray-50 p-4 rounded-md">
            <h4 className="font-medium text-gray-900 mb-3">Soffit</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Linear Feet (LF)</label>
                <input
                  type="number"
                  value={formData.roof_other_soffit_lf || ''}
                  onChange={(e) => updateField('roof_other_soffit_lf', e.target.value ? parseInt(e.target.value) : undefined)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={submitting}
                />
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.roof_other_soffit_paint}
                  onChange={(e) => updateField('roof_other_soffit_paint', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  disabled={submitting}
                />
                <label className="ml-2 text-sm text-gray-700">Needs Paint</label>
              </div>
            </div>
          </div>

          {/* Drip Edge */}
          <div className="bg-gray-50 p-4 rounded-md">
            <h4 className="font-medium text-gray-900 mb-3">Drip Edge</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Linear Feet (LF)</label>
                <input
                  type="number"
                  value={formData.roof_other_drip_edge_lf || ''}
                  onChange={(e) => updateField('roof_other_drip_edge_lf', e.target.value ? parseInt(e.target.value) : undefined)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={submitting}
                />
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.roof_other_drip_edge_paint}
                  onChange={(e) => updateField('roof_other_drip_edge_paint', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  disabled={submitting}
                />
                <label className="ml-2 text-sm text-gray-700">Needs Paint</label>
              </div>
            </div>
          </div>

          {/* Vents and Accessories */}
          <div className="space-y-4">
            <h4 className="font-medium text-gray-900">Vents & Accessories</h4>

            {/* Pipe Jacks */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 p-3 rounded">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Pipe Jacks (Count)</label>
                <input
                  type="number"
                  value={formData.roof_other_pipe_jacks_count || ''}
                  onChange={(e) => updateField('roof_other_pipe_jacks_count', e.target.value ? parseInt(e.target.value) : undefined)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={submitting}
                />
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.roof_other_pipe_jacks_paint}
                  onChange={(e) => updateField('roof_other_pipe_jacks_paint', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  disabled={submitting}
                />
                <label className="ml-2 text-sm text-gray-700">Needs Paint</label>
              </div>
            </div>

            {/* Ex Vents */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 p-3 rounded">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ex Vents (Count)</label>
                <input
                  type="number"
                  value={formData.roof_other_ex_vents_count || ''}
                  onChange={(e) => updateField('roof_other_ex_vents_count', e.target.value ? parseInt(e.target.value) : undefined)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={submitting}
                />
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.roof_other_ex_vents_paint}
                  onChange={(e) => updateField('roof_other_ex_vents_paint', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  disabled={submitting}
                />
                <label className="ml-2 text-sm text-gray-700">Needs Paint</label>
              </div>
            </div>

            {/* Turbines */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 p-3 rounded">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Turbines (Count)</label>
                <input
                  type="number"
                  value={formData.roof_other_turbines_count || ''}
                  onChange={(e) => updateField('roof_other_turbines_count', e.target.value ? parseInt(e.target.value) : undefined)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={submitting}
                />
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.roof_other_turbines_paint}
                  onChange={(e) => updateField('roof_other_turbines_paint', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  disabled={submitting}
                />
                <label className="ml-2 text-sm text-gray-700">Needs Paint</label>
              </div>
            </div>

            {/* Furnaces */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 p-3 rounded">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Furnaces (Count)</label>
                <input
                  type="number"
                  value={formData.roof_other_furnaces_count || ''}
                  onChange={(e) => updateField('roof_other_furnaces_count', e.target.value ? parseInt(e.target.value) : undefined)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={submitting}
                />
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.roof_other_furnaces_paint}
                  onChange={(e) => updateField('roof_other_furnaces_paint', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  disabled={submitting}
                />
                <label className="ml-2 text-sm text-gray-700">Needs Paint</label>
              </div>
            </div>

            {/* Power Vents */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 p-3 rounded">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Power Vents (Count)</label>
                <input
                  type="number"
                  value={formData.roof_other_power_vents_count || ''}
                  onChange={(e) => updateField('roof_other_power_vents_count', e.target.value ? parseInt(e.target.value) : undefined)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={submitting}
                />
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.roof_other_power_vents_paint}
                  onChange={(e) => updateField('roof_other_power_vents_paint', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  disabled={submitting}
                />
                <label className="ml-2 text-sm text-gray-700">Needs Paint</label>
              </div>
            </div>
          </div>

          {/* Other Items */}
          <div className="space-y-4">
            <h4 className="font-medium text-gray-900">Other Items</h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ridge (LF)</label>
                <input
                  type="number"
                  value={formData.roof_other_ridge_lf || ''}
                  onChange={(e) => updateField('roof_other_ridge_lf', e.target.value ? parseInt(e.target.value) : undefined)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={submitting}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Satellites (Count)</label>
                <input
                  type="number"
                  value={formData.roof_other_satellites_count || ''}
                  onChange={(e) => updateField('roof_other_satellites_count', e.target.value ? parseInt(e.target.value) : undefined)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={submitting}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Step Flashing (LF)</label>
                <input
                  type="number"
                  value={formData.roof_other_step_flashing_lf || ''}
                  onChange={(e) => updateField('roof_other_step_flashing_lf', e.target.value ? parseInt(e.target.value) : undefined)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={submitting}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rain Diverter (LF)</label>
                <input
                  type="number"
                  value={formData.roof_other_rain_diverter_lf || ''}
                  onChange={(e) => updateField('roof_other_rain_diverter_lf', e.target.value ? parseInt(e.target.value) : undefined)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={submitting}
                />
              </div>
            </div>

            <div className="flex items-center space-x-6">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.roof_other_chimney_flashing}
                  onChange={(e) => updateField('roof_other_chimney_flashing', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  disabled={submitting}
                />
                <label className="ml-2 text-sm text-gray-700">Chimney Flashing</label>
              </div>
            </div>

            {/* Skylights */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 p-3 rounded">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Skylights (Count)</label>
                <input
                  type="number"
                  value={formData.roof_other_skylights_count || ''}
                  onChange={(e) => updateField('roof_other_skylights_count', e.target.value ? parseInt(e.target.value) : undefined)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={submitting}
                />
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.roof_other_skylights_damaged}
                  onChange={(e) => updateField('roof_other_skylights_damaged', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  disabled={submitting}
                />
                <label className="ml-2 text-sm text-gray-700">Damaged</label>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Exterior Tab */}
      {activeTab === 'exterior' && (
        <div className="space-y-6">
          <h3 className="text-lg font-semibold text-gray-900">Exterior Damage Assessment</h3>

          {/* Dimensions Section */}
          <div className="bg-gray-50 p-4 rounded-md">
            <h4 className="font-medium text-gray-900 mb-3">Dimensions</h4>
            <div className="space-y-3">
              <div className="flex items-center space-x-6">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.porch_paint}
                    onChange={(e) => updateField('porch_paint', e.target.checked)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    disabled={submitting}
                  />
                  <label className="ml-2 text-sm text-gray-700">Porch Needs Paint</label>
                </div>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.patio_paint}
                    onChange={(e) => updateField('patio_paint', e.target.checked)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    disabled={submitting}
                  />
                  <label className="ml-2 text-sm text-gray-700">Patio Needs Paint</label>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fence</label>
                <input
                  type="text"
                  value={formData.fence || ''}
                  onChange={(e) => updateField('fence', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Describe fence damage if applicable"
                  disabled={submitting}
                />
              </div>
            </div>
          </div>

          {/* Front Side */}
          <div className="border border-gray-200 rounded-lg p-4">
            <h4 className="font-semibold text-gray-900 mb-4">Front</h4>

            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Siding 1 Replace (SF)</label>
                  <input
                    type="number"
                    value={formData.front_siding_1_replace_sf || ''}
                    onChange={(e) => updateField('front_siding_1_replace_sf', e.target.value ? parseInt(e.target.value) : undefined)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={submitting}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Siding 1 Paint (SF)</label>
                  <input
                    type="number"
                    value={formData.front_siding_1_paint_sf || ''}
                    onChange={(e) => updateField('front_siding_1_paint_sf', e.target.value ? parseInt(e.target.value) : undefined)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={submitting}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Siding 2 Replace (SF)</label>
                  <input
                    type="number"
                    value={formData.front_siding_2_replace_sf || ''}
                    onChange={(e) => updateField('front_siding_2_replace_sf', e.target.value ? parseInt(e.target.value) : undefined)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={submitting}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Siding 2 Paint (SF)</label>
                  <input
                    type="number"
                    value={formData.front_siding_2_paint_sf || ''}
                    onChange={(e) => updateField('front_siding_2_paint_sf', e.target.value ? parseInt(e.target.value) : undefined)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={submitting}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 p-3 rounded">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Gutters (LF)</label>
                  <input
                    type="number"
                    value={formData.front_gutters_lf || ''}
                    onChange={(e) => updateField('front_gutters_lf', e.target.value ? parseInt(e.target.value) : undefined)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={submitting}
                  />
                </div>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.front_gutters_paint}
                    onChange={(e) => updateField('front_gutters_paint', e.target.checked)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    disabled={submitting}
                  />
                  <label className="ml-2 text-sm text-gray-700">Needs Paint</label>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Windows</label>
                  <input
                    type="text"
                    value={formData.front_windows || ''}
                    onChange={(e) => updateField('front_windows', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., 2 damaged"
                    disabled={submitting}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Screens</label>
                  <input
                    type="text"
                    value={formData.front_screens || ''}
                    onChange={(e) => updateField('front_screens', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., 1 torn"
                    disabled={submitting}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Doors</label>
                  <input
                    type="text"
                    value={formData.front_doors || ''}
                    onChange={(e) => updateField('front_doors', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., front door dented"
                    disabled={submitting}
                  />
                </div>
              </div>

              <div className="flex items-center space-x-6">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.front_ac_replace}
                    onChange={(e) => updateField('front_ac_replace', e.target.checked)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    disabled={submitting}
                  />
                  <label className="ml-2 text-sm text-gray-700">AC Replace</label>
                </div>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.front_ac_comb_fins}
                    onChange={(e) => updateField('front_ac_comb_fins', e.target.checked)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    disabled={submitting}
                  />
                  <label className="ml-2 text-sm text-gray-700">AC Comb Fins</label>
                </div>
              </div>
            </div>
          </div>

          {/* Right Side */}
          <div className="border border-gray-200 rounded-lg p-4">
            <h4 className="font-semibold text-gray-900 mb-4">Right</h4>

            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Siding 1 Replace (SF)</label>
                  <input
                    type="number"
                    value={formData.right_siding_1_replace_sf || ''}
                    onChange={(e) => updateField('right_siding_1_replace_sf', e.target.value ? parseInt(e.target.value) : undefined)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={submitting}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Siding 1 Paint (SF)</label>
                  <input
                    type="number"
                    value={formData.right_siding_1_paint_sf || ''}
                    onChange={(e) => updateField('right_siding_1_paint_sf', e.target.value ? parseInt(e.target.value) : undefined)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={submitting}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Siding 2 Replace (SF)</label>
                  <input
                    type="number"
                    value={formData.right_siding_2_replace_sf || ''}
                    onChange={(e) => updateField('right_siding_2_replace_sf', e.target.value ? parseInt(e.target.value) : undefined)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={submitting}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Siding 2 Paint (SF)</label>
                  <input
                    type="number"
                    value={formData.right_siding_2_paint_sf || ''}
                    onChange={(e) => updateField('right_siding_2_paint_sf', e.target.value ? parseInt(e.target.value) : undefined)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={submitting}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 p-3 rounded">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Gutters (LF)</label>
                  <input
                    type="number"
                    value={formData.right_gutters_lf || ''}
                    onChange={(e) => updateField('right_gutters_lf', e.target.value ? parseInt(e.target.value) : undefined)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={submitting}
                  />
                </div>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.right_gutters_paint}
                    onChange={(e) => updateField('right_gutters_paint', e.target.checked)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    disabled={submitting}
                  />
                  <label className="ml-2 text-sm text-gray-700">Needs Paint</label>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Windows</label>
                  <input
                    type="text"
                    value={formData.right_windows || ''}
                    onChange={(e) => updateField('right_windows', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., 2 damaged"
                    disabled={submitting}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Screens</label>
                  <input
                    type="text"
                    value={formData.right_screens || ''}
                    onChange={(e) => updateField('right_screens', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., 1 torn"
                    disabled={submitting}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Doors</label>
                  <input
                    type="text"
                    value={formData.right_doors || ''}
                    onChange={(e) => updateField('right_doors', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., side door dented"
                    disabled={submitting}
                  />
                </div>
              </div>

              <div className="flex items-center space-x-6">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.right_ac_replace}
                    onChange={(e) => updateField('right_ac_replace', e.target.checked)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    disabled={submitting}
                  />
                  <label className="ml-2 text-sm text-gray-700">AC Replace</label>
                </div>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.right_ac_comb_fins}
                    onChange={(e) => updateField('right_ac_comb_fins', e.target.checked)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    disabled={submitting}
                  />
                  <label className="ml-2 text-sm text-gray-700">AC Comb Fins</label>
                </div>
              </div>
            </div>
          </div>

          {/* Back Side */}
          <div className="border border-gray-200 rounded-lg p-4">
            <h4 className="font-semibold text-gray-900 mb-4">Back</h4>

            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Siding 1 Replace (SF)</label>
                  <input
                    type="number"
                    value={formData.back_siding_1_replace_sf || ''}
                    onChange={(e) => updateField('back_siding_1_replace_sf', e.target.value ? parseInt(e.target.value) : undefined)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={submitting}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Siding 1 Paint (SF)</label>
                  <input
                    type="number"
                    value={formData.back_siding_1_paint_sf || ''}
                    onChange={(e) => updateField('back_siding_1_paint_sf', e.target.value ? parseInt(e.target.value) : undefined)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={submitting}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Siding 2 Replace (SF)</label>
                  <input
                    type="number"
                    value={formData.back_siding_2_replace_sf || ''}
                    onChange={(e) => updateField('back_siding_2_replace_sf', e.target.value ? parseInt(e.target.value) : undefined)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={submitting}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Siding 2 Paint (SF)</label>
                  <input
                    type="number"
                    value={formData.back_siding_2_paint_sf || ''}
                    onChange={(e) => updateField('back_siding_2_paint_sf', e.target.value ? parseInt(e.target.value) : undefined)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={submitting}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 p-3 rounded">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Gutters (LF)</label>
                  <input
                    type="number"
                    value={formData.back_gutters_lf || ''}
                    onChange={(e) => updateField('back_gutters_lf', e.target.value ? parseInt(e.target.value) : undefined)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={submitting}
                  />
                </div>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.back_gutters_paint}
                    onChange={(e) => updateField('back_gutters_paint', e.target.checked)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    disabled={submitting}
                  />
                  <label className="ml-2 text-sm text-gray-700">Needs Paint</label>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Windows</label>
                  <input
                    type="text"
                    value={formData.back_windows || ''}
                    onChange={(e) => updateField('back_windows', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., 2 damaged"
                    disabled={submitting}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Screens</label>
                  <input
                    type="text"
                    value={formData.back_screens || ''}
                    onChange={(e) => updateField('back_screens', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., 1 torn"
                    disabled={submitting}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Doors</label>
                  <input
                    type="text"
                    value={formData.back_doors || ''}
                    onChange={(e) => updateField('back_doors', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., back door dented"
                    disabled={submitting}
                  />
                </div>
              </div>

              <div className="flex items-center space-x-6">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.back_ac_replace}
                    onChange={(e) => updateField('back_ac_replace', e.target.checked)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    disabled={submitting}
                  />
                  <label className="ml-2 text-sm text-gray-700">AC Replace</label>
                </div>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.back_ac_comb_fins}
                    onChange={(e) => updateField('back_ac_comb_fins', e.target.checked)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    disabled={submitting}
                  />
                  <label className="ml-2 text-sm text-gray-700">AC Comb Fins</label>
                </div>
              </div>
            </div>
          </div>

          {/* Left Side */}
          <div className="border border-gray-200 rounded-lg p-4">
            <h4 className="font-semibold text-gray-900 mb-4">Left</h4>

            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Siding 1 Replace (SF)</label>
                  <input
                    type="number"
                    value={formData.left_siding_1_replace_sf || ''}
                    onChange={(e) => updateField('left_siding_1_replace_sf', e.target.value ? parseInt(e.target.value) : undefined)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={submitting}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Siding 1 Paint (SF)</label>
                  <input
                    type="number"
                    value={formData.left_siding_1_paint_sf || ''}
                    onChange={(e) => updateField('left_siding_1_paint_sf', e.target.value ? parseInt(e.target.value) : undefined)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={submitting}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Siding 2 Replace (SF)</label>
                  <input
                    type="number"
                    value={formData.left_siding_2_replace_sf || ''}
                    onChange={(e) => updateField('left_siding_2_replace_sf', e.target.value ? parseInt(e.target.value) : undefined)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={submitting}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Siding 2 Paint (SF)</label>
                  <input
                    type="number"
                    value={formData.left_siding_2_paint_sf || ''}
                    onChange={(e) => updateField('left_siding_2_paint_sf', e.target.value ? parseInt(e.target.value) : undefined)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={submitting}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 p-3 rounded">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Gutters (LF)</label>
                  <input
                    type="number"
                    value={formData.left_gutters_lf || ''}
                    onChange={(e) => updateField('left_gutters_lf', e.target.value ? parseInt(e.target.value) : undefined)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={submitting}
                  />
                </div>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.left_gutters_paint}
                    onChange={(e) => updateField('left_gutters_paint', e.target.checked)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    disabled={submitting}
                  />
                  <label className="ml-2 text-sm text-gray-700">Needs Paint</label>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Windows</label>
                  <input
                    type="text"
                    value={formData.left_windows || ''}
                    onChange={(e) => updateField('left_windows', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., 2 damaged"
                    disabled={submitting}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Screens</label>
                  <input
                    type="text"
                    value={formData.left_screens || ''}
                    onChange={(e) => updateField('left_screens', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., 1 torn"
                    disabled={submitting}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Doors</label>
                  <input
                    type="text"
                    value={formData.left_doors || ''}
                    onChange={(e) => updateField('left_doors', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., side door dented"
                    disabled={submitting}
                  />
                </div>
              </div>

              <div className="flex items-center space-x-6">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.left_ac_replace}
                    onChange={(e) => updateField('left_ac_replace', e.target.checked)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    disabled={submitting}
                  />
                  <label className="ml-2 text-sm text-gray-700">AC Replace</label>
                </div>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.left_ac_comb_fins}
                    onChange={(e) => updateField('left_ac_comb_fins', e.target.checked)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    disabled={submitting}
                  />
                  <label className="ml-2 text-sm text-gray-700">AC Comb Fins</label>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Additional Tab */}
      {activeTab === 'additional' && (
        <div className="space-y-6">
          <h3 className="text-lg font-semibold text-gray-900">Additional Items & Notes</h3>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Additional Items (Main Roof)</label>
            <textarea
              value={formData.additional_items_main || ''}
              onChange={(e) => updateField('additional_items_main', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              rows={4}
              placeholder="List any additional items for the main roof..."
              disabled={submitting}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Additional Items (Other Roof)</label>
            <textarea
              value={formData.additional_items_other || ''}
              onChange={(e) => updateField('additional_items_other', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              rows={4}
              placeholder="List any additional items for the other roof structure..."
              disabled={submitting}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">General Notes</label>
            <textarea
              value={formData.notes || ''}
              onChange={(e) => updateField('notes', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              rows={6}
              placeholder="Any additional notes or observations about the property damage..."
              disabled={submitting}
            />
          </div>
        </div>
      )}

      {/* Navigation Buttons */}
      <div className="flex justify-between pt-6 border-t border-gray-200">
        <button
          type="button"
          onClick={onBack}
          className="px-6 py-3 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          disabled={submitting}
        >
          Back to Photos
        </button>
        <button
          type="submit"
          className="px-6 py-3 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-300 disabled:cursor-not-allowed"
          disabled={submitting}
        >
          {submitting ? (
            <span className="flex items-center">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              Submitting...
            </span>
          ) : (
            'Submit Scope Sheet'
          )}
        </button>
      </div>
    </form>
  )
}
