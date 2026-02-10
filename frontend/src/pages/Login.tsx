import { useState, useEffect } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  useEffect(() => {
    if (searchParams.get('reset') === 'success') {
      setSuccess('Password reset successful! Please sign in with your new password.')
    }
  }, [searchParams])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await signIn(email, password)
      navigate('/dashboard')
    } catch (err: any) {
      setError(err.message || 'Failed to sign in')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left side - Hero Section */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-gradient-to-br from-[#2A4A70] via-[#3BA090] to-[#1E3A5F] overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 bg-dots opacity-20"></div>
        <div className="absolute inset-0 bg-mesh"></div>

        {/* Logo */}
        <div className="absolute top-8 left-8 z-10">
          <img src="/logo.png" alt="ClaimCoach" className="h-16 brightness-0 invert" />
        </div>

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-center px-16 space-y-8 animate-fade-in">
          <h1 className="text-5xl font-display font-bold text-white leading-tight">
            Manage insurance claims with confidence
          </h1>

          {/* Feature Cards */}
          <div className="space-y-4">
            <div className="glass-card p-6 rounded-2xl border-white/20 animate-slide-up delay-100">
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0 w-12 h-12 bg-teal rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Track Every Claim</h3>
                  <p className="text-white/70 text-sm mt-1">Monitor all your property claims in one centralized dashboard</p>
                </div>
              </div>
            </div>

            <div className="glass-card p-6 rounded-2xl border-white/20 animate-slide-up delay-200">
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0 w-12 h-12 bg-teal rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Manage Properties</h3>
                  <p className="text-white/70 text-sm mt-1">Organize hundreds of properties with powerful search and filters</p>
                </div>
              </div>
            </div>

            <div className="glass-card p-6 rounded-2xl border-white/20 animate-slide-up delay-300">
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0 w-12 h-12 bg-teal rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">AI-Powered Insights</h3>
                  <p className="text-white/70 text-sm mt-1">Get intelligent recommendations and streamline your workflow</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right side - Form */}
      <div className="flex-1 flex items-center justify-center px-4 sm:px-6 lg:px-8 relative">
        <div className="w-full max-w-md space-y-8 animate-fade-in">
          {/* Logo for mobile */}
          <div className="lg:hidden flex justify-center mb-8">
            <img src="/logo.png" alt="ClaimCoach" className="h-12" />
          </div>

          {/* Form Container */}
          <div className="glass-card-strong rounded-3xl p-8 sm:p-10 animate-scale-in">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-display font-bold text-navy">Welcome back</h2>
              <p className="mt-2 text-slate">Sign in to your account</p>
            </div>

            {error && (
              <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 animate-slide-down">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {success && (
              <div className="mb-6 p-4 rounded-xl bg-green-50 border border-green-200 animate-slide-down">
                <p className="text-sm text-green-700">{success}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-navy mb-2">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="glass-input w-full px-4 py-3 rounded-xl text-navy placeholder-slate/50 focus:placeholder-slate/30 transition-all"
                  placeholder="you@company.com"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor="password" className="block text-sm font-medium text-navy">
                    Password
                  </label>
                  <Link
                    to="/forgot-password"
                    className="text-sm font-medium text-teal hover:text-teal-dark transition-colors"
                  >
                    Forgot password?
                  </Link>
                </div>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="glass-input w-full px-4 py-3 rounded-xl text-navy placeholder-slate/50 focus:placeholder-slate/30 transition-all"
                  placeholder="••••••••"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full py-3 px-4 rounded-xl text-base font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Signing in...' : 'Sign in'}
              </button>
            </form>

            <div className="mt-8 text-center">
              <p className="text-sm text-slate">
                Don't have an account?{' '}
                <Link
                  to="/signup"
                  className="font-medium text-teal hover:text-teal-dark transition-colors"
                >
                  Sign up
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
