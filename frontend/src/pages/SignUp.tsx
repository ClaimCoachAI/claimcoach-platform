import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import api from '../lib/api'

export default function SignUp() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      })

      if (signUpError) throw signUpError
      if (!data.session) {
        setError('Please check your email to confirm your account')
        setLoading(false)
        return
      }

      await api.post('/api/auth/complete-signup', {
        token: data.session.access_token,
        name: name || email.split('@')[0],
      })

      navigate('/dashboard')
    } catch (err: any) {
      setError(err.message || 'Failed to sign up')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left side - Hero Section */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-gradient-to-br from-[#3BA090] via-[#52B5A5] to-[#2A4A70] overflow-hidden">
        <div className="absolute inset-0 bg-dots opacity-20"></div>
        <div className="absolute inset-0 bg-mesh"></div>

        <div className="absolute top-8 left-8 z-10">
          <img src="/logo.png" alt="ClaimCoach" className="h-16 brightness-0 invert" />
        </div>

        <div className="relative z-10 flex flex-col justify-center px-16 space-y-8 animate-fade-in">
          <h1 className="text-5xl font-display font-bold text-white leading-tight">
            Start managing claims smarter today
          </h1>
          <p className="text-xl text-white/80 leading-relaxed">
            Join property managers who trust ClaimCoach to streamline their insurance claims process
          </p>

          <div className="space-y-6 pt-4">
            <div className="flex items-center space-x-4 animate-slide-up delay-100">
              <div className="flex-shrink-0 w-10 h-10 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-white/90 text-lg">Get started free - no credit card required</p>
            </div>
            <div className="flex items-center space-x-4 animate-slide-up delay-200">
              <div className="flex-shrink-0 w-10 h-10 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-white/90 text-lg">Manage unlimited properties and claims</p>
            </div>
            <div className="flex items-center space-x-4 animate-slide-up delay-300">
              <div className="flex-shrink-0 w-10 h-10 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-white/90 text-lg">AI-powered insights to streamline your workflow</p>
            </div>
          </div>
        </div>
      </div>

      {/* Right side - Form */}
      <div className="flex-1 flex items-center justify-center px-4 sm:px-6 lg:px-8">
        <div className="w-full max-w-md space-y-8 animate-fade-in">
          <div className="lg:hidden flex justify-center mb-8">
            <img src="/logo.png" alt="ClaimCoach" className="h-12" />
          </div>

          <div className="glass-card-strong rounded-3xl p-8 sm:p-10 animate-scale-in">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-display font-bold text-navy">Create your account</h2>
              <p className="mt-2 text-slate">Get started in less than 2 minutes</p>
            </div>

            {error && (
              <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 animate-slide-down">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-navy mb-2">
                  Full name
                </label>
                <input
                  id="name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="glass-input w-full px-4 py-3 rounded-xl text-navy placeholder-slate/50 focus:placeholder-slate/30 transition-all"
                  placeholder="John Smith"
                />
              </div>

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
                <label htmlFor="password" className="block text-sm font-medium text-navy mb-2">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="glass-input w-full px-4 py-3 rounded-xl text-navy placeholder-slate/50 focus:placeholder-slate/30 transition-all"
                  placeholder="••••••••"
                />
                <p className="mt-2 text-xs text-slate">Must be at least 8 characters</p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full py-3 px-4 rounded-xl text-base font-semibold disabled:opacity-50 disabled:cursor-not-allowed mt-6"
              >
                {loading ? 'Creating account...' : 'Create account'}
              </button>
            </form>

            <div className="mt-8 text-center">
              <p className="text-sm text-slate">
                Already have an account?{' '}
                <Link
                  to="/login"
                  className="font-medium text-teal hover:text-teal-dark transition-colors"
                >
                  Sign in
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
