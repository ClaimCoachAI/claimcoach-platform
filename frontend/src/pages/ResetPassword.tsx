import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function ResetPassword() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [validSession, setValidSession] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setValidSession(true)
      } else {
        setError('Invalid or expired reset link. Please request a new one.')
      }
    })
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    setLoading(true)

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
      })

      if (updateError) throw updateError

      await supabase.auth.signOut()
      navigate('/login?reset=success')
    } catch (err: any) {
      setError(err.message || 'Failed to reset password')
    } finally {
      setLoading(false)
    }
  }

  if (!validSession && error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 sm:px-6 lg:px-8">
        <div className="w-full max-w-md animate-fade-in">
          <div className="glass-card-strong rounded-3xl p-8 sm:p-10 text-center animate-scale-in">
            <div className="mx-auto flex items-center justify-center w-16 h-16 rounded-full bg-red-50 mb-6">
              <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>

            <h2 className="text-3xl font-display font-bold text-navy mb-4">Reset link expired</h2>

            <div className="p-4 rounded-xl bg-red-50 border border-red-200 mb-8">
              <p className="text-sm text-red-700">{error}</p>
            </div>

            <div className="space-y-3">
              <Link
                to="/forgot-password"
                className="btn-primary w-full py-3 px-4 rounded-xl text-base font-semibold block"
              >
                Request new reset link
              </Link>
              <Link
                to="/login"
                className="block text-sm font-medium text-slate hover:text-navy transition-colors"
              >
                Back to Sign in
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md animate-fade-in">
        <div className="text-center mb-8">
          <Link to="/login" className="inline-block mb-8">
            <img src="/logo.png" alt="ClaimCoach" className="h-12 mx-auto" />
          </Link>
        </div>

        <div className="glass-card-strong rounded-3xl p-8 sm:p-10 animate-scale-in">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-display font-bold text-navy mb-2">Set new password</h2>
            <p className="text-slate">Enter your new password below</p>
          </div>

          {error && (
            <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 animate-slide-down">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-navy mb-2">
                New password
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="glass-input w-full px-4 py-3 rounded-xl text-navy placeholder-slate/50 focus:placeholder-slate/30 transition-all"
                placeholder="Minimum 8 characters"
                minLength={6}
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-navy mb-2">
                Confirm new password
              </label>
              <input
                id="confirmPassword"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="glass-input w-full px-4 py-3 rounded-xl text-navy placeholder-slate/50 focus:placeholder-slate/30 transition-all"
                placeholder="Re-enter your password"
                minLength={6}
              />
            </div>

            <button
              type="submit"
              disabled={loading || !validSession}
              className="btn-primary w-full py-3 px-4 rounded-xl text-base font-semibold disabled:opacity-50 disabled:cursor-not-allowed mt-6"
            >
              {loading ? 'Resetting password...' : 'Reset password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
