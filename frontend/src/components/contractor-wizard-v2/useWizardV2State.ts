import { useState, useEffect, useCallback, useRef } from 'react'
import axios from 'axios'
import type {
  WizardStep,
  QuickSetupData,
  GetSetupResponse,
  InspectionV2,
  ElevationData,
  ElevationSide,
} from './types'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8080'

export interface WizardV2State {
  token: string
  currentStep: WizardStep
  inspectionId: string | null
  propertyAddress: string
  contractorName: string
  loading: boolean
  error: string | null
  quickSetup: QuickSetupData
  setCurrentStep: (step: WizardStep) => void
  setQuickSetup: (data: QuickSetupData) => void
  submitQuickSetup: () => Promise<void>
  elevations: ElevationData[]
  elevationLoading: boolean
  saveElevation: (side: ElevationSide, data: Partial<ElevationData>) => Promise<void>
}

const defaultAreaSelection = {
  include_roof: false,
  include_exterior: false,
  include_interior: false,
  include_porch: false,
}

export function useWizardV2State(token: string): WizardV2State {
  const [currentStep, setCurrentStep] = useState<WizardStep>(1)
  const [inspectionId, setInspectionId] = useState<string | null>(null)
  const [propertyAddress, setPropertyAddress] = useState('')
  const [contractorName, setContractorName] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [quickSetup, setQuickSetup] = useState<QuickSetupData>({
    property_type: null,
    stories: null,
    area_selection: { ...defaultAreaSelection },
  })
  const [elevations, setElevations] = useState<ElevationData[]>([])
  const [elevationLoading, setElevationLoading] = useState(false)
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await axios.get<{ success: boolean; data: GetSetupResponse }>(
          `${API}/api/magic-links/${token}/v2/inspection`
        )
        const resp = data.data
        setPropertyAddress(resp.property_address)
        setContractorName(resp.contractor_name)
        if (resp.inspection) {
          const insp: InspectionV2 = resp.inspection
          setInspectionId(insp.id)
          setCurrentStep(insp.current_step as WizardStep)
          setQuickSetup({
            property_type: insp.property_type,
            stories: insp.stories,
            area_selection: insp.area_selection ?? { ...defaultAreaSelection },
          })
        }
      } catch (e: unknown) {
        const err = e as { response?: { data?: { error?: string } } }
        setError(err?.response?.data?.error ?? 'Failed to load inspection')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [token])

  const loadElevations = useCallback(async () => {
    try {
      const { data } = await axios.get<{ success: boolean; data: ElevationData[] }>(
        `${API}/api/magic-links/${token}/v2/inspection/elevations`
      )
      setElevations(data.data)
    } catch {
      // non-fatal: elevations just stay at current state
    }
  }, [token])

  useEffect(() => {
    if (currentStep === 2) {
      loadElevations()
    }
  }, [currentStep, loadElevations])

  const saveElevation = useCallback(async (side: ElevationSide, data: Partial<ElevationData>) => {
    // Debounce per-side: cancel any pending save for this side
    if (debounceTimers.current[side]) {
      clearTimeout(debounceTimers.current[side])
    }
    debounceTimers.current[side] = setTimeout(async () => {
      setElevationLoading(true)
      try {
        const { data: res } = await axios.put<{ success: boolean; data: ElevationData }>(
          `${API}/api/magic-links/${token}/v2/inspection/elevations/${side}`,
          data
        )
        setElevations(prev => {
          const idx = prev.findIndex(e => e.side === side)
          if (idx >= 0) {
            const updated = [...prev]
            updated[idx] = res.data
            return updated
          }
          return [...prev, res.data]
        })
      } catch {
        // non-fatal: field state stays, retry possible
      } finally {
        setElevationLoading(false)
      }
    }, 800)
  }, [token])

  const submitQuickSetup = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await axios.post<{ success: boolean; data: InspectionV2 }>(
        `${API}/api/magic-links/${token}/v2/inspection`,
        {
          property_type: quickSetup.property_type,
          stories: quickSetup.stories,
          area_selection: quickSetup.area_selection,
        }
      )
      setInspectionId(data.data.id)
      setCurrentStep(2)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      setError(err?.response?.data?.error ?? 'Failed to save setup')
    } finally {
      setLoading(false)
    }
  }

  return {
    token,
    currentStep,
    inspectionId,
    propertyAddress,
    contractorName,
    loading,
    error,
    quickSetup,
    setCurrentStep,
    setQuickSetup,
    submitQuickSetup,
    elevations,
    elevationLoading,
    saveElevation,
  }
}
