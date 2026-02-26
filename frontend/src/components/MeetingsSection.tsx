import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'

interface Meeting {
  id: string
  claim_id: string
  meeting_type: string
  scheduled_date: string
  scheduled_time: string
  location: string
  duration_minutes: number | null
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'rescheduled'
  adjuster_name: string | null
  adjuster_email: string | null
  adjuster_phone: string | null
  assigned_representative_id: string | null
  notes: string | null
  outcome_summary: string | null
  created_at: string
  updated_at: string
  completed_at: string | null
  cancelled_at: string | null
  cancellation_reason: string | null
}

interface MeetingsSectionProps {
  claimId: string
}

const statusColors = {
  scheduled: 'bg-blue-100 text-blue-800',
  confirmed: 'bg-green-100 text-green-800',
  completed: 'bg-gray-100 text-gray-800',
  cancelled: 'bg-red-100 text-red-800',
  rescheduled: 'bg-yellow-100 text-yellow-800',
}

const meetingTypeLabels: Record<string, string> = {
  adjuster_inspection: 'Adjuster Inspection',
  contractor_walkthrough: 'Site Walkthrough',
  final_inspection: 'Final Inspection',
}

export default function MeetingsSection({ claimId }: MeetingsSectionProps) {
  const queryClient = useQueryClient()
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [showCompleteModal, setShowCompleteModal] = useState(false)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null)

  // Fetch meetings
  const { data: meetings, isLoading } = useQuery<Meeting[]>({
    queryKey: ['meetings', claimId],
    queryFn: async () => {
      const response = await api.get(`/api/claims/${claimId}/meetings`)
      return response.data.data || []
    },
  })

  // Create meeting mutation
  const createMeetingMutation = useMutation({
    mutationFn: (data: any) => api.post(`/api/claims/${claimId}/meetings`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetings', claimId] })
      queryClient.invalidateQueries({ queryKey: ['claim-activities', claimId] })
      setShowScheduleModal(false)
    },
  })

  // Complete meeting mutation
  const completeMeetingMutation = useMutation({
    mutationFn: ({ meetingId, outcome_summary }: { meetingId: string; outcome_summary: string }) =>
      api.patch(`/api/meetings/${meetingId}/complete`, { outcome_summary }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetings', claimId] })
      queryClient.invalidateQueries({ queryKey: ['claim-activities', claimId] })
      setShowCompleteModal(false)
      setSelectedMeeting(null)
    },
  })

  // Cancel meeting mutation
  const cancelMeetingMutation = useMutation({
    mutationFn: ({ meetingId, cancellation_reason }: { meetingId: string; cancellation_reason: string }) =>
      api.patch(`/api/meetings/${meetingId}/cancel`, { cancellation_reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetings', claimId] })
      queryClient.invalidateQueries({ queryKey: ['claim-activities', claimId] })
      setShowCancelModal(false)
      setSelectedMeeting(null)
    },
  })

  const formatDateTime = (date: string, time: string) => {
    const dateObj = new Date(`${date}T${time}`)
    return dateObj.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  if (isLoading) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <div className="text-center text-gray-600">Loading meetings...</div>
      </div>
    )
  }

  return (
    <>
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-5 border-b border-gray-200 flex justify-between items-center">
          <h3 className="text-lg font-medium text-gray-900">Meetings</h3>
          <button
            onClick={() => setShowScheduleModal(true)}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
          >
            Schedule Meeting
          </button>
        </div>
        <div className="px-6 py-5">
          {meetings && meetings.length > 0 ? (
            <div className="space-y-4">
              {meetings.map((meeting) => (
                <div
                  key={meeting.id}
                  className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h4 className="text-base font-medium text-gray-900">
                          {meetingTypeLabels[meeting.meeting_type] || meeting.meeting_type}
                        </h4>
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            statusColors[meeting.status]
                          }`}
                        >
                          {meeting.status.charAt(0).toUpperCase() + meeting.status.slice(1)}
                        </span>
                      </div>

                      <div className="space-y-1 text-sm text-gray-600">
                        <div className="flex items-center">
                          <svg
                            className="h-4 w-4 mr-2 text-gray-400"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                            />
                          </svg>
                          {formatDateTime(meeting.scheduled_date, meeting.scheduled_time)}
                        </div>

                        <div className="flex items-center">
                          <svg
                            className="h-4 w-4 mr-2 text-gray-400"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                          </svg>
                          {meeting.location}
                        </div>

                        {meeting.adjuster_name && (
                          <div className="flex items-center">
                            <svg
                              className="h-4 w-4 mr-2 text-gray-400"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                              />
                            </svg>
                            {meeting.adjuster_name}
                            {meeting.adjuster_email && ` (${meeting.adjuster_email})`}
                          </div>
                        )}

                        {meeting.outcome_summary && (
                          <div className="mt-2 p-2 bg-gray-50 rounded text-sm">
                            <span className="font-medium">Outcome:</span> {meeting.outcome_summary}
                          </div>
                        )}

                        {meeting.cancellation_reason && (
                          <div className="mt-2 p-2 bg-red-50 rounded text-sm text-red-800">
                            <span className="font-medium">Cancelled:</span> {meeting.cancellation_reason}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    {meeting.status === 'scheduled' && (
                      <div className="flex gap-2 ml-4">
                        <button
                          onClick={() => {
                            setSelectedMeeting(meeting)
                            setShowCompleteModal(true)
                          }}
                          className="text-sm text-green-600 hover:text-green-800 font-medium"
                        >
                          Complete
                        </button>
                        <button
                          onClick={() => {
                            setSelectedMeeting(meeting)
                            setShowCancelModal(true)
                          }}
                          className="text-sm text-red-600 hover:text-red-800 font-medium"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <svg
                className="mx-auto h-12 w-12 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">No meetings scheduled</h3>
              <p className="mt-1 text-sm text-gray-500">
                Schedule a meeting with the adjuster or assessor.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Schedule Meeting Modal */}
      {showScheduleModal && (
        <ScheduleMeetingModal
          claimId={claimId}
          onClose={() => setShowScheduleModal(false)}
          onSubmit={(data) => createMeetingMutation.mutate(data)}
          isLoading={createMeetingMutation.isPending}
        />
      )}

      {/* Complete Meeting Modal */}
      {showCompleteModal && selectedMeeting && (
        <CompleteMeetingModal
          meeting={selectedMeeting}
          onClose={() => {
            setShowCompleteModal(false)
            setSelectedMeeting(null)
          }}
          onSubmit={(outcome_summary) =>
            completeMeetingMutation.mutate({ meetingId: selectedMeeting.id, outcome_summary })
          }
          isLoading={completeMeetingMutation.isPending}
        />
      )}

      {/* Cancel Meeting Modal */}
      {showCancelModal && selectedMeeting && (
        <CancelMeetingModal
          meeting={selectedMeeting}
          onClose={() => {
            setShowCancelModal(false)
            setSelectedMeeting(null)
          }}
          onSubmit={(cancellation_reason) =>
            cancelMeetingMutation.mutate({ meetingId: selectedMeeting.id, cancellation_reason })
          }
          isLoading={cancelMeetingMutation.isPending}
        />
      )}
    </>
  )
}

// Schedule Meeting Modal Component
interface ScheduleMeetingModalProps {
  claimId: string
  onClose: () => void
  onSubmit: (data: any) => void
  isLoading: boolean
}

function ScheduleMeetingModal({ onClose, onSubmit, isLoading }: ScheduleMeetingModalProps) {
  const [formData, setFormData] = useState({
    meeting_type: 'adjuster_inspection',
    scheduled_date: '',
    scheduled_time: '',
    location: '',
    duration_minutes: 60,
    adjuster_name: '',
    adjuster_email: '',
    adjuster_phone: '',
    notes: '',
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(formData)
  }

  return (
    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Schedule Meeting</h3>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Meeting Type</label>
            <select
              value={formData.meeting_type}
              onChange={(e) => setFormData({ ...formData, meeting_type: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="adjuster_inspection">Adjuster Inspection</option>
              <option value="contractor_walkthrough">Site Walkthrough</option>
              <option value="final_inspection">Final Inspection</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input
                type="date"
                value={formData.scheduled_date}
                onChange={(e) => setFormData({ ...formData, scheduled_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Time</label>
              <input
                type="time"
                value={formData.scheduled_time}
                onChange={(e) => setFormData({ ...formData, scheduled_time: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
            <input
              type="text"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              placeholder="Property address or meeting location"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Duration (minutes)
            </label>
            <input
              type="number"
              value={formData.duration_minutes}
              onChange={(e) =>
                setFormData({ ...formData, duration_minutes: parseInt(e.target.value) })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              min="15"
              step="15"
            />
          </div>

          <div className="border-t border-gray-200 pt-4">
            <h4 className="text-sm font-medium text-gray-900 mb-3">Adjuster Information (Optional)</h4>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={formData.adjuster_name}
                  onChange={(e) => setFormData({ ...formData, adjuster_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={formData.adjuster_email}
                  onChange={(e) => setFormData({ ...formData, adjuster_email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input
                  type="tel"
                  value={formData.adjuster_phone}
                  onChange={(e) => setFormData({ ...formData, adjuster_phone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Additional notes or special instructions..."
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
              disabled={isLoading}
            >
              {isLoading ? 'Scheduling...' : 'Schedule Meeting'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Complete Meeting Modal Component
interface CompleteMeetingModalProps {
  meeting: Meeting
  onClose: () => void
  onSubmit: (outcome_summary: string) => void
  isLoading: boolean
}

function CompleteMeetingModal({ meeting, onClose, onSubmit, isLoading }: CompleteMeetingModalProps) {
  const [outcomeSummary, setOutcomeSummary] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(outcomeSummary)
  }

  return (
    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Complete Meeting</h3>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          <div className="text-sm text-gray-600">
            <p>
              <span className="font-medium">Meeting:</span>{' '}
              {meetingTypeLabels[meeting.meeting_type] || meeting.meeting_type}
            </p>
            <p>
              <span className="font-medium">Date:</span>{' '}
              {new Date(`${meeting.scheduled_date}T${meeting.scheduled_time}`).toLocaleString()}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Outcome Summary <span className="text-red-500">*</span>
            </label>
            <textarea
              value={outcomeSummary}
              onChange={(e) => setOutcomeSummary(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Describe the outcome of the meeting, decisions made, next steps, etc."
              required
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50"
              disabled={isLoading}
            >
              {isLoading ? 'Completing...' : 'Complete Meeting'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Cancel Meeting Modal Component
interface CancelMeetingModalProps {
  meeting: Meeting
  onClose: () => void
  onSubmit: (cancellation_reason: string) => void
  isLoading: boolean
}

function CancelMeetingModal({ meeting, onClose, onSubmit, isLoading }: CancelMeetingModalProps) {
  const [cancellationReason, setCancellationReason] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(cancellationReason)
  }

  return (
    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Cancel Meeting</h3>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          <div className="text-sm text-gray-600">
            <p>
              <span className="font-medium">Meeting:</span>{' '}
              {meetingTypeLabels[meeting.meeting_type] || meeting.meeting_type}
            </p>
            <p>
              <span className="font-medium">Date:</span>{' '}
              {new Date(`${meeting.scheduled_date}T${meeting.scheduled_time}`).toLocaleString()}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Cancellation Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              value={cancellationReason}
              onChange={(e) => setCancellationReason(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Explain why this meeting is being cancelled..."
              required
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              disabled={isLoading}
            >
              Keep Meeting
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50"
              disabled={isLoading}
            >
              {isLoading ? 'Cancelling...' : 'Cancel Meeting'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
