import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import api from '../lib/api'
import Layout from '../components/Layout'

export default function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const response = await api.get('/api/me')
      return response.data.data
    }
  })

  return (
    <Layout>
      <div className="space-y-8 animate-fade-in">
        {/* Hero Section */}
        <div className="text-center space-y-4 py-8">
          <h1 className="text-4xl md:text-5xl font-display font-bold text-navy animate-slide-up">
            Welcome back{data?.name ? `, ${data.name}` : ''}
          </h1>
          <p className="text-xl text-slate animate-slide-up delay-100">
            What would you like to do today?
          </p>
        </div>

        {/* Primary Action - Properties */}
        <div className="max-w-2xl mx-auto">
          <Link
            to="/properties"
            className="group glass-card rounded-3xl p-12 hover:scale-105 transition-all duration-300 animate-scale-in delay-200 block"
          >
            <div className="space-y-6">
              {/* Icon */}
              <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-teal to-teal-dark flex items-center justify-center group-hover:scale-110 transition-transform">
                <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>

              {/* Content */}
              <div className="space-y-3">
                <h2 className="text-4xl font-display font-bold text-navy">View Properties</h2>
                <p className="text-slate text-xl">
                  Manage your properties and create claims
                </p>
              </div>

              {/* Arrow */}
              <div className="flex items-center text-teal font-semibold text-lg group-hover:translate-x-2 transition-transform">
                <span>Go to Properties</span>
                <svg className="w-6 h-6 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </div>
            </div>
          </Link>
        </div>

        {/* Helper Text */}
        <div className="max-w-2xl mx-auto text-center animate-fade-in delay-300">
          <p className="text-slate">
            Select a property to view details and create insurance claims
          </p>
        </div>

        {/* Quick Stats */}
        {!isLoading && data && (
          <div className="max-w-4xl mx-auto mt-12 animate-slide-up delay-400">
            <div className="glass-card rounded-2xl p-6">
              <h3 className="text-sm font-medium text-slate mb-4">Account Information</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-slate">Email</p>
                  <p className="text-sm font-medium text-navy mt-1 truncate">{data.email}</p>
                </div>
                <div>
                  <p className="text-xs text-slate">Name</p>
                  <p className="text-sm font-medium text-navy mt-1">{data.name || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate">Role</p>
                  <p className="text-sm font-medium text-navy mt-1">{data.role || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate">Organization</p>
                  <p className="text-sm font-medium text-navy mt-1">{data.organization_id || '-'}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
