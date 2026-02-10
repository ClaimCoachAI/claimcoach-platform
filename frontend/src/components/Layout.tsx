import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useState } from 'react'

interface LayoutProps {
  children: React.ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const { signOut, user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [showUserMenu, setShowUserMenu] = useState(false)

  const handleSignOut = () => {
    signOut()
    navigate('/login')
  }

  const isActive = (path: string) => {
    return location.pathname === path
  }

  const getBreadcrumb = () => {
    const path = location.pathname
    const parts = path.split('/').filter(Boolean)

    if (path === '/dashboard') return null
    if (path === '/properties') return 'Properties'
    if (path === '/claims') return 'Claims'
    if (path.startsWith('/properties/')) return 'Properties > Property Details'
    if (path.startsWith('/claims/')) return 'Claims > Claim Details'

    return null
  }

  const breadcrumb = getBreadcrumb()

  return (
    <div className="min-h-screen">
      {/* Glass Navigation Bar */}
      <header className="sticky top-0 z-50 glass-card-strong border-0 border-b border-white/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-18 py-4">
            {/* Logo */}
            <Link to="/dashboard" className="flex items-center hover:opacity-80 transition-opacity">
              <img src="/logo.png" alt="ClaimCoach" className="h-10" />
            </Link>

            {/* Breadcrumb (Center) */}
            {breadcrumb && (
              <div className="hidden md:block absolute left-1/2 transform -translate-x-1/2">
                <div className="flex items-center space-x-2 text-sm">
                  <span className="text-slate">{breadcrumb}</span>
                </div>
              </div>
            )}

            {/* Right side actions */}
            <div className="flex items-center space-x-3">
              {/* User Menu */}
              <div className="relative">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="glass-button flex items-center space-x-3 px-4 py-2 rounded-xl hover:scale-105 transition-transform"
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal to-teal-dark flex items-center justify-center">
                    <span className="text-white text-sm font-semibold">
                      {user?.email?.[0].toUpperCase() || 'U'}
                    </span>
                  </div>
                  <svg
                    className={`w-4 h-4 text-slate transition-transform ${showUserMenu ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Dropdown Menu */}
                {showUserMenu && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setShowUserMenu(false)}
                    ></div>
                    <div className="absolute right-0 mt-2 w-56 glass-card-strong rounded-2xl shadow-xl overflow-hidden z-20 animate-slide-down">
                      <div className="px-4 py-3 border-b border-white/20">
                        <p className="text-sm font-medium text-navy truncate">{user?.email}</p>
                        <p className="text-xs text-slate mt-1">Account settings</p>
                      </div>
                      <button
                        onClick={handleSignOut}
                        className="w-full px-4 py-3 text-left text-sm text-slate hover:bg-white/50 transition-colors flex items-center space-x-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        <span>Sign out</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  )
}
