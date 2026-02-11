import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'
import Layout from '../components/Layout'
import PropertyCard from '../components/PropertyCard'
import type { Property } from '../types/claim'

export default function Dashboard() {
  const [searchQuery, setSearchQuery] = useState('')
  const navigate = useNavigate()

  const {
    data: properties,
    isLoading,
  } = useQuery({
    queryKey: ['properties'],
    queryFn: async () => {
      const response = await api.get('/api/properties')
      return response.data.data as Property[]
    },
  })

  // Filter properties
  const filteredProperties = useMemo(() => {
    if (!properties) return []

    if (searchQuery.trim()) {
      return properties.filter(
        (property) =>
          property.legal_address?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          property.owner_entity_name?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }

    return properties
  }, [properties, searchQuery])

  return (
    <Layout>
      <div className="space-y-8 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-3xl font-display font-bold text-navy">Your Properties</h2>
            <p className="mt-2 text-slate">
              {properties
                ? `${properties.length} ${properties.length === 1 ? 'property' : 'properties'}`
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
              placeholder="Search properties..."
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
              <p className="mt-4 text-slate">Loading properties...</p>
            </div>
          </div>
        ) : (
          <>
            {/* Properties Grid */}
            {filteredProperties.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredProperties.map((property, index) => (
                  <div
                    key={property.id}
                    style={{ animationDelay: `${index * 50}ms` }}
                    className="animate-scale-in"
                  >
                    <PropertyCard property={property} />
                  </div>
                ))}
              </div>
            ) : searchQuery ? (
              // No Search Results
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
                  No properties found
                </h3>
                <p className="mt-2 text-slate">No properties match your search for "{searchQuery}"</p>
                <button
                  onClick={() => setSearchQuery('')}
                  className="mt-6 btn-secondary px-6 py-2 rounded-xl text-sm font-medium"
                >
                  Clear search
                </button>
              </div>
            ) : (
              // Empty State
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
                    d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                  />
                </svg>
                <h3 className="mt-4 text-xl font-display font-semibold text-navy">
                  No properties yet
                </h3>
                <p className="mt-2 text-slate">Add your first property to get started</p>
                <button
                  onClick={() => navigate('/properties/new')}
                  className="mt-6 btn-primary px-6 py-3 rounded-xl text-sm font-semibold"
                >
                  Add Property
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  )
}
