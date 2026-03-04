import { useState, useEffect, useCallback, useRef } from 'react'
import axios from 'axios'
import type {
  WizardStep,
  QuickSetupData,
  GetSetupResponse,
  InspectionV2,
  ElevationData,
  ElevationSide,
  RoofData,
  RoofDamageSpot,
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
  roof: RoofData | null
  roofDamageSpots: RoofDamageSpot[]
  roofLoading: boolean
  saveRoof: (data: Partial<RoofData>) => Promise<void>
  addDamageSpot: (photoDocumentId: string | null, caption: string | null) => Promise<RoofDamageSpot | null>
  deleteDamageSpot: (spotId: string) => Promise<void>
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
  const [roof, setRoof] = useState<RoofData | null>(null)
  const [roofDamageSpots, setRoofDamageSpots] = useState<RoofDamageSpot[]>([])
  const [roofLoading, setRoofLoading] = useState(false)
  const roofDebounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [rooms, setRooms] = useState<InspectionRoom[]>([])
  const [roomsLoading, setRoomsLoading] = useState(false)
  const roomDebounceTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

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

  const loadRoof = useCallback(async () => {
    try {
      const { data } = await axios.get<{ success: boolean; data: { roof: RoofData | null; damage_spots: RoofDamageSpot[] } }>(
        `${API}/api/magic-links/${token}/v2/inspection/roof`
      )
      setRoof(data.data.roof)
      setRoofDamageSpots(data.data.damage_spots)
    } catch {
      // non-fatal: roof stays at current state
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
    // Optimistic update
    setRooms(prev => prev.map(r => r.id === roomId ? { ...r, ...input } : r))
    // Debounce per room
    const existing = roomDebounceTimers.current.get(roomId)
    if (existing) clearTimeout(existing)
    const timer = setTimeout(async () => {
      roomDebounceTimers.current.delete(roomId)
      try {
        const { data } = await axios.put<{ success: boolean; data: InspectionRoom }>(
          `${API}/api/magic-links/${token}/v2/inspection/rooms/${roomId}`,
          input
        )
        setRooms(prev => prev.map(r => r.id === roomId ? data.data : r))
      } catch {
        // non-fatal
      }
    }, 800)
    roomDebounceTimers.current.set(roomId, timer)
  }, [token])

  const deleteRoom = useCallback(async (roomId: string) => {
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
        r.id === roomId ? { ...r, photos: [...r.photos, photo] } : r
      ))
      return photo
    } catch {
      return null
    }
  }, [token])

  const deleteRoomPhoto = useCallback(async (roomId: string, photoId: string) => {
    setRooms(prev => prev.map(r =>
      r.id === roomId ? { ...r, photos: r.photos.filter(p => p.id !== photoId) } : r
    ))
    try {
      await axios.delete(
        `${API}/api/magic-links/${token}/v2/inspection/rooms/${roomId}/photos/${photoId}`
      )
    } catch {
      // non-fatal
    }
  }, [token])

  const saveRoof = useCallback(async (data: Partial<RoofData>) => {
    // 800ms debounce — cancel any pending save
    if (roofDebounceTimer.current) clearTimeout(roofDebounceTimer.current)
    roofDebounceTimer.current = setTimeout(async () => {
      setRoofLoading(true)
      try {
        const merged: RoofData = {
          overview_photo_id: null, overview_photo_url: null,
          slope_photo_id: null, slope_photo_url: null,
          shingles_photo_id: null, shingles_photo_url: null,
          ridge_photo_id: null, ridge_photo_url: null,
          pitch: null, shingle_type: null, layers: null, squares: null,
          has_ridge_damage: false, has_valley_damage: false, has_flashing_damage: false,
          decking_condition: null, notes: null,
          ...roof,
          ...data,
        }
        const { data: res } = await axios.put<{ success: boolean; data: RoofData }>(
          `${API}/api/magic-links/${token}/v2/inspection/roof`,
          merged
        )
        setRoof(res.data)
      } catch {
        // non-fatal
      } finally {
        setRoofLoading(false)
      }
    }, 800)
  }, [token, roof])

  const addDamageSpot = useCallback(async (
    photoDocumentId: string | null,
    caption: string | null,
  ): Promise<RoofDamageSpot | null> => {
    try {
      const { data } = await axios.post<{ success: boolean; data: RoofDamageSpot }>(
        `${API}/api/magic-links/${token}/v2/inspection/roof/damage-spots`,
        { photo_document_id: photoDocumentId, caption, sort_order: roofDamageSpots.length }
      )
      setRoofDamageSpots(prev => [...prev, data.data])
      return data.data
    } catch {
      return null
    }
  }, [token, roofDamageSpots.length])

  const deleteDamageSpot = useCallback(async (spotId: string) => {
    try {
      await axios.delete(`${API}/api/magic-links/${token}/v2/inspection/roof/damage-spots/${spotId}`)
      setRoofDamageSpots(prev => prev.filter(s => s.id !== spotId))
    } catch {
      // non-fatal
    }
  }, [token])

  useEffect(() => {
    if (currentStep === 2) loadElevations()
    if (currentStep === 3) loadRoof()
    if (currentStep === 4) loadRooms()
  }, [currentStep, loadElevations, loadRoof, loadRooms])

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
    roof,
    roofDamageSpots,
    roofLoading,
    saveRoof,
    addDamageSpot,
    deleteDamageSpot,
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
  }
}
