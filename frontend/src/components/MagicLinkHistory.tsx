import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'

interface MagicLink {
  id: string
  contractor_name: string
  contractor_email: string
  contractor_phone: string | null
  status: 'active' | 'expired' | 'completed'
  created_at: string
  expires_at: string
  accessed_at: string | null
  access_count: number
  email_sent: boolean
  email_sent_at: string | null
  email_error: string | null
  created_by_user: {
    id: string
    name: string
    email: string
  } | null
  link_url: string
}

interface MagicLinkHistoryProps {
  claimId: string
}

export default function MagicLinkHistory({ claimId }: MagicLinkHistoryProps) {
  // Fetch magic links
  const { data: magicLinks, isLoading } = useQuery({
    queryKey: ['magic-links', claimId],
    queryFn: async () => {
      const response = await api.get(`/api/claims/${claimId}/magic-links`)
      return response.data.data as MagicLink[]
    },
  })

  const formatDateTime = (dateString?: string | null) => {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { color: string; label: string }> = {
      active: { color: 'bg-green-100 text-green-800', label: 'Active' },
      expired: { color: 'bg-gray-100 text-gray-800', label: 'Expired' },
      completed: { color: 'bg-blue-100 text-blue-800', label: 'Completed' },
    }
    const config = statusConfig[status] || statusConfig.active
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${config.color}`}>
        {config.label}
      </span>
    )
  }

  const getEmailStatusIcon = (emailSent: boolean, emailError: string | null) => {
    if (emailSent) {
      return (
        <span className="inline-flex items-center gap-1 text-green-600" title="Email sent successfully">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
          Sent
        </span>
      )
    } else {
      return (
        <span
          className="inline-flex items-center gap-1 text-red-600"
          title={emailError || 'Email send failed'}
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
              clipRule="evenodd"
            />
          </svg>
          Failed
        </span>
      )
    }
  }

  return (
    <div className="bg-white shadow rounded-lg">
      <div className="px-6 py-5 border-b border-gray-200">
        <h3 className="text-lg font-medium text-gray-900">Magic Link History</h3>
        <p className="mt-1 text-sm text-gray-500">
          Track all magic links sent to contractors for this claim
        </p>
      </div>

      <div className="px-6 py-5">
        {isLoading ? (
          <div className="text-center py-4 text-gray-600">
            Loading magic link history...
          </div>
        ) : magicLinks && magicLinks.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Contractor
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Sent By
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date Sent
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Email Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Access Info
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {magicLinks.map((link) => (
                  <tr key={link.id} className="hover:bg-gray-50">
                    <td className="px-4 py-4">
                      <div className="text-sm">
                        <div className="font-medium text-gray-900">{link.contractor_name}</div>
                        <div className="text-gray-500">{link.contractor_email}</div>
                        {link.contractor_phone && (
                          <div className="text-gray-500">{link.contractor_phone}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="text-sm">
                        {link.created_by_user ? (
                          <>
                            <div className="font-medium text-gray-900">{link.created_by_user.name}</div>
                            <div className="text-gray-500">{link.created_by_user.email}</div>
                          </>
                        ) : (
                          <span className="text-gray-400 italic">System</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600">
                      {formatDateTime(link.created_at)}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      {getStatusBadge(link.status)}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm">
                      {getEmailStatusIcon(link.email_sent, link.email_error)}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600">
                      <div>
                        <div>Accessed: {link.access_count} time{link.access_count !== 1 ? 's' : ''}</div>
                        {link.accessed_at && (
                          <div className="text-gray-500 text-xs">
                            Last: {formatDateTime(link.accessed_at)}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
                d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
              />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">
              No magic links sent yet
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Magic links sent to contractors will appear here.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
