import { useState, useCallback, useRef } from 'react'

/**
 * Custom hook to manage wizard navigation with proper state transitions
 * Prevents race conditions between automatic step advancement and user actions
 */
export function useWizardNavigation(
  currentStep: number,
  setCurrentStep: (step: number) => void,
  isLoading: boolean
) {
  const isNavigatingRef = useRef(false)
  const [isNavigating, setIsNavigating] = useState(false)
  const pendingStepRef = useRef<number | null>(null)

  /**
   * Navigate to a specific step with proper loading state management
   */
  const navigateToStep = useCallback((step: number) => {
    if (isNavigatingRef.current || isLoading) {
      // Queue the navigation request if already navigating
      pendingStepRef.current = step
      return
    }

    isNavigatingRef.current = true
    setIsNavigating(true)
    try {
      setCurrentStep(step)
    } finally {
      isNavigatingRef.current = false
      setIsNavigating(false)

      // Process any pending navigation
      if (pendingStepRef.current !== null) {
        const nextStep = pendingStepRef.current
        pendingStepRef.current = null
        navigateToStep(nextStep)
      }
    }
  }, [currentStep, setCurrentStep, isLoading])

  /**
   * Check if navigation is allowed (not currently navigating or loading)
   */
  const canNavigate = useCallback(() => {
    return !isNavigatingRef.current && !isLoading
  }, [isLoading])

  return {
    navigateToStep,
    canNavigate,
    isNavigating
  }
}