import { useState, useCallback, useEffect } from 'react'
import axios from 'axios'
import { WizardState, ScopeArea, DraftResponse } from './types'
import { CATEGORY_MAP } from './taxonomy'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080'

// Encode phase + tour step into a single integer for the backend draft_step field
function encodePhase(phase: WizardState['phase'], currentTourStep: number): number {
  if (phase === 'welcome') return 1
  if (phase === 'triage') return 2
  if (phase === 'tour') return 10 + currentTourStep
  return 99 // review
}

// Decode draft_step integer back to phase + currentTourStep
function decodePhase(draftStep: number | null): Pick<WizardState, 'phase' | 'currentTourStep'> {
  if (!draftStep || draftStep <= 1) return { phase: 'welcome', currentTourStep: 0 }
  if (draftStep === 2) return { phase: 'triage', currentTourStep: 0 }
  if (draftStep >= 10 && draftStep < 99) return { phase: 'tour', currentTourStep: draftStep - 10 }
  return { phase: 'review', currentTourStep: 0 }
}

const INITIAL_STATE: WizardState = {
  phase: 'welcome',
  triageSelections: [],
  areas: [],
  currentTourStep: 0,
  generalNotes: '',
}

export function useWizardState(token: string) {
  const [wizardState, setWizardState] = useState<WizardState>(INITIAL_STATE)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const saveDraft = useCallback(async (state: WizardState) => {
    try {
      setSaving(true)
      await axios.post(`${API_URL}/api/magic-links/${token}/scope-sheet/draft`, {
        areas: state.areas,
        triage_selections: state.triageSelections,
        general_notes: state.generalNotes || null,
        draft_step: encodePhase(state.phase, state.currentTourStep),
      })
    } catch (err) {
      console.error('Draft save failed:', err)
    } finally {
      setSaving(false)
    }
  }, [token])

  const loadDraft = useCallback(async () => {
    try {
      setLoading(true)
      const res = await axios.get<DraftResponse>(
        `${API_URL}/api/magic-links/${token}/scope-sheet/draft`
      ).catch(err => {
        if (err?.response?.status === 404) return { data: { success: false, data: null } }
        throw err
      })

      if (res.data.success && res.data.data) {
        const d = res.data.data
        const decoded = decodePhase(d.draft_step)
        setWizardState({
          phase: decoded.phase,
          triageSelections: d.triage_selections || [],
          areas: d.areas || [],
          currentTourStep: decoded.currentTourStep,
          generalNotes: d.general_notes || '',
        })
      }
    } catch (err) {
      console.error('Failed to load draft:', err)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    loadDraft()
  }, [loadDraft])

  // Welcome → Triage
  const goToTriage = useCallback(() => {
    const newState: WizardState = { ...wizardState, phase: 'triage' }
    setWizardState(newState)
    saveDraft(newState)
  }, [wizardState, saveDraft])

  // Triage → Tour (builds areas array from selections)
  const startTour = useCallback((selections: string[]) => {
    const areas: ScopeArea[] = selections.map((key, idx) => {
      const cat = CATEGORY_MAP[key]
      return {
        id: crypto.randomUUID(),
        category: cat?.label ?? key,
        category_key: key,
        order: idx + 1,
        tags: [],
        dimensions: {},
        photo_ids: [],
        notes: '',
      }
    })
    const newState: WizardState = {
      phase: 'tour',
      triageSelections: selections,
      areas,
      currentTourStep: 0,
      generalNotes: '',
    }
    setWizardState(newState)
    saveDraft(newState)
  }, [saveDraft])

  // Advances to next tour step (or review if last step)
  const completeTourStep = useCallback((updatedArea: ScopeArea) => {
    const newAreas = wizardState.areas.map(a => a.id === updatedArea.id ? updatedArea : a)
    const nextStep = wizardState.currentTourStep + 1
    const isLast = nextStep >= wizardState.areas.length
    const newState: WizardState = {
      ...wizardState,
      areas: newAreas,
      phase: isLast ? 'review' : 'tour',
      currentTourStep: isLast ? 0 : nextStep,
    }
    setWizardState(newState)
    saveDraft(newState)
  }, [wizardState, saveDraft])

  // Back from tour — returns to triage if on first step
  const goBackInTour = useCallback(() => {
    if (wizardState.currentTourStep === 0) {
      setWizardState(prev => ({ ...prev, phase: 'triage' }))
    } else {
      setWizardState(prev => ({ ...prev, currentTourStep: prev.currentTourStep - 1 }))
    }
  }, [wizardState.currentTourStep])

  // Back from review → last tour step
  const goBackToTour = useCallback(() => {
    setWizardState(prev => ({
      ...prev,
      phase: 'tour',
      currentTourStep: Math.max(0, prev.areas.length - 1),
    }))
  }, [])

  const updateGeneralNotes = useCallback((notes: string) => {
    setWizardState(prev => ({ ...prev, generalNotes: notes }))
  }, [])

  // Final submit
  const submit = useCallback(async (finalNotes: string) => {
    setSaving(true)
    try {
      await axios.post(
        `${API_URL}/api/magic-links/${token}/scope-sheet`,
        {
          areas: wizardState.areas,
          triage_selections: wizardState.triageSelections,
          general_notes: finalNotes || null,
        }
      )
    } finally {
      setSaving(false)
    }
  }, [token, wizardState.areas, wizardState.triageSelections])

  return {
    wizardState,
    loading,
    saving,
    goToTriage,
    startTour,
    completeTourStep,
    goBackInTour,
    goBackToTour,
    updateGeneralNotes,
    submit,
  }
}
