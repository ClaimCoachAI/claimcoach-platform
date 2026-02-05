import { useAuth } from '../contexts/AuthContext'
import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'

export default function Dashboard() {
  const { signOut } = useAuth()

  const { data, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const response = await api.get('/api/me')
      return response.data.data
    }
  })

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-6 px-4 flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-900">ClaimCoach AI</h1>
          <button
            onClick={() => signOut()}
            className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Sign Out
          </button>
        </div>
      </header>
      <main className="max-w-7xl mx-auto py-6 px-4">
        {isLoading ? (
          <p>Loading...</p>
        ) : (
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Welcome!</h2>
            <div className="space-y-2 text-sm">
              <p><strong>Email:</strong> {data?.email}</p>
              <p><strong>Name:</strong> {data?.name}</p>
              <p><strong>Role:</strong> {data?.role}</p>
              <p><strong>Organization ID:</strong> {data?.organization_id}</p>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
