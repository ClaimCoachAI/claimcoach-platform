const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'

interface ErrorReport {
  source: 'mutation' | 'query' | 'crash'
  url: string
  errorMessage: string
  claimId: string
}

/**
 * Extracts the claim ID from a pathname like /claims/abc-123/...
 * Returns empty string if not on a claim route.
 */
export function extractClaimId(pathname: string): string {
  const match = pathname.match(/\/claims\/([^/]+)/)
  return match ? match[1] : ''
}

/**
 * Fire-and-forget. Reports a blocking error to the backend, which posts to Slack.
 * Never throws — error reporting must not worsen the user's situation.
 */
export function reportError(report: ErrorReport): void {
  try {
    fetch(`${API_BASE}/api/errors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: report.source,
        url: report.url,
        error_message: report.errorMessage,
        claim_id: report.claimId,
      }),
    }).catch(() => {
      // Intentionally ignored — error reporting must never throw
    })
  } catch {
    // Intentionally ignored
  }
}
