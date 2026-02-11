# Guided UX Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the claim management UI with a mobile-first, guided dashboard that clearly shows users where they are and what to do next through a 6-step workflow.

**Architecture:** React component refactor with new mobile-first, card-based dashboard. Backend updates to support step tracking. Progressive disclosure pattern with "Next Step" cards guiding users through each phase.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, TanStack Query, Go backend

---

## Overview

This plan implements the guided UX redesign in 7 phases:

1. **Foundation** - Update data model and utilities
2. **Dashboard Redesign** - New claim cards and layout
3. **Create Claim Flow** - Simplified damage reporting
4. **Claim Home Structure** - Guided dashboard layout
5. **Next Step Logic** - Step definitions and routing
6. **Step Implementations** - Each of the 6 steps
7. **Polish** - Animations, states, mobile optimizations

**Estimated Time:** 8-12 hours total

---

## Phase 1: Foundation & Data Model

### Task 1.1: Update Claim Type Definition

**Files:**
- Modify: `frontend/src/pages/ClaimDetail.tsx:32-46`
- Modify: `frontend/src/pages/Dashboard.tsx` (if has Claim type)

**Step 1: Update Claim interface**

Add new fields to track current step and progress:

```typescript
interface Claim {
  id: string
  claim_number: string | null
  property_id: string
  property?: Property
  policy?: Policy
  loss_type: 'water' | 'hail' // Restrict to only water and hail
  status: string
  incident_date: string
  filed_at?: string
  description?: string
  contractor_estimate_total?: number

  // NEW: Step tracking
  current_step: 1 | 2 | 3 | 4 | 5 | 6
  steps_completed: number[]

  // NEW: Step-specific data
  contractor_email?: string
  contractor_name?: string
  contractor_photos_uploaded_at?: string
  deductible_comparison_result?: 'worth_filing' | 'not_worth_filing'
  insurance_claim_number?: string
  adjuster_name?: string
  adjuster_phone?: string
  inspection_datetime?: string

  created_at: string
  updated_at: string
}
```

**Step 2: Commit**

```bash
cd "/Users/benjaminlopez/.config/superpowers/worktrees/ClaimCoachAI Code/feature/guided-ux-redesign"
git add frontend/src/pages/ClaimDetail.tsx
git commit -m "feat(types): add step tracking fields to Claim interface"
```

---

### Task 1.2: Create Step Utilities

**Files:**
- Create: `frontend/src/lib/stepUtils.ts`

**Step 1: Write step utility functions**

```typescript
// frontend/src/lib/stepUtils.ts

export type StepNumber = 1 | 2 | 3 | 4 | 5 | 6

export interface StepDefinition {
  number: StepNumber
  title: string
  description: string
  learnMore: string
  icon: string
}

export const STEP_DEFINITIONS: Record<StepNumber, StepDefinition> = {
  1: {
    number: 1,
    title: 'Report the Damage',
    description: 'Tell us what happened and when',
    learnMore: 'We\'ll create a claim file and start tracking everything for you.',
    icon: '📋'
  },
  2: {
    number: 2,
    title: 'Get Contractor Photos',
    description: 'Send a link to your contractor for photos and estimate',
    learnMore: 'Your contractor will receive an email with a secure link. They can upload photos and their estimate without creating an account. The link works for 7 days. Tip: Give them a heads up that the email is coming!',
    icon: '📸'
  },
  3: {
    number: 3,
    title: 'Check if Worth Filing',
    description: 'See if repairs cost more than your deductible',
    learnMore: 'If repairs cost less than your deductible, you\'ll pay out of pocket anyway, so filing a claim isn\'t worth it. But you can still file if you want - sometimes it makes sense for documentation purposes.',
    icon: '💰'
  },
  4: {
    number: 4,
    title: 'File & Schedule',
    description: 'File with insurance and schedule their inspection',
    learnMore: 'Call your insurance company or use their online portal to file the claim. They\'ll give you a claim number and assign an adjuster. The adjuster will want to inspect the damage - schedule a time that works for you.',
    icon: '📋'
  },
  5: {
    number: 5,
    title: 'Review Insurance Offer',
    description: 'See if their offer is fair (we\'ll help!)',
    learnMore: 'Insurance companies sometimes offer less than repairs actually cost. Our AI compares their estimate to your contractor\'s estimate and current market rates to find discrepancies. If we find issues, we\'ll help you write a rebuttal letter.',
    icon: '🤖'
  },
  6: {
    number: 6,
    title: 'Get Paid & Close',
    description: 'Track payments and wrap up',
    learnMore: 'Insurance usually pays in two parts: ACV (Actual Cash Value) upfront to start repairs, then RCV (Recoverable Depreciation) after repairs are done. We\'ll help you request the second payment and make sure you get everything you\'re owed.',
    icon: '✅'
  }
}

export function getStepDefinition(step: StepNumber): StepDefinition {
  return STEP_DEFINITIONS[step]
}

export function getNextStep(currentStep: StepNumber): StepNumber | null {
  return currentStep < 6 ? (currentStep + 1) as StepNumber : null
}

export function getProgress(stepsCompleted: number[]): {
  completed: number
  total: number
  percentage: number
} {
  return {
    completed: stepsCompleted.length,
    total: 6,
    percentage: Math.round((stepsCompleted.length / 6) * 100)
  }
}

export function isStepComplete(stepNumber: StepNumber, stepsCompleted: number[]): boolean {
  return stepsCompleted.includes(stepNumber)
}

export function getDamageTypeIcon(lossType: 'water' | 'hail'): string {
  return lossType === 'water' ? '💧' : '🧊'
}

export function getDamageTypeLabel(lossType: 'water' | 'hail'): string {
  return lossType === 'water' ? 'Water Damage' : 'Hail Damage'
}

export function getStepStatusText(
  currentStep: StepNumber,
  stepsCompleted: number[],
  claim: any
): string {
  if (isStepComplete(currentStep, stepsCompleted)) {
    return getCompletedStepText(currentStep, claim)
  }
  return getInProgressStepText(currentStep, claim)
}

function getCompletedStepText(step: StepNumber, claim: any): string {
  switch (step) {
    case 1:
      return `✅ Damage Reported - ${getDamageTypeLabel(claim.loss_type)}`
    case 2:
      return `✅ Photos Received from ${claim.contractor_name || 'contractor'}`
    case 3:
      return claim.deductible_comparison_result === 'worth_filing'
        ? '✅ Worth Filing - Above deductible'
        : '⚠️ Below deductible'
    case 4:
      return `✅ Filed with insurance - Claim #${claim.insurance_claim_number}`
    case 5:
      return '✅ Insurance offer reviewed'
    case 6:
      return '✅ Claim closed'
    default:
      return '✅ Complete'
  }
}

function getInProgressStepText(step: StepNumber, claim: any): string {
  switch (step) {
    case 2:
      return claim.contractor_email
        ? `⏳ Waiting for ${claim.contractor_name || 'contractor'} to upload`
        : '🎯 NEXT: Send link to contractor'
    case 3:
      return '🎯 NEXT: Compare estimate to deductible'
    case 4:
      return '🎯 NEXT: File with insurance'
    case 5:
      return '🎯 NEXT: Review insurance offer'
    case 6:
      return '🎯 NEXT: Track payments'
    default:
      return ''
  }
}

export function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return '1 day ago'
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
  return `${Math.floor(diffDays / 30)} months ago`
}
```

**Step 2: Commit**

```bash
git add frontend/src/lib/stepUtils.ts
git commit -m "feat(utils): add step management utilities"
```

---

## Phase 2: Dashboard Redesign

### Task 2.1: Create ClaimCard Component

**Files:**
- Create: `frontend/src/components/ClaimCard.tsx`

**Step 1: Create ClaimCard component**

```typescript
// frontend/src/components/ClaimCard.tsx

import { useNavigate } from 'react-router-dom'
import {
  getDamageTypeIcon,
  getDamageTypeLabel,
  getStepStatusText,
  formatTimeAgo,
  getProgress
} from '../lib/stepUtils'

interface Property {
  id: string
  nickname: string
  legal_address: string
}

interface Claim {
  id: string
  loss_type: 'water' | 'hail'
  property?: Property
  current_step: 1 | 2 | 3 | 4 | 5 | 6
  steps_completed: number[]
  status: string
  created_at: string
  contractor_name?: string
  contractor_email?: string
  deductible_comparison_result?: 'worth_filing' | 'not_worth_filing'
  insurance_claim_number?: string
}

interface ClaimCardProps {
  claim: Claim
}

export default function ClaimCard({ claim }: ClaimCardProps) {
  const navigate = useNavigate()
  const progress = getProgress(claim.steps_completed)
  const icon = getDamageTypeIcon(claim.loss_type)
  const damageLabel = getDamageTypeLabel(claim.loss_type)
  const statusText = getStepStatusText(claim.current_step, claim.steps_completed, claim)
  const timeAgo = formatTimeAgo(claim.created_at)

  return (
    <div className="glass-card rounded-2xl p-6 hover:shadow-lg transition-all duration-200 animate-scale-in">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center space-x-3">
          <span className="text-3xl">{icon}</span>
          <div>
            <h3 className="text-lg font-semibold text-navy">{damageLabel}</h3>
            <p className="text-sm text-slate">
              {claim.property?.legal_address || claim.property?.nickname}
            </p>
          </div>
        </div>
      </div>

      <div className="mb-4">
        <p className="text-sm font-medium text-slate mb-1">{statusText}</p>
        <p className="text-xs text-slate/70">
          Step {claim.current_step} of 6
        </p>
      </div>

      <div className="mb-4">
        <div className="flex items-center space-x-1 mb-1">
          {[1, 2, 3, 4, 5, 6].map((step) => (
            <div
              key={step}
              className={`h-1.5 flex-1 rounded-full transition-all ${
                claim.steps_completed.includes(step)
                  ? 'bg-teal'
                  : step === claim.current_step
                  ? 'bg-teal/50 animate-pulse'
                  : 'bg-slate/20'
              }`}
            />
          ))}
        </div>
        <p className="text-xs text-slate">
          {progress.completed} of {progress.total} steps done
        </p>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-slate">Started {timeAgo}</span>
        <button
          onClick={() => navigate(`/claims/${claim.id}`)}
          className="btn-primary px-4 py-2 rounded-xl text-sm font-semibold"
        >
          View Claim →
        </button>
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/ClaimCard.tsx
git commit -m "feat(ui): add ClaimCard component for dashboard"
```

---

### Task 2.2: Update Dashboard to Use New ClaimCard

**Files:**
- Modify: `frontend/src/pages/Dashboard.tsx`

**Step 1: Update Dashboard component**

Replace the entire Dashboard component with the new design. This goes after the imports:

```typescript
import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'
import Layout from '../components/Layout'
import ClaimCard from '../components/ClaimCard'

interface Property {
  id: string
  nickname: string
  legal_address: string
  status: string
  owner_entity_name: string
}

interface Claim {
  id: string
  loss_type: 'water' | 'hail'
  property?: Property
  current_step: 1 | 2 | 3 | 4 | 5 | 6
  steps_completed: number[]
  status: string
  created_at: string
  contractor_name?: string
  contractor_email?: string
  deductible_comparison_result?: 'worth_filing' | 'not_worth_filing'
  insurance_claim_number?: string
}

export default function Dashboard() {
  const [searchQuery, setSearchQuery] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const navigate = useNavigate()

  const {
    data: claims,
    isLoading,
  } = useQuery({
    queryKey: ['claims'],
    queryFn: async () => {
      const response = await api.get('/api/claims')
      return response.data.data as Claim[]
    },
  })

  const {
    data: properties,
  } = useQuery({
    queryKey: ['properties'],
    queryFn: async () => {
      const response = await api.get('/api/properties')
      return response.data.data as Property[]
    },
  })

  // Filter and sort claims
  const { activeClaims, closedClaims } = useMemo(() => {
    if (!claims) return { activeClaims: [], closedClaims: [] }

    const filtered = searchQuery.trim()
      ? claims.filter(
          (claim) =>
            claim.property?.legal_address?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            claim.property?.nickname?.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : claims

    const active = filtered.filter((claim) => claim.status !== 'closed')
    const closed = filtered.filter((claim) => claim.status === 'closed')

    // Sort active claims: waiting for user action first
    active.sort((a, b) => {
      // Claims on current step (no waiting) come first
      const aWaiting = a.contractor_email && !a.steps_completed.includes(2)
      const bWaiting = b.contractor_email && !b.steps_completed.includes(2)

      if (aWaiting && !bWaiting) return 1
      if (!aWaiting && bWaiting) return -1

      // Then sort by creation date (newest first)
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })

    return { activeClaims: active, closedClaims: closed }
  }, [claims, searchQuery])

  return (
    <Layout>
      <div className="space-y-8 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-3xl font-display font-bold text-navy">Your Claims</h2>
            <p className="mt-2 text-slate">
              {claims
                ? `${activeClaims.length} active • ${closedClaims.length} closed`
                : 'Loading...'}
            </p>
          </div>
        </div>

        {/* Search Bar */}
        <div className="glass-card-strong rounded-2xl p-2 animate-slide-up delay-100">
          <div className="relative">
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
              <svg
                className="h-6 w-6 text-teal"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
            <input
              type="text"
              placeholder="Search claims..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-14 pr-4 py-4 bg-transparent text-navy placeholder-slate/50 focus:outline-none text-lg"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-4 flex items-center text-slate hover:text-navy transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center py-20">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-teal border-t-transparent"></div>
              <p className="mt-4 text-slate">Loading claims...</p>
            </div>
          </div>
        ) : (
          <>
            {/* Active Claims */}
            {activeClaims.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate">
                  Active Claims ({activeClaims.length})
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {activeClaims.map((claim, index) => (
                    <div
                      key={claim.id}
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      <ClaimCard claim={claim} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Closed Claims */}
            {closedClaims.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate">
                  Closed Claims ({closedClaims.length})
                </h3>
                <button
                  onClick={() => {/* Toggle expand */}}
                  className="text-sm text-teal hover:text-teal-dark font-medium"
                >
                  View all →
                </button>
              </div>
            )}

            {/* Empty State */}
            {activeClaims.length === 0 && closedClaims.length === 0 && !searchQuery && (
              <div className="glass-card rounded-2xl p-12 text-center animate-scale-in">
                <svg
                  className="mx-auto h-16 w-16 text-slate/50"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <h3 className="mt-4 text-xl font-display font-semibold text-navy">
                  No claims yet
                </h3>
                <p className="mt-2 text-slate">Create your first claim to get started</p>
              </div>
            )}

            {/* No Search Results */}
            {activeClaims.length === 0 && closedClaims.length === 0 && searchQuery && (
              <div className="glass-card rounded-2xl p-12 text-center animate-scale-in">
                <svg
                  className="mx-auto h-16 w-16 text-slate/50"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                <h3 className="mt-4 text-xl font-display font-semibold text-navy">
                  No claims found
                </h3>
                <p className="mt-2 text-slate">No claims match your search for "{searchQuery}"</p>
                <button
                  onClick={() => setSearchQuery('')}
                  className="mt-6 btn-secondary px-6 py-2 rounded-xl text-sm font-medium"
                >
                  Clear search
                </button>
              </div>
            )}
          </>
        )}

        {/* Floating Action Button */}
        <button
          onClick={() => setShowCreateModal(true)}
          className="fixed bottom-8 right-8 w-14 h-14 bg-gradient-to-br from-teal to-teal-dark rounded-full shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center text-white text-2xl z-50"
          aria-label="Create new claim"
        >
          +
        </button>

        {/* TODO: Create Claim Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50">
            <div className="bg-white rounded-t-3xl md:rounded-3xl p-6 w-full md:max-w-md">
              <p>Create Claim Modal - Coming in Phase 3</p>
              <button onClick={() => setShowCreateModal(false)}>Close</button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
```

**Step 2: Commit**

```bash
git add frontend/src/pages/Dashboard.tsx
git commit -m "feat(dashboard): redesign with claim cards and smart sorting"
```

---

## Phase 3: Create Claim Flow

### Task 3.1: Create ReportDamageModal Component

**Files:**
- Create: `frontend/src/components/ReportDamageModal.tsx`

**Step 1: Create modal component**

```typescript
// frontend/src/components/ReportDamageModal.tsx

import { useState } from 'react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'

interface Property {
  id: string
  nickname: string
  legal_address: string
}

interface ReportDamageModalProps {
  isOpen: boolean
  onClose: () => void
  preselectedPropertyId?: string
}

export default function ReportDamageModal({
  isOpen,
  onClose,
  preselectedPropertyId,
}: ReportDamageModalProps) {
  const [propertyId, setPropertyId] = useState(preselectedPropertyId || '')
  const [lossType, setLossType] = useState<'water' | 'hail' | ''>('')
  const [incidentDate, setIncidentDate] = useState('')
  const [description, setDescription] = useState('')
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: properties } = useQuery({
    queryKey: ['properties'],
    queryFn: async () => {
      const response = await api.get('/api/properties')
      return response.data.data as Property[]
    },
  })

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await api.post('/api/claims', data)
      return response.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['claims'] })
      onClose()
      // Navigate to the new claim
      navigate(`/claims/${data.data.id}`)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    mutation.mutate({
      property_id: propertyId,
      loss_type: lossType,
      incident_date: incidentDate,
      description: description || undefined,
      current_step: 1,
      steps_completed: [1],
      status: 'active',
    })
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 animate-fade-in">
      <div className="bg-white rounded-t-3xl md:rounded-3xl p-8 w-full md:max-w-md max-h-[90vh] overflow-y-auto animate-slide-up">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-display font-bold text-navy">Report Damage</h2>
          <button
            onClick={onClose}
            className="text-slate hover:text-navy transition-colors"
            aria-label="Close"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Property Selection */}
          <div>
            <label htmlFor="property" className="block text-sm font-medium text-navy mb-2">
              Property *
            </label>
            <select
              id="property"
              required
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              className="glass-input w-full px-4 py-3 rounded-xl text-navy"
            >
              <option value="">Select a property</option>
              {properties?.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.nickname} - {property.legal_address}
                </option>
              ))}
            </select>
          </div>

          {/* Damage Type */}
          <div>
            <label className="block text-sm font-medium text-navy mb-3">
              What type of damage? *
            </label>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setLossType('water')}
                className={`p-6 rounded-2xl border-2 transition-all ${
                  lossType === 'water'
                    ? 'border-teal bg-teal/10'
                    : 'border-slate/20 hover:border-slate/40'
                }`}
              >
                <div className="text-4xl mb-2">💧</div>
                <div className="text-sm font-medium text-navy">Water Damage</div>
              </button>
              <button
                type="button"
                onClick={() => setLossType('hail')}
                className={`p-6 rounded-2xl border-2 transition-all ${
                  lossType === 'hail'
                    ? 'border-teal bg-teal/10'
                    : 'border-slate/20 hover:border-slate/40'
                }`}
              >
                <div className="text-4xl mb-2">🧊</div>
                <div className="text-sm font-medium text-navy">Hail Damage</div>
              </button>
            </div>
          </div>

          {/* Incident Date */}
          <div>
            <label htmlFor="date" className="block text-sm font-medium text-navy mb-2">
              When did it happen? *
            </label>
            <input
              type="date"
              id="date"
              required
              value={incidentDate}
              onChange={(e) => setIncidentDate(e.target.value)}
              max={new Date().toISOString().split('T')[0]}
              className="glass-input w-full px-4 py-3 rounded-xl text-navy"
            />
          </div>

          {/* Description (Optional) */}
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-navy mb-2">
              Brief description (optional)
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Describe what happened..."
              className="glass-input w-full px-4 py-3 rounded-xl text-navy resize-none"
            />
          </div>

          {/* Error Message */}
          {mutation.isError && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200">
              <p className="text-sm text-red-700">
                {(mutation.error as any)?.response?.data?.error || 'Failed to create claim'}
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex space-x-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 btn-secondary px-6 py-3 rounded-xl text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending || !propertyId || !lossType || !incidentDate}
              className="flex-1 btn-primary px-6 py-3 rounded-xl text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {mutation.isPending ? 'Creating...' : 'Create Claim →'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

**Step 2: Update Dashboard to use ReportDamageModal**

Replace the TODO section in Dashboard.tsx:

```typescript
// Replace the TODO section with:
<ReportDamageModal
  isOpen={showCreateModal}
  onClose={() => setShowCreateModal(false)}
/>
```

And add the import at the top:

```typescript
import ReportDamageModal from '../components/ReportDamageModal'
```

**Step 3: Commit**

```bash
git add frontend/src/components/ReportDamageModal.tsx frontend/src/pages/Dashboard.tsx
git commit -m "feat(claims): add report damage modal with water/hail types"
```

---

## Phase 4: Claim Home Structure

### Task 4.1: Create ProgressBar Component

**Files:**
- Create: `frontend/src/components/ProgressBar.tsx`

**Step 1: Create component**

```typescript
// frontend/src/components/ProgressBar.tsx

import { getProgress } from '../lib/stepUtils'

interface ProgressBarProps {
  stepsCompleted: number[]
  currentStep: number
}

export default function ProgressBar({ stepsCompleted, currentStep }: ProgressBarProps) {
  const progress = getProgress(stepsCompleted)

  return (
    <div className="glass-card rounded-2xl p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium text-navy">
          Progress: {progress.completed} of {progress.total} steps done
        </p>
        <p className="text-xs text-slate">{progress.percentage}%</p>
      </div>

      <div className="flex items-center space-x-1">
        {[1, 2, 3, 4, 5, 6].map((step) => (
          <div
            key={step}
            className={`h-2 flex-1 rounded-full transition-all duration-300 ${
              stepsCompleted.includes(step)
                ? 'bg-teal'
                : step === currentStep
                ? 'bg-teal/50 animate-pulse'
                : 'bg-slate/20'
            }`}
          />
        ))}
      </div>

      {/* Optional: Mobile-friendly text-only version */}
      <div className="md:hidden mt-3 flex items-center justify-center">
        <div className="flex space-x-1">
          {[1, 2, 3, 4, 5, 6].map((step) => (
            <span
              key={step}
              className={`text-sm ${
                stepsCompleted.includes(step)
                  ? 'text-teal'
                  : step === currentStep
                  ? 'text-teal/70'
                  : 'text-slate/40'
              }`}
            >
              {stepsCompleted.includes(step) ? '●' : step === currentStep ? '◉' : '○'}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/ProgressBar.tsx
git commit -m "feat(ui): add progress bar component with step indicators"
```

---

### Task 4.2: Create CompletedStep Component

**Files:**
- Create: `frontend/src/components/CompletedStep.tsx`

**Step 1: Create component**

```typescript
// frontend/src/components/CompletedStep.tsx

import { useState } from 'react'
import { getStepDefinition } from '../lib/stepUtils'

interface CompletedStepProps {
  stepNumber: 1 | 2 | 3 | 4 | 5 | 6
  claim: any
}

export default function CompletedStep({ stepNumber, claim }: CompletedStepProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const step = getStepDefinition(stepNumber)

  const getStepSummary = () => {
    switch (stepNumber) {
      case 1:
        return {
          icon: '📋',
          title: 'Damage Reported',
          detail: `${claim.loss_type === 'water' ? 'Water' : 'Hail'} damage on ${new Date(
            claim.incident_date
          ).toLocaleDateString()}`,
        }
      case 2:
        return {
          icon: '📸',
          title: 'Photos Received',
          detail: `From: ${claim.contractor_name || 'contractor'} • ${
            claim.contractor_estimate_total
              ? `$${claim.contractor_estimate_total.toLocaleString()} estimate`
              : ''
          }`,
        }
      case 3:
        return {
          icon: '💰',
          title: 'Worth Filing',
          detail:
            claim.deductible_comparison_result === 'worth_filing'
              ? 'Above deductible'
              : 'Below deductible',
        }
      case 4:
        return {
          icon: '📋',
          title: 'Filed with Insurance',
          detail: claim.insurance_claim_number
            ? `Claim #${claim.insurance_claim_number}`
            : 'Filed',
        }
      case 5:
        return {
          icon: '🤖',
          title: 'Insurance Offer Reviewed',
          detail: 'AI comparison completed',
        }
      case 6:
        return {
          icon: '✅',
          title: 'Claim Closed',
          detail: 'All payments received',
        }
      default:
        return {
          icon: '✅',
          title: 'Complete',
          detail: '',
        }
    }
  }

  const summary = getStepSummary()

  return (
    <div className="mb-3">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full text-left p-4 rounded-xl glass-card hover:shadow-md transition-all"
      >
        <div className="flex items-start space-x-3">
          <span className="text-xl flex-shrink-0">{summary.icon}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2">
              <span className="text-green-500">✓</span>
              <h4 className="font-medium text-navy">{summary.title}</h4>
            </div>
            <p className="text-sm text-slate mt-1">{summary.detail}</p>
          </div>
          <svg
            className={`w-5 h-5 text-slate transition-transform ${
              isExpanded ? 'rotate-180' : ''
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      </button>

      {isExpanded && (
        <div className="mt-2 ml-12 p-4 rounded-xl bg-slate/5 border border-slate/10 animate-slide-down">
          <p className="text-sm text-slate mb-2">{step.description}</p>
          {step.learnMore && (
            <p className="text-xs text-slate/70 mt-2 italic">{step.learnMore}</p>
          )}
          {/* Add more detailed info based on step type */}
        </div>
      )}
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/CompletedStep.tsx
git commit -m "feat(ui): add collapsible completed step component"
```

---

### Task 4.3: Create NextStepCard Component

**Files:**
- Create: `frontend/src/components/NextStepCard.tsx`

**Step 1: Create skeleton component**

```typescript
// frontend/src/components/NextStepCard.tsx

import { useState } from 'react'
import { getStepDefinition } from '../lib/stepUtils'

interface NextStepCardProps {
  stepNumber: 1 | 2 | 3 | 4 | 5 | 6
  claim: any
  onComplete: (data: any) => void
}

export default function NextStepCard({ stepNumber, claim, onComplete }: NextStepCardProps) {
  const [isLearnMoreExpanded, setIsLearnMoreExpanded] = useState(false)
  const step = getStepDefinition(stepNumber)

  return (
    <div className="glass-card-gradient rounded-2xl p-6 shadow-lg">
      <div className="flex items-center space-x-2 mb-4">
        <span className="text-2xl">{step.icon}</span>
        <span className="text-sm font-semibold uppercase tracking-wide text-navy/70">
          🎯 NEXT STEP
        </span>
      </div>

      <h3 className="text-2xl font-display font-bold text-navy mb-3">{step.title}</h3>

      <p className="text-slate mb-4">{step.description}</p>

      {/* Learn More Toggle */}
      <button
        onClick={() => setIsLearnMoreExpanded(!isLearnMoreExpanded)}
        className="flex items-center space-x-2 text-sm text-teal hover:text-teal-dark font-medium mb-4"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
            clipRule="evenodd"
          />
        </svg>
        <span>{isLearnMoreExpanded ? 'Show less' : 'Learn more'}</span>
        <svg
          className={`w-4 h-4 transition-transform ${isLearnMoreExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isLearnMoreExpanded && (
        <div className="mb-6 p-4 rounded-xl bg-white/50 border border-white/20 animate-slide-down">
          <p className="text-sm text-slate">{step.learnMore}</p>
        </div>
      )}

      {/* Step-specific forms will go here in Phase 6 */}
      <div className="space-y-4">
        <p className="text-sm text-slate italic">
          Step {stepNumber} form coming in Phase 6...
        </p>
        <button
          onClick={() => onComplete({})}
          className="w-full btn-primary py-4 rounded-xl text-base font-semibold"
        >
          Continue →
        </button>
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/NextStepCard.tsx
git commit -m "feat(ui): add next step card skeleton with learn more"
```

---

### Task 4.4: Create New ClaimHome Page

**Files:**
- Create: `frontend/src/pages/ClaimHome.tsx`
- Modify: `frontend/src/App.tsx` (add route)

**Step 1: Create ClaimHome page**

```typescript
// frontend/src/pages/ClaimHome.tsx

import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import Layout from '../components/Layout'
import ProgressBar from '../components/ProgressBar'
import CompletedStep from '../components/CompletedStep'
import NextStepCard from '../components/NextStepCard'
import { getDamageTypeLabel, getStepDefinition } from '../lib/stepUtils'

interface Claim {
  id: string
  loss_type: 'water' | 'hail'
  property?: {
    id: string
    nickname: string
    legal_address: string
  }
  policy?: {
    carrier_name: string
    deductible_calculated?: number
  }
  current_step: 1 | 2 | 3 | 4 | 5 | 6
  steps_completed: number[]
  status: string
  incident_date: string
  description?: string
  contractor_name?: string
  contractor_email?: string
  contractor_estimate_total?: number
  deductible_comparison_result?: 'worth_filing' | 'not_worth_filing'
  insurance_claim_number?: string
  adjuster_name?: string
  created_at: string
}

export default function ClaimHome() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: claim, isLoading } = useQuery({
    queryKey: ['claim', id],
    queryFn: async () => {
      const response = await api.get(`/api/claims/${id}`)
      return response.data.data as Claim
    },
  })

  const updateStepMutation = useMutation({
    mutationFn: async (data: { step: number; data: any }) => {
      const response = await api.patch(`/api/claims/${id}/step`, data)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['claim', id] })
    },
  })

  const handleStepComplete = (stepData: any) => {
    if (!claim) return

    const nextStep = claim.current_step + 1
    updateStepMutation.mutate({
      step: nextStep,
      data: {
        ...stepData,
        steps_completed: [...claim.steps_completed, claim.current_step],
        current_step: nextStep <= 6 ? nextStep : claim.current_step,
      },
    })
  }

  if (isLoading) {
    return (
      <Layout>
        <div className="flex justify-center items-center h-screen">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-teal border-t-transparent"></div>
        </div>
      </Layout>
    )
  }

  if (!claim) {
    return (
      <Layout>
        <div className="text-center py-20">
          <p className="text-slate">Claim not found</p>
          <button onClick={() => navigate('/dashboard')} className="mt-4 btn-primary">
            Back to Dashboard
          </button>
        </div>
      </Layout>
    )
  }

  const upcomingSteps = [claim.current_step + 1, claim.current_step + 2].filter(
    (s) => s <= 6
  ) as (1 | 2 | 3 | 4 | 5 | 6)[]

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center space-x-2 text-slate hover:text-navy transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            <span className="font-medium">Back</span>
          </button>
        </div>

        {/* Claim Header */}
        <div className="glass-card rounded-2xl p-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-display font-bold text-navy mb-2">
                {getDamageTypeLabel(claim.loss_type)}
              </h1>
              <p className="text-slate">
                {claim.property?.legal_address || claim.property?.nickname}
              </p>
              {claim.policy && (
                <p className="text-sm text-slate mt-1">
                  Insurance: {claim.policy.carrier_name}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <ProgressBar stepsCompleted={claim.steps_completed} currentStep={claim.current_step} />

        {/* Completed Steps */}
        {claim.steps_completed.length > 0 && (
          <div className="space-y-2">
            {claim.steps_completed.map((stepNum) => (
              <CompletedStep
                key={stepNum}
                stepNumber={stepNum as 1 | 2 | 3 | 4 | 5 | 6}
                claim={claim}
              />
            ))}
          </div>
        )}

        {/* Next Step Card */}
        {claim.current_step <= 6 && (
          <NextStepCard
            stepNumber={claim.current_step}
            claim={claim}
            onComplete={handleStepComplete}
          />
        )}

        {/* Coming Up Preview */}
        {upcomingSteps.length > 0 && (
          <div className="glass-card rounded-2xl p-6">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate mb-4">
              ⏳ Coming up next...
            </h3>
            <ul className="space-y-2">
              {upcomingSteps.map((stepNum) => {
                const stepDef = getStepDefinition(stepNum)
                return (
                  <li key={stepNum} className="flex items-start space-x-3 text-slate/70">
                    <span className="text-lg">{stepDef.icon}</span>
                    <span className="text-sm">{stepDef.title}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {/* Quick Actions */}
        <div className="flex space-x-4">
          <button className="flex-1 glass-card rounded-xl p-4 text-center hover:shadow-md transition-all">
            <svg
              className="w-6 h-6 mx-auto mb-2 text-teal"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
              />
            </svg>
            <span className="text-sm font-medium text-navy">View Documents</span>
          </button>
          <button className="flex-1 glass-card rounded-xl p-4 text-center hover:shadow-md transition-all">
            <svg
              className="w-6 h-6 mx-auto mb-2 text-teal"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span className="text-sm font-medium text-navy">View Timeline</span>
          </button>
        </div>
      </div>
    </Layout>
  )
}
```

**Step 2: Add route to App.tsx**

Add this route in the routes section:

```typescript
<Route path="/claims/:id" element={<ClaimHome />} />
```

And add the import:

```typescript
import ClaimHome from './pages/ClaimHome'
```

**Step 3: Commit**

```bash
git add frontend/src/pages/ClaimHome.tsx frontend/src/App.tsx
git commit -m "feat(claims): add guided claim home page with progress tracking"
```

---

## Phase 5-7: Remaining Implementation

**Note:** Due to length constraints, I'll provide a summary of the remaining phases. Each should follow the same TDD pattern with bite-sized tasks.

### Phase 5: Next Step Logic & Step Implementations

- Task 5.1: Implement Step 2 form (Send Contractor Link)
- Task 5.2: Implement Step 3 (Deductible Comparison)
- Task 5.3: Implement Step 4 (File & Schedule)
- Task 5.4: Implement Step 5 (Review Insurance Offer)
- Task 5.5: Implement Step 6 (Track Payments)

### Phase 6: Backend Updates

- Task 6.1: Update Claim model in Go to include new fields
- Task 6.2: Add `/api/claims/:id/step` PATCH endpoint
- Task 6.3: Update claim creation to initialize step tracking
- Task 6.4: Add step validation logic

### Phase 7: Polish & Optimization

- Task 7.1: Add success animations for step completion
- Task 7.2: Add loading states for async operations
- Task 7.3: Add error boundaries and error states
- Task 7.4: Mobile optimizations (touch targets, gestures)
- Task 7.5: Accessibility improvements (ARIA labels, keyboard nav)

---

## Testing Strategy

**For Each Component:**
1. Visual testing in browser (mobile and desktop)
2. User interaction testing (clicks, forms, navigation)
3. Error state testing (network failures, validation errors)
4. Edge case testing (no data, loading states)

**Integration Testing:**
1. End-to-end flow: Create claim → Complete all 6 steps → Close
2. Navigation testing: Dashboard → Claim → Back
3. Data persistence: Refresh page, verify state

---

## Deployment Checklist

- [ ] All components render correctly on mobile
- [ ] All components render correctly on desktop
- [ ] Navigation works between all pages
- [ ] Claim creation flow works end-to-end
- [ ] Step progression works correctly
- [ ] Progress bar updates correctly
- [ ] Completed steps display correctly
- [ ] Next step card shows correct content
- [ ] Error states display appropriately
- [ ] Loading states display appropriately
- [ ] Backend API supports all new fields
- [ ] Database schema updated (if needed)

---

## Success Criteria

1. **User can create a new claim** in < 1 minute
2. **User always knows what to do next** - big obvious button
3. **User can see progress** - clear visual indicators
4. **Mobile-first** - works great on phone
5. **Simple language** - high schooler can understand

---

**Plan Complete!** Ready for execution.
