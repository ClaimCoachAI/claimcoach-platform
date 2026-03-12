import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider, MutationCache, QueryCache } from '@tanstack/react-query'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import { reportError, extractClaimId } from './lib/errorReporter'
import Login from './pages/Login'
import SignUp from './pages/SignUp'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import Dashboard from './pages/Dashboard'
import Claims from './pages/Claims'
import ClaimHome from './pages/ClaimHome'
import Properties from './pages/Properties'
import PropertyDetail from './pages/PropertyDetail'
import ContractorUpload from './pages/ContractorUpload'
import ContractorUploadV2 from './pages/ContractorUploadV2'
import LegalApprovalPage from './pages/LegalApprovalPage'

const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onError: (error) => {
      reportError({
        source: 'mutation',
        url: window.location.pathname,
        errorMessage: String(error),
        claimId: extractClaimId(window.location.pathname),
      })
    },
  }),
  queryCache: new QueryCache({
    onError: (error, query) => {
      if ((query.state.fetchFailureCount ?? 0) !== 1) return
      reportError({
        source: 'query',
        url: window.location.pathname,
        errorMessage: String(error),
        claimId: extractClaimId(window.location.pathname),
      })
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" />
  }

  return <>{children}</>
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ErrorBoundary>
          <BrowserRouter>
            <Routes>
              {/* Public routes */}
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<SignUp />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/upload/:token" element={<ContractorUpload />} />
              <Route path="/contractor/v2/:token" element={<ContractorUploadV2 />} />
              <Route path="/legal-approval/:token" element={<LegalApprovalPage />} />

              {/* Protected routes */}
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/claims"
                element={
                  <ProtectedRoute>
                    <Claims />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/claims/:id"
                element={
                  <ProtectedRoute>
                    <ClaimHome />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/properties"
                element={
                  <ProtectedRoute>
                    <Properties />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/properties/:id"
                element={
                  <ProtectedRoute>
                    <PropertyDetail />
                  </ProtectedRoute>
                }
              />
              <Route path="/" element={<Navigate to="/claims" />} />
            </Routes>
          </BrowserRouter>
        </ErrorBoundary>
      </AuthProvider>
    </QueryClientProvider>
  )
}

export default App
