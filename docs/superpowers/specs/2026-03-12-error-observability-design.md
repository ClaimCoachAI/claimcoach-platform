# Error Observability — Design Spec
**Date:** 2026-03-12
**Status:** Approved

## Problem

Users get blocked at claim steps with no way forward, and the team has no visibility into these failures until a user reports them. The existing health check only verifies services are reachable — it does not detect runtime errors or user-facing failures.

## Goal

Post a Slack alert to `#ops` whenever a user is blocked in the app, covering: frontend mutation failures, frontend query failures, React crashes, backend 5xx errors, and silent async job failures (PDF parse, estimate generation).

---

## Architecture

### Frontend — `src/lib/errorReporter.ts` (new)

A single shared function `reportError({ source, url, errorMessage, claimId })` that POSTs to `POST /api/errors`. Called from three places:

1. **`MutationCache.onError`** in `App.tsx` — fires for every failed mutation across all steps automatically. Parses claim ID from `window.location.pathname`. No per-component changes needed.
2. **`QueryCache.onError`** in `App.tsx` — fires when any data fetch fails (claim load errors, etc.).
3. **`ErrorBoundary.componentDidCatch`** in `ErrorBoundary.tsx` — fires on React component crashes. Currently only `console.error`s; this wires it to the reporter.

The reporter is fire-and-forget (no await, no UI side effects). If the report POST itself fails, it silently swallows the error — error reporting must never break the user's experience further.

### Frontend — `App.tsx` changes

Replace the bare `new QueryClient({ defaultOptions: ... })` with one that includes `MutationCache` and `QueryCache` with `onError` handlers wired to `reportError`.

### Backend — `internal/services/slack_service.go` (new)

New package with the same posting logic as the healthcheck binary's `postToSlack` function. Provides:
- `NewSlackService(token string) *SlackService`
- `PostAlert(message string) error` — posts to `#ops`
- In-memory rate limiter: silences identical fingerprints for 5 minutes. Fingerprints are defined as:
  - Backend 5xx: `method + endpoint + status_code`
  - Frontend reports: `source + first 80 chars of error_message`
- If `token` is empty, `PostAlert` is a no-op and logs a warning — alerts are silently skipped rather than panicking.

After this file is created, update `cmd/healthcheck/main.go` to use the new shared service. To avoid dragging transitive dependencies (DB, LLM clients, storage) into the healthcheck binary, `SlackService` must live in a minimal `internal/slack` package with no dependencies beyond `net/http` — not in `internal/services`.

### Backend — `internal/middleware/error_reporter.go` (new)

Gin middleware that runs after the handler. If response status >= 500, calls `SlackService.PostAlert` with endpoint, method, status code, and the response error field if present.

Registered on the router for all API routes.

### Backend — `POST /api/errors` handler (new, `internal/handlers/error_reporter_handler.go`)

Accepts:
```json
{
  "source": "mutation | query | crash",
  "url": "/claims/abc-123",
  "error_message": "Failed to upload file to storage (403)",
  "claim_id": "abc-123"
}
```

No authentication required (internal fire-and-forget). Register on the root router `r` directly — NOT inside the authenticated `/api` group, which has `AuthMiddleware` applied to all routes. All incoming string fields are truncated to 200 characters and control characters stripped before reaching the Slack formatter — this prevents both injection and abuse. Posts a formatted Slack alert via `SlackService`. Rate-limited by the service per IP: max 10 requests per IP per minute at the middleware level.


### Infrastructure — `SLACK_BOT_TOKEN` in Lambda

`SLACK_BOT_TOKEN` currently only exists in the GitHub Actions healthcheck job environment. Required additions:
- `variables.tf` — add `slack_bot_token` variable (sensitive, default `""`)
- `main.tf` — add `SLACK_BOT_TOKEN = var.slack_bot_token` to Lambda env vars
- `deploy-backend.yml` — pass `TF_VAR_slack_bot_token=${{ secrets.SLACK_BOT_TOKEN }}`

`SLACK_BOT_TOKEN` already exists as a GitHub Actions secret — no new secret needed.

### Backend — Config and dependency wiring

Add `SlackBotToken string` to the `Config` struct in `config.go`, populated via `os.Getenv("SLACK_BOT_TOKEN")`. If the field is empty at startup, log a warning: `"SLACK_BOT_TOKEN not set — Slack error alerts disabled"`.

`NewRouter` constructs `SlackService` internally from `cfg.SlackBotToken` and passes it to both the error reporter middleware and the `ErrorReporterHandler`. If the token is empty, `SlackService.PostAlert` is a no-op (no crash, no panic).

For async job failures in `cmd/lambda/main.go`: construct a `slack.SlackService` separately in `init()` alongside `auditService`, stored as a package-level var. The Lambda `handler()` function has access to both. This mirrors the existing pattern of how `auditService` is constructed and stored.

### Backend — Async job failures

Two goroutines currently swallow errors:

1. **PDF parse** — `carrier_estimate_handler.go` goroutine does `_ = err`. Wire to `SlackService.PostAlert` with estimate ID and error message.
2. **Estimate generation** — `cmd/lambda/main.go` is the outermost boundary where `auditService.ProcessEstimateJob` errors are dropped after being written to the DB. The Slack alert fires here (not inside `audit_service.go`). The Lambda handler is given a `SlackService` reference directly.

### Frontend — `App.tsx` QueryClient wiring

`queryClient` stays at module scope (outside the `App` function) — moving it inside would recreate the client on every render. Add `MutationCache` and `QueryCache` at construction time:

```ts
import { QueryClient, QueryClientProvider, MutationCache, QueryCache } from '@tanstack/react-query'
import { reportError } from './lib/errorReporter'

const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      reportError({ source: 'mutation', url: window.location.pathname, errorMessage: String(error), claimId: extractClaimId(window.location.pathname) })
    },
  }),
  queryCache: new QueryCache({
    onError: (error, query) => {
      // Only fire on first failure, not retries
      if (query.state.fetchFailureCount !== 1) return
      reportError({ source: 'query', url: window.location.pathname, errorMessage: String(error), claimId: extractClaimId(window.location.pathname) })
    },
  }),
  defaultOptions: { ... }, // existing options unchanged
})
```

`extractClaimId` is a small helper that parses `/claims/:id` from a pathname string.

### Frontend — `ErrorBoundary` crash reporting

`componentDidCatch` calls `reportError` using `window.location.pathname` for both the `url` and claim ID source — same as mutation/query cases.

---

## Slack Alert Format

**Frontend error:**
```
🚨 ClaimCoach — User Blocked
Source: Frontend mutation failed
URL: /claims/abc-123
Claim: abc-123
Error: Failed to upload file to storage (403)
2026-03-12 14:23 UTC
```

**Backend 5xx:**
```
🚨 ClaimCoach — Backend Error
Endpoint: POST /api/claims/abc-123/carrier-estimate/upload-url
Status: 500
Error: failed to generate upload URL: connection refused
2026-03-12 14:23 UTC
```

**Async job failure:**
```
🚨 ClaimCoach — Async Job Failed
Job: PDF parse
Estimate ID: xyz-456
Error: failed to download file from storage: 403
2026-03-12 14:23 UTC
```

---

## What Is NOT Covered

- 4xx errors (bad requests, auth failures) — these are expected and not blocking
- Slow responses / latency — out of scope
- Third-party outages (Anthropic, OpenAI down) — already covered by the existing morning health check

---

## Files Touched

**New:**
- `frontend/src/lib/errorReporter.ts`
- `backend/internal/services/slack_service.go`
- `backend/internal/middleware/error_reporter.go`
- `backend/internal/handlers/error_reporter_handler.go`

**Modified:**
- `frontend/src/App.tsx` — add `MutationCache` + `QueryCache` to QueryClient
- `frontend/src/components/ErrorBoundary.tsx` — wire `componentDidCatch` to reporter
- `backend/internal/handlers/carrier_estimate_handler.go` — wire parse goroutine `_ = err` to Slack
- `backend/cmd/lambda/main.go` — wire `ProcessEstimateJob` failure to Slack
- `backend/cmd/healthcheck/main.go` — replace local `postToSlack` with `services.SlackService`
- `backend/internal/api/router.go` — register error reporter middleware + `POST /api/errors` route
- `backend/internal/config/config.go` — add `SlackBotToken` field
- `backend/deploy/variables.tf` — add `slack_bot_token`
- `backend/deploy/main.tf` — add `SLACK_BOT_TOKEN` to Lambda env
- `.github/workflows/deploy-backend.yml` — pass `TF_VAR_slack_bot_token`
