import { useState, useEffect, useCallback, useRef } from 'react'
import axios from 'axios'
import { useWizardNavigation } from './useWizardNavigation'
import type {
  WizardStep,
  QuickSetupData,
  GetSetupResponse,
  InspectionV2,
  ElevationData,
  ElevationSide,
  RoofData,
  RoofDamageSpot,
  CreateRoofSectionInput,
  InspectionRoom,
  InspectionRoomPhoto,
  CreateRoomInput,
  UpdateRoomInput,
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
  roofSections: RoofData[]
  roofLoading: boolean
  createRoofSection: (input: CreateRoofSectionInput) => Promise<RoofData | null>
  updateRoofSection: (roofId: string, data: Partial<RoofData>) => void
  deleteRoofSection: (roofId: string) => Promise<void>
  addRoofSectionDamageSpot: (roofId: string, photoDocumentId: string | null, caption: string | null) => Promise<RoofDamageSpot | null>
  deleteRoofSectionDamageSpot: (roofId: string, spotId: string) => Promise<void>
  computeNextStep: (from: WizardStep) => WizardStep
  computePrevStep: (from: WizardStep) => WizardStep
  rooms: InspectionRoom[]
  roomsLoading: boolean
  loadRooms: () => Promise<void>
  createRoom: (input: CreateRoomInput) => Promise<InspectionRoom | null>
  updateRoom: (roomId: string, input: UpdateRoomInput) => void
  deleteRoom: (roomId: string) => Promise<void>
  addRoomPhoto: (roomId: string, input: { photo_document_id?: string; caption?: string; sort_order?: number }) => Promise<InspectionRoomPhoto | null>
  deleteRoomPhoto: (roomId: string, photoId: string) => Promise<void>
  submittedAt: string | null
  submitInspection: () => Promise<boolean>
  // Navigation helpers
  navigateToStep: (step: WizardStep) => void
  canNavigate: () => boolean
  isNavigating: boolean
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
  const [roofSections, setRoofSections] = useState<RoofData[]>([])
  const [roofLoading, setRoofLoading] = useState(false)
  const roofDebounceTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const pendingRoofUpdates = useRef<Map<string, Partial<RoofData>>>(new Map())
  const [rooms, setRooms] = useState<InspectionRoom[]>([])
  const [roomsLoading, setRoomsLoading] = useState(false)
  const [submittedAt, setSubmittedAt] = useState<string | null>(null)
  const roomDebounceTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const pendingRoomUpdates = useRef<Map<string, UpdateRoomInput>>(new Map())

  // Use custom navigation hook to prevent race conditions
  const { navigateToStep, canNavigate, isNavigating } = useWizardNavigation(
    currentStep,
    (step: number) => {
      setCurrentStep(step as WizardStep)
    },
    loading || elevationLoading || roofLoading || roomsLoading
  )

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
          if (insp.submitted_at) setSubmittedAt(insp.submitted_at)
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

  const computeNextStep = useCallback((from: WizardStep): WizardStep => {
    const { include_exterior, include_roof, include_interior } = quickSetup.area_selection
    const steps: WizardStep[] = [1]
    if (include_exterior) steps.push(2)
    if (include_roof)     steps.push(3)
    if (include_interior) steps.push(4)
    steps.push(5)
    const idx = steps.indexOf(from)
    if (idx === -1 || idx >= steps.length - 1) return 5
    return steps[idx + 1]
  }, [quickSetup.area_selection])

  const computePrevStep = useCallback((from: WizardStep): WizardStep => {
    const { include_exterior, include_roof, include_interior } = quickSetup.area_selection
    const steps: WizardStep[] = [1]
    if (include_exterior) steps.push(2)
    if (include_roof)     steps.push(3)
    if (include_interior) steps.push(4)
    steps.push(5)
    const idx = steps.indexOf(from)
    if (idx <= 0) return 1
    return steps[idx - 1]
  }, [quickSetup.area_selection])

  const loadRoofSections = useCallback(async () => {
    setRoofLoading(true)
    try {
      const { data } = await axios.get<{ success: boolean; data: RoofData[] }>(
        `${API}/api/magic-links/${token}/v2/inspection/roof-sections`
      )
      setRoofSections(data.data ?? [])
    } catch {
      // non-fatal
    } finally {
      setRoofLoading(false)
    }
  }, [token])

  const createRoofSection = useCallback(async (input: CreateRoofSectionInput): Promise<RoofData | null> => {
    try {
      const { data } = await axios.post<{ success: boolean; data: RoofData }>(
        `${API}/api/magic-links/${token}/v2/inspection/roof-sections`,
        input
      )
      const section = data.data
      setRoofSections(prev => [...prev, section])
      return section
    } catch {
      return null
    }
  }, [token])

  const updateRoofSection = useCallback((roofId: string, updates: Partial<RoofData>) => {
    // Merge pending updates
    const current = pendingRoofUpdates.current.get(roofId) ?? {}
    pendingRoofUpdates.current.set(roofId, { ...current, ...updates })

    // Optimistic update
    setRoofSections(prev => prev.map(r => r.id === roofId ? { ...r, ...updates } : r))

    // Debounce per section
    const existing = roofDebounceTimers.current.get(roofId)
    if (existing) clearTimeout(existing)
    const timer = setTimeout(async () => {
      roofDebounceTimers.current.delete(roofId)
      const payload = pendingRoofUpdates.current.get(roofId)
      pendingRoofUpdates.current.delete(roofId)
      try {
        const { data } = await axios.patch<{ success: boolean; data: RoofData }>(
          `${API}/api/magic-links/${token}/v2/inspection/roof-sections/${roofId}`,
          payload
        )
        setRoofSections(prev => prev.map(r => r.id === roofId ? data.data : r))
      } catch {
        // non-fatal
      }
    }, 800)
    roofDebounceTimers.current.set(roofId, timer)
  }, [token])

  const deleteRoofSection = useCallback(async (roofId: string) => {
    const existing = roofDebounceTimers.current.get(roofId)
    if (existing) {
      clearTimeout(existing)
      roofDebounceTimers.current.delete(roofId)
    }
    pendingRoofUpdates.current.delete(roofId)
    setRoofSections(prev => prev.filter(r => r.id !== roofId))
    try {
      await axios.delete(`${API}/api/magic-links/${token}/v2/inspection/roof-sections/${roofId}`)
    } catch {
      // non-fatal
    }
  }, [token])

  const addRoofSectionDamageSpot = useCallback(async (
    roofId: string,
    photoDocumentId: string | null,
    caption: string | null,
  ): Promise<RoofDamageSpot | null> => {
    try {
      const { data } = await axios.post<{ success: boolean; data: RoofDamageSpot }>(
        `${API}/api/magic-links/${token}/v2/inspection/roof-sections/${roofId}/damage-spots`,
        { photo_document_id: photoDocumentId, caption, sort_order: 0 }
      )
      return data.data
    } catch {
      return null
    }
  }, [token])

  const deleteRoofSectionDamageSpot = useCallback(async (roofId: string, spotId: string) => {
    try {
      await axios.delete(
        `${API}/api/magic-links/${token}/v2/inspection/roof-sections/${roofId}/damage-spots/${spotId}`
      )
    } catch {
      // non-fatal
    }
  }, [token])

  const loadRooms = useCallback(async () => {
    setRoomsLoading(true)
    try {
      const { data } = await axios.get<{ success: boolean; data: InspectionRoom[] }>(
        `${API}/api/magic-links/${token}/v2/inspection/rooms`
      )
      setRooms(data.data ?? [])
    } catch {
      // non-fatal
    } finally {
      setRoomsLoading(false)
    }
  }, [token])

  const createRoom = useCallback(async (input: CreateRoomInput): Promise<InspectionRoom | null> => {
    try {
      const { data } = await axios.post<{ success: boolean; data: InspectionRoom }>(
        `${API}/api/magic-links/${token}/v2/inspection/rooms`,
        input
      )
      const newRoom = data.data
      setRooms(prev => [...prev, newRoom])
      return newRoom
    } catch {
      return null
    }
  }, [token])

  const updateRoom = useCallback((roomId: string, input: UpdateRoomInput) => {
    // Accumulate pending updates for this room
    const current = pendingRoomUpdates.current.get(roomId) ?? ({} as UpdateRoomInput)
    const merged = { ...current, ...input }
    pendingRoomUpdates.current.set(roomId, merged)

    // Optimistic update
    setRooms(prev => prev.map(r => r.id === roomId ? { ...r, ...input } : r))

    // Debounce per room
    const existing = roomDebounceTimers.current.get(roomId)
    if (existing) clearTimeout(existing)
    const timer = setTimeout(async () => {
      roomDebounceTimers.current.delete(roomId)
      const payload = pendingRoomUpdates.current.get(roomId)
      pendingRoomUpdates.current.delete(roomId)
      try {
        const { data } = await axios.put<{ success: boolean; data: InspectionRoom }>(
          `${API}/api/magic-links/${token}/v2/inspection/rooms/${roomId}`,
          payload
        )
        setRooms(prev => prev.map(r => r.id === roomId ? data.data : r))
      } catch {
        // non-fatal
      }
    }, 800)
    roomDebounceTimers.current.set(roomId, timer)
  }, [token])

  const deleteRoom = useCallback(async (roomId: string) => {
    // Cancel any pending debounced update for this room
    const existing = roomDebounceTimers.current.get(roomId)
    if (existing) {
      clearTimeout(existing)
      roomDebounceTimers.current.delete(roomId)
    }
    pendingRoomUpdates.current.delete(roomId)
    setRooms(prev => prev.filter(r => r.id !== roomId))
    try {
      await axios.delete(`${API}/api/magic-links/${token}/v2/inspection/rooms/${roomId}`)
    } catch {
      // non-fatal
    }
  }, [token])

  const addRoomPhoto = useCallback(async (
    roomId: string,
    input: { photo_document_id?: string; caption?: string; sort_order?: number }
  ): Promise<InspectionRoomPhoto | null> => {
    try {
      const { data } = await axios.post<{ success: boolean; data: InspectionRoomPhoto }>(
        `${API}/api/magic-links/${token}/v2/inspection/rooms/${roomId}/photos`,
        input
      )
      const photo = data.data
      setRooms(prev => prev.map(r =>
        r.id === roomId ? { ...r, photos: [...(r.photos ?? []), photo] } : r
      ))
      return photo
    } catch {
      return null
    }
  }, [token])

  const deleteRoomPhoto = useCallback(async (roomId: string, photoId: string) => {
    setRooms(prev => prev.map(r =>
      r.id === roomId ? { ...r, photos: (r.photos ?? []).filter(p => p.id !== photoId) } : r
    ))
    try {
      await axios.delete(
        `${API}/api/magic-links/${token}/v2/inspection/rooms/${roomId}/photos/${photoId}`
      )
    } catch {
      // non-fatal
    }
  }, [token])

  const submitInspection = useCallback(async (): Promise<boolean> => {
    try {
      const { data } = await axios.post<{ success: boolean; data: InspectionV2 }>(
        `${API}/api/magic-links/${token}/v2/inspection/submit`
      )
      if (data.data.submitted_at) setSubmittedAt(data.data.submitted_at)
      return true
    } catch {
      return false
    }
  }, [token])

  // Poll for step changes from backend (e.g., auto-advance when all photos uploaded)
  useEffect(() => {
    if (!inspectionId) return

    const checkStepChanges = async () => {
      try {
        const { data } = await axios.get<{ success: boolean; data: { current_step: number } }>(
          `${API}/api/magic-links/${token}/v2/inspection`
        )
        const backendStep = data.data.current_step
        if (backendStep !== currentStep && backendStep > currentStep) {
          console.log(`Backend advanced step from ${currentStep} to ${backendStep}`)
          // Allow navigation if not currently navigating
          if (canNavigate()) {
            navigateToStep(backendStep as WizardStep)
          }
        }
      } catch (error) {
        console.error('Failed to check for step changes:', error)
      }
    }

    // Check every 5 seconds
    const interval = setInterval(checkStepChanges, 5000)
    return () => clearInterval(interval)
  }, [token, inspectionId, currentStep, canNavigate, navigateToStep])

  useEffect(() => {
    if (currentStep === 2) loadElevations()
    if (currentStep === 3) loadRoofSections()
    if (currentStep === 4) loadRooms()
    if (currentStep === 5) {
      loadElevations()
      loadRoofSections()
      loadRooms()
    }
  }, [currentStep, loadElevations, loadRoofSections, loadRooms])

  const saveElevation = useCallback(async (side: ElevationSide, data: Partial<ElevationData>) => {
    // Debounce per-side: cancel any pending save for this side
    if (debounceTimers.current[side]) {
      clearTimeout(debounceTimers.current[side])
    }
    debounceTimers.current[side] = setTimeout(async () => {
      setElevationLoading(true)
      let retries = 0
      const maxRetries = 3

      while (retries < maxRetries) {
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
          // Success - exit the retry loop
          break
        } catch (error) {
          retries++
          console.error(`Failed to save elevation for side ${side} (attempt ${retries}/${maxRetries}):`, error)

          if (retries >= maxRetries) {
            // Max retries reached - show error to user
            setError(`Failed to save changes for ${side} side. Please try again.`)
            // Clear error after 5 seconds
            setTimeout(() => setError(null), 5000)
          } else {
            // Wait before retry (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, 1000 * retries))
          }
        }
      }
      setElevationLoading(false)
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
      const { include_exterior, include_roof, include_interior } = quickSetup.area_selection
      const steps: WizardStep[] = [1]
      if (include_exterior) steps.push(2 as WizardStep)
      if (include_roof)     steps.push(3 as WizardStep)
      if (include_interior) steps.push(4 as WizardStep)
      steps.push(5 as WizardStep)
      setCurrentStep(steps[1] ?? 5)
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
    roofSections,
    roofLoading,
    createRoofSection,
    updateRoofSection,
    deleteRoofSection,
    addRoofSectionDamageSpot,
    deleteRoofSectionDamageSpot,
    computeNextStep,
    computePrevStep,
    rooms,
    roomsLoading,
    loadRooms,
    createRoom,
    updateRoom,
    deleteRoom,
    addRoomPhoto,
    deleteRoomPhoto,
    submittedAt,
    submitInspection,
    // Navigation helpers
    navigateToStep,
    canNavigate,
    isNavigating,
  }
}
