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

      // Load both draft and documents in parallel
      const [draftResponse, documentsResponse] = await Promise.all([
        axios.get<DraftResponse>(
          `${API_URL}/api/magic-links/${token}/scope-sheet/draft`
        ).catch(err => {
          // 404 for draft is OK (no draft exists yet)
          if (err?.response?.status === 404) {
            return { data: { success: false, data: null } }
          }
          throw err
        }),
        axios.get<{ success: boolean; data: Array<{ id: string; file_name: string; file_url: string; document_type: string }> }>(
          `${API_URL}/api/magic-links/${token}/documents`
        ).catch(err => {
          // If documents fetch fails, just log and continue with empty photos
          console.error('Error loading documents:', err)
          return { data: { success: false, data: [] } }
        }),
      ])

      let currentStep = 1
      let hasSecondaryRoof: boolean | null = null
      let scopeData = {} as ScopeSheetData
      let completedSteps: number[] = []
      let draft_step: number | undefined

      // Process draft if it exists
      if (draftResponse.data.success && draftResponse.data.data) {
        const draft = draftResponse.data.data

        // Extract wizard data (all fields except metadata)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id: _id, claim_id: _claim_id, draft_step: dStep, created_at, updated_at, submitted_at, ...draftScopeData } = draft

        // Determine if secondary roof exists based on data
        hasSecondaryRoof = !!(
          draftScopeData.roof_other_type ||
          draftScopeData.roof_other_pitch ||
          draftScopeData.roof_other_fascia_lf
        )

        // Use draft_step if available, otherwise default to step 1
        currentStep = dStep || 1
        draft_step = dStep

        // Determine completed steps based on draft_step
        completedSteps = currentStep > 1 ? Array.from({ length: currentStep - 1 }, (_, i) => i + 1) : []

        scopeData = draftScopeData as unknown as ScopeSheetData
      }

      // Process documents - convert to UploadedFile format for contractor photos only
      const photos: UploadedFile[] = documentsResponse.data.success && documentsResponse.data.data
        ? documentsResponse.data.data
            .filter(doc => doc.document_type === 'contractor_photo')
            .map(doc => ({
              // Create a placeholder File object (we don't need the actual file data for display)
              file: new File([], doc.file_name, { type: 'image/*' }),
              uploading: false,
              uploaded: true,
              documentId: doc.id,
              previewUrl: doc.file_url, // Use the backend file URL for preview
            }))
        : []

      setWizardState({
        currentStep,
        totalSteps: hasSecondaryRoof ? 10 : 9,
        hasSecondaryRoof,
        wizardData: scopeData,
        completedSteps,
        photos,
        draftStep: draft_step,
      })
    } catch (err: unknown) {
      console.error('Error loading draft:', err)
      setError('Failed to load saved progress')
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
    } catch (err: unknown) {
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
