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

        {/* Navigation Cards */}
        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {/* Properties Card */}
          <Link
            to="/properties"
            className="group glass-card rounded-3xl p-10 hover:scale-105 transition-all duration-300 animate-scale-in delay-200"
          >
            <div className="space-y-6">
              {/* Icon */}
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-teal to-teal-dark flex items-center justify-center group-hover:scale-110 transition-transform">
                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>

              {/* Content */}
              <div className="space-y-2">
                <h2 className="text-3xl font-display font-bold text-navy">Properties</h2>
                <p className="text-slate text-lg">
                  View and manage all your properties in one place
                </p>
              </div>

              {/* Arrow */}
              <div className="flex items-center text-teal font-medium group-hover:translate-x-2 transition-transform">
                <span>Go to Properties</span>
                <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </div>
            </div>
          </Link>

          {/* Claims Card */}
          <Link
            to="/claims"
            className="group glass-card rounded-3xl p-10 hover:scale-105 transition-all duration-300 animate-scale-in delay-300"
          >
            <div className="space-y-6">
              {/* Icon */}
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-navy to-navy-light flex items-center justify-center group-hover:scale-110 transition-transform">
                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>

              {/* Content */}
              <div className="space-y-2">
                <h2 className="text-3xl font-display font-bold text-navy">Claims</h2>
                <p className="text-slate text-lg">
                  Track and investigate all your insurance claims
                </p>
              </div>

              {/* Arrow */}
              <div className="flex items-center text-teal font-medium group-hover:translate-x-2 transition-transform">
                <span>Go to Claims</span>
                <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </div>
            </div>
          </Link>
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
