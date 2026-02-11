import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'
import Layout from '../components/Layout'
import PropertyCard from '../components/PropertyCard'
import AddPropertyModal from '../components/AddPropertyModal'
import { Property } from '../types/claim'

export default function Properties() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const {
    data: properties,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['properties'],
    queryFn: async () => {
      const response = await api.get('/api/properties')
      return response.data.data as Property[]
    },
  })

  const handleSuccess = () => {
    refetch()
  }

  // Filter properties based on search query
  const filteredProperties = useMemo(() => {
    if (!properties) return []
    if (!searchQuery.trim()) return properties

    const query = searchQuery.toLowerCase()
    return properties.filter(
      (property) =>
        property.legal_address?.toLowerCase().includes(query) ||
        property.nickname?.toLowerCase().includes(query) ||
        property.owner_entity_name?.toLowerCase().includes(query)
    )
  }, [properties, searchQuery])

  return (
    <Layout>
      <div className="space-y-8 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-3xl font-display font-bold text-navy">Properties</h2>
            <p className="mt-2 text-slate">
              {properties ? `Managing ${properties.length} ${properties.length === 1 ? 'property' : 'properties'}` : 'Loading...'}
            </p>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="btn-primary inline-flex items-center px-6 py-3 rounded-xl text-sm font-semibold"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Property
          </button>
        </div>

        {/* Search Bar */}
        <div className="glass-card-strong rounded-2xl p-2 animate-slide-up delay-100">
          <div className="relative">
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
              <svg className="h-6 w-6 text-teal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              placeholder="Search by address, name, or owner..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-14 pr-4 py-4 bg-transparent text-navy placeholder-slate/50 focus:outline-none text-lg"
              autoFocus
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-4 flex items-center text-slate hover:text-navy transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Properties Grid */}
        {isLoading ? (
          <div className="flex justify-center items-center py-20">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-teal border-t-transparent"></div>
              <p className="mt-4 text-slate">Loading properties...</p>
            </div>
          </div>
        ) : filteredProperties && filteredProperties.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-slide-up delay-200">
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
          // No search results
          <div className="glass-card rounded-2xl p-12 text-center animate-scale-in">
            <svg className="mx-auto h-16 w-16 text-slate/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <h3 className="mt-4 text-xl font-display font-semibold text-navy">No properties found</h3>
            <p className="mt-2 text-slate">
              No properties match your search for "{searchQuery}"
            </p>
            <button
              onClick={() => setSearchQuery('')}
              className="mt-6 btn-secondary px-6 py-2 rounded-xl text-sm font-medium"
            >
              Clear search
            </button>
          </div>
        ) : (
          // No properties at all
          <div className="glass-card rounded-2xl p-12 text-center animate-scale-in">
            <svg className="mx-auto h-16 w-16 text-slate/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
            <h3 className="mt-4 text-xl font-display font-semibold text-navy">No properties yet</h3>
            <p className="mt-2 text-slate">
              Get started by adding your first property
            </p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="mt-6 btn-primary inline-flex items-center px-6 py-3 rounded-xl text-sm font-semibold"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Property
            </button>
          </div>
        )}
      </div>

      <AddPropertyModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleSuccess}
      />
    </Layout>
  )
}
