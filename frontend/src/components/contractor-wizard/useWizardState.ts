import { useState, useCallback, useEffect } from 'react'
import axios from 'axios'
import { WizardState, DraftResponse, SaveDraftRequest, UploadedFile } from './types'
import { ScopeSheetData } from '../ScopeSheetForm'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080'

/**
 * Custom hook for managing wizard state with auto-save functionality
 *
 * @param token - The magic link token for authentication
 * @returns Wizard state and methods for state management
 */
export function useWizardState(token: string) {
  const [wizardState, setWizardState] = useState<WizardState>({
    currentStep: 1,
    totalSteps: 10,
    hasSecondaryRoof: null,
    wizardData: {} as ScopeSheetData,
    completedSteps: [],
    photos: [],
  })

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Loads draft data from the backend
   */
  const loadDraft = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await axios.get<DraftResponse>(
        `${API_URL}/api/magic-links/${token}/scope-sheet/draft`
      )

      if (response.data.success && response.data.data) {
        const draft = response.data.data

        // Extract wizard data (all fields except metadata)
        const { id, claim_id, draft_step, created_at, updated_at, submitted_at, ...scopeData } = draft

        // Determine if secondary roof exists based on data
        const hasSecondaryRoof = !!(
          scopeData.roof_other_type ||
          scopeData.roof_other_pitch ||
          scopeData.roof_other_fascia_lf
        )

        // Determine completed steps based on draft_step
        const completedSteps = Array.from({ length: draft_step - 1 }, (_, i) => i + 1)

        setWizardState({
          currentStep: draft_step,
          totalSteps: hasSecondaryRoof ? 10 : 9,
          hasSecondaryRoof,
          wizardData: scopeData as ScopeSheetData,
          completedSteps,
          photos: [],
          draftStep: draft_step,
        })
      }
    } catch (err: any) {
      // 404 means no draft exists yet - this is not an error
      if (err.response?.status === 404) {
        console.log('No draft found, starting fresh')
      } else {
        console.error('Error loading draft:', err)
        setError('Failed to load saved progress')
      }
    } finally {
      setLoading(false)
    }
  }, [token])

  /**
   * Saves the current state as a draft
   */
  const saveDraft = useCallback(async (currentStep: number) => {
    try {
      setSaving(true)
      setError(null)

      const requestData: SaveDraftRequest = {
        draft_step: currentStep,
        ...wizardState.wizardData,
      }

      const response = await axios.post<DraftResponse>(
        `${API_URL}/api/magic-links/${token}/scope-sheet/draft`,
        requestData
      )

      if (response.data.success) {
        console.log('Draft saved successfully')
      }
    } catch (err: any) {
      console.error('Error saving draft:', err)
      setError('Failed to save progress')
      throw err
    } finally {
      setSaving(false)
    }
  }, [token, wizardState.wizardData])

  /**
   * Updates wizard data (merges partial data)
   */
  const updateData = useCallback((data: Partial<ScopeSheetData>) => {
    setWizardState(prev => ({
      ...prev,
      wizardData: {
        ...prev.wizardData,
        ...data,
      },
    }))
  }, [])

  /**
   * Sets whether the property has a secondary roof
   * This adjusts the total number of steps
   */
  const setHasSecondaryRoof = useCallback((has: boolean) => {
    setWizardState(prev => ({
      ...prev,
      hasSecondaryRoof: has,
      totalSteps: has ? 10 : 9,
    }))
  }, [])

  /**
   * Moves to the next step
   * Optionally updates data before moving
   * Automatically saves draft
   */
  const goNext = useCallback(async (stepData?: Partial<ScopeSheetData>) => {
    // Update data if provided
    if (stepData) {
      updateData(stepData)
    }

    const currentStep = wizardState.currentStep
    const nextStep = currentStep + 1

    // Skip step 4 (secondary roof) if hasSecondaryRoof is false
    const actualNextStep =
      nextStep === 4 && wizardState.hasSecondaryRoof === false
        ? 5
        : nextStep

    // Mark current step as completed
    const newCompletedSteps = [...wizardState.completedSteps]
    if (!newCompletedSteps.includes(currentStep)) {
      newCompletedSteps.push(currentStep)
    }

    // Update state
    setWizardState(prev => ({
      ...prev,
      currentStep: actualNextStep,
      completedSteps: newCompletedSteps,
      wizardData: stepData ? { ...prev.wizardData, ...stepData } : prev.wizardData,
    }))

    // Save draft with updated data
    try {
      const requestData: SaveDraftRequest = {
        draft_step: actualNextStep,
        ...(stepData ? { ...wizardState.wizardData, ...stepData } : wizardState.wizardData),
      }

      await axios.post<DraftResponse>(
        `${API_URL}/api/magic-links/${token}/scope-sheet/draft`,
        requestData
      )
    } catch (err) {
      console.error('Error saving draft on next:', err)
      // Don't block navigation on save error
    }
  }, [token, wizardState, updateData])

  /**
   * Moves to the previous step
   */
  const goBack = useCallback(() => {
    const currentStep = wizardState.currentStep
    const prevStep = currentStep - 1

    // Skip step 4 (secondary roof) when going back if hasSecondaryRoof is false
    const actualPrevStep =
      prevStep === 4 && wizardState.hasSecondaryRoof === false
        ? 3
        : prevStep

    if (actualPrevStep >= 1) {
      setWizardState(prev => ({
        ...prev,
        currentStep: actualPrevStep,
      }))
    }
  }, [wizardState])

  /**
   * Updates the photos array
   */
  const updatePhotos = useCallback((photos: UploadedFile[]) => {
    setWizardState(prev => ({
      ...prev,
      photos,
    }))
  }, [])

  // Load draft on mount
  useEffect(() => {
    loadDraft()
  }, [loadDraft])

  return {
    wizardState,
    loading,
    saving,
    error,
    loadDraft,
    saveDraft,
    goNext,
    goBack,
    updateData,
    setHasSecondaryRoof,
    updatePhotos,
  }
}
