# Error Observability Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Post Slack alerts to #ops whenever a user is blocked in the ClaimCoach app, covering frontend mutation/query/crash failures, backend 5xx errors, and silent async job failures.

**Architecture:** A minimal `internal/slack` package (no deps beyond `net/http`) provides `SlackService` with in-memory rate limiting. A Gin middleware fires on 5xx responses; a `POST /api/errors` handler receives frontend reports. Three frontend touch points (MutationCache, QueryCache, ErrorBoundary) all call a single `reportError` function.

**Tech Stack:** Go 1.25, Gin, React Query v5, TypeScript, AWS Lambda, Terraform

---

## Chunk 1: Backend — Slack Package + Config

### Task 1: Create `internal/slack` package

**Files:**
- Create: `backend/internal/slack/slack.go`
- Create: `backend/internal/slack/slack_test.go`

- [ ] **Step 1: Write the failing test**

Create `backend/internal/slack/slack_test.go`:

```go
package slack_test

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/claimcoach/backend/internal/slack"
)

func TestPostAlert_SendsToSlack(t *testing.T) {
	received := ""
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		received = r.Header.Get("Authorization")
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"ok":true}`))
	}))
	defer srv.Close()

	svc := slack.NewSlackServiceWithURL("test-token", srv.URL)
	if err := svc.PostAlert("hello"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if received != "Bearer test-token" {
		t.Errorf("expected Bearer test-token, got %q", received)
	}
}

func TestPostAlert_NoopWhenTokenEmpty(t *testing.T) {
	svc := slack.NewSlackService("")
	if err := svc.PostAlert("hello"); err != nil {
		t.Fatalf("expected no-op, got error: %v", err)
	}
}

func TestPostAlert_RateLimits(t *testing.T) {
	calls := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"ok":true}`))
	}))
	defer srv.Close()

	svc := slack.NewSlackServiceWithURL("tok", srv.URL)
	_ = svc.PostAlertWithFingerprint("msg", "fp1")
	_ = svc.PostAlertWithFingerprint("msg2", "fp1") // same fingerprint — should be suppressed
	_ = svc.PostAlertWithFingerprint("msg3", "fp2") // different fingerprint — should fire

	if calls != 2 {
		t.Errorf("expected 2 Slack calls (rate limit suppressed 1), got %d", calls)
	}
}

func TestPostAlert_RateLimitExpires(t *testing.T) {
	calls := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"ok":true}`))
	}))
	defer srv.Close()

	svc := slack.NewSlackServiceWithURLAndWindow("tok", srv.URL, 50*time.Millisecond)
	_ = svc.PostAlertWithFingerprint("msg", "fp1")
	time.Sleep(100 * time.Millisecond)
	_ = svc.PostAlertWithFingerprint("msg2", "fp1") // window expired — should fire

	if calls != 2 {
		t.Errorf("expected 2 calls after window expiry, got %d", calls)
	}
}
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd backend && go test ./internal/slack/... -v
```
Expected: `cannot find package`

- [ ] **Step 3: Implement `internal/slack/slack.go`**

Create `backend/internal/slack/slack.go`:

```go
package slack

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"
)

const (
	defaultSlackURL    = "https://slack.com/api/chat.postMessage"
	defaultRateWindow  = 5 * time.Minute
	alertChannel       = "#ops"
)

// SlackService posts alerts to Slack with in-memory rate limiting.
type SlackService struct {
	token      string
	apiURL     string
	rateWindow time.Duration

	mu          sync.Mutex
	lastFired   map[string]time.Time
}

// NewSlackService creates a SlackService using the real Slack API.
// If token is empty, PostAlert is a no-op.
func NewSlackService(token string) *SlackService {
	return newService(token, defaultSlackURL, defaultRateWindow)
}

// NewSlackServiceWithURL creates a SlackService with a custom API URL (for testing).
func NewSlackServiceWithURL(token, apiURL string) *SlackService {
	return newService(token, apiURL, defaultRateWindow)
}

// NewSlackServiceWithURLAndWindow creates a SlackService with custom URL and rate window (for testing).
func NewSlackServiceWithURLAndWindow(token, apiURL string, window time.Duration) *SlackService {
	return newService(token, apiURL, window)
}

func newService(token, apiURL string, window time.Duration) *SlackService {
	return &SlackService{
		token:      token,
		apiURL:     apiURL,
		rateWindow: window,
		lastFired:  make(map[string]time.Time),
	}
}

// PostAlert posts a message using the full message text as its own fingerprint.
func (s *SlackService) PostAlert(message string) error {
	fp := message
	if len(fp) > 80 {
		fp = fp[:80]
	}
	return s.PostAlertWithFingerprint(message, fp)
}

// PostAlertWithFingerprint posts a message, rate-limited by fingerprint.
// Same fingerprint within the rate window is silently suppressed.
func (s *SlackService) PostAlertWithFingerprint(message, fingerprint string) error {
	if s.token == "" {
		return nil // no-op
	}

	s.mu.Lock()
	last, seen := s.lastFired[fingerprint]
	if seen && time.Since(last) < s.rateWindow {
		s.mu.Unlock()
		return nil // rate limited
	}
	s.lastFired[fingerprint] = time.Now()
	s.mu.Unlock()

	return s.post(message)
}

func (s *SlackService) post(text string) error {
	payload, _ := json.Marshal(map[string]string{
		"channel": alertChannel,
		"text":    text,
	})
	req, err := http.NewRequest(http.MethodPost, s.apiURL, bytes.NewReader(payload))
	if err != nil {
		return fmt.Errorf("slack: build request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+s.token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Printf("slack: post failed: %v", err)
		return err
	}
	defer resp.Body.Close()

	var result struct {
		OK    bool   `json:"ok"`
		Error string `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return fmt.Errorf("slack: decode response: %w", err)
	}
	if !result.OK {
		return fmt.Errorf("slack API error: %s", result.Error)
	}
	return nil
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd backend && go test ./internal/slack/... -v
```
Expected: all 4 tests PASS

- [ ] **Step 5: Commit**

```bash
cd backend && git add internal/slack/
git commit -m "feat: add internal slack package with rate limiting"
```

---

### Task 2: Add `SlackBotToken` to Config

**Files:**
- Modify: `backend/internal/config/config.go`

- [ ] **Step 1: Add `SlackBotToken` field to `Config` struct**

In `config.go`, add to the `Config` struct after `ClaimCoachEmail`:

```go
// Slack alerting (optional — alerts silently skipped if not set)
SlackBotToken string
```

- [ ] **Step 2: Populate it in `Load()`**

In `Load()`, add after the `ClaimCoachEmail` line:

```go
SlackBotToken: os.Getenv("SLACK_BOT_TOKEN"),
```

- [ ] **Step 3: Add startup warning**

After the `OpenAIAPIKey` warning block in `Load()`, add:

```go
if cfg.SlackBotToken == "" {
    log.Println("⚠️  SLACK_BOT_TOKEN not set — Slack error alerts disabled")
}
```

- [ ] **Step 4: Verify build passes**

```bash
cd backend && go build ./...
```
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add backend/internal/config/config.go
git commit -m "feat: add SlackBotToken to config"
```

---

### Task 3: Update healthcheck to use shared Slack package

**Files:**
- Modify: `backend/cmd/healthcheck/main.go`

- [ ] **Step 1: Replace the local `postToSlack` function**

In `backend/cmd/healthcheck/main.go`:

1. Add import: `"github.com/claimcoach/backend/internal/slack"`
2. In `main()`, replace the call `postToSlack(slackToken, "#ops", msg)` with:
   ```go
   svc := slack.NewSlackService(slackToken)
   if err := svc.PostAlert(msg); err != nil {
       fmt.Fprintf(os.Stderr, "failed to post to Slack: %v\n", err)
       os.Exit(1)
   }
   ```
3. Delete the entire `postToSlack` function at the bottom of the file.

- [ ] **Step 2: Build the healthcheck binary to confirm it compiles**

```bash
cd backend && go build ./cmd/healthcheck/
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add backend/cmd/healthcheck/main.go
git commit -m "refactor: use shared slack package in healthcheck"
```

---

## Chunk 2: Backend — Middleware, Handler, Router

### Task 4: Create error reporter middleware (5xx → Slack)

**Files:**
- Create: `backend/internal/middleware/error_reporter.go`
- Create: `backend/internal/middleware/error_reporter_test.go`

- [ ] **Step 1: Write the failing test**

Create `backend/internal/middleware/error_reporter_test.go`:

```go
package middleware_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/claimcoach/backend/internal/middleware"
	"github.com/claimcoach/backend/internal/slack"
)

func TestErrorReporterMiddleware_FiresOn5xx(t *testing.T) {
	alerts := []string{}
	mockSvc := &mockSlack{fn: func(msg, fp string) error {
		alerts = append(alerts, msg)
		return nil
	}}

	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(middleware.ErrorReporter(mockSvc))
	r.GET("/test", func(c *gin.Context) {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "db exploded"})
	})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/test", nil)
	r.ServeHTTP(w, req)

	if len(alerts) != 1 {
		t.Fatalf("expected 1 alert, got %d", len(alerts))
	}
}

func TestErrorReporterMiddleware_SilentOn4xx(t *testing.T) {
	alerts := []string{}
	mockSvc := &mockSlack{fn: func(msg, fp string) error {
		alerts = append(alerts, msg)
		return nil
	}}

	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(middleware.ErrorReporter(mockSvc))
	r.GET("/test", func(c *gin.Context) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
	})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/test", nil)
	r.ServeHTTP(w, req)

	if len(alerts) != 0 {
		t.Fatalf("expected no alerts for 4xx, got %d", len(alerts))
	}
}

// AlertPoster is the interface the middleware depends on.
type mockSlack struct {
	fn func(msg, fingerprint string) error
}

func (m *mockSlack) PostAlertWithFingerprint(msg, fp string) error {
	return m.fn(msg, fp)
}
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd backend && go test ./internal/middleware/... -v
```
Expected: `cannot find package`

- [ ] **Step 3: Implement the middleware**

Create `backend/internal/middleware/error_reporter.go`:

```go
package middleware

import (
	"fmt"
	"time"

	"github.com/gin-gonic/gin"
)

// AlertPoster is implemented by slack.SlackService.
type AlertPoster interface {
	PostAlertWithFingerprint(message, fingerprint string) error
}

// ErrorReporter is a Gin middleware that posts a Slack alert when any handler
// returns a 5xx status code.
func ErrorReporter(svc AlertPoster) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Next()

		status := c.Writer.Status()
		if status < 500 {
			return
		}

		errMsg := ""
		if len(c.Errors) > 0 {
			errMsg = c.Errors.Last().Error()
		}

		fingerprint := fmt.Sprintf("%s %s %d", c.Request.Method, c.FullPath(), status)
		msg := fmt.Sprintf(
			"🚨 *ClaimCoach — Backend Error*\nEndpoint: %s %s\nStatus: %d\nError: %s\n_%s UTC_",
			c.Request.Method,
			c.Request.URL.Path,
			status,
			errMsg,
			time.Now().UTC().Format("2006-01-02 15:04"),
		)

		_ = svc.PostAlertWithFingerprint(msg, fingerprint)
	}
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd backend && go test ./internal/middleware/... -v
```
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/internal/middleware/
git commit -m "feat: add error reporter middleware for 5xx Slack alerts"
```

---

### Task 5: Create `POST /api/errors` handler

**Files:**
- Create: `backend/internal/handlers/error_reporter_handler.go`
- Create: `backend/internal/handlers/error_reporter_handler_test.go`

- [ ] **Step 1: Write the failing test**

Create `backend/internal/handlers/error_reporter_handler_test.go`:

```go
package handlers_test

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/claimcoach/backend/internal/handlers"
)

type captureSlack struct {
	messages []string
}

func (c *captureSlack) PostAlertWithFingerprint(msg, fp string) error {
	c.messages = append(c.messages, msg)
	return nil
}

func TestErrorReporterHandler_PostsAlert(t *testing.T) {
	gin.SetMode(gin.TestMode)
	svc := &captureSlack{}
	h := handlers.NewErrorReporterHandler(svc)

	r := gin.New()
	r.POST("/api/errors", h.Report)

	body := `{"source":"mutation","url":"/claims/abc","error_message":"upload failed","claim_id":"abc"}`
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/errors", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusNoContent {
		t.Errorf("expected 204, got %d", w.Code)
	}
	if len(svc.messages) != 1 {
		t.Fatalf("expected 1 alert, got %d", len(svc.messages))
	}
}

func TestErrorReporterHandler_SanitizesLongFields(t *testing.T) {
	gin.SetMode(gin.TestMode)
	svc := &captureSlack{}
	h := handlers.NewErrorReporterHandler(svc)

	r := gin.New()
	r.POST("/api/errors", h.Report)

	longMsg := string(make([]byte, 500)) // 500 zero bytes
	body := `{"source":"mutation","url":"/claims/abc","error_message":"` + longMsg + `","claim_id":"abc"}`
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/errors", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	// Should not panic; should return 204
	if w.Code != http.StatusNoContent {
		t.Errorf("expected 204, got %d", w.Code)
	}
}

func TestErrorReporterHandler_IgnoresEmptyBody(t *testing.T) {
	gin.SetMode(gin.TestMode)
	svc := &captureSlack{}
	h := handlers.NewErrorReporterHandler(svc)

	r := gin.New()
	r.POST("/api/errors", h.Report)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/errors", bytes.NewBufferString(`{}`))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusNoContent {
		t.Errorf("expected 204, got %d", w.Code)
	}
	if len(svc.messages) != 0 {
		t.Errorf("expected no alert for empty body, got %d", len(svc.messages))
	}
}

func TestErrorReporterHandler_IPRateLimit(t *testing.T) {
	gin.SetMode(gin.TestMode)
	svc := &captureSlack{}
	h := handlers.NewErrorReporterHandler(svc)

	r := gin.New()
	r.POST("/api/errors", h.Report)

	body := `{"source":"mutation","url":"/claims/abc","error_message":"err","claim_id":"abc"}`

	// Send 11 requests from same IP — 11th should be 429
	var lastCode int
	for i := 0; i < 11; i++ {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("POST", "/api/errors", bytes.NewBufferString(body))
		req.Header.Set("Content-Type", "application/json")
		req.RemoteAddr = "1.2.3.4:9999"
		r.ServeHTTP(w, req)
		lastCode = w.Code
	}
	if lastCode != http.StatusTooManyRequests {
		t.Errorf("expected 429 on 11th request, got %d", lastCode)
	}
}
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd backend && go test ./internal/handlers/... -run TestErrorReporter -v
```
Expected: compile error — `handlers.NewErrorReporterHandler` not found

- [ ] **Step 3: Implement the handler**

Create `backend/internal/handlers/error_reporter_handler.go`:

```go
package handlers

import (
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"
	"unicode"

	"github.com/gin-gonic/gin"
)

// ErrorAlertPoster is implemented by slack.SlackService.
type ErrorAlertPoster interface {
	PostAlertWithFingerprint(message, fingerprint string) error
}

type ErrorReporterHandler struct {
	slack   ErrorAlertPoster
	ipMu    sync.Mutex
	ipHits  map[string][]time.Time
}

func NewErrorReporterHandler(svc ErrorAlertPoster) *ErrorReporterHandler {
	return &ErrorReporterHandler{slack: svc, ipHits: make(map[string][]time.Time)}
}

// allowIP returns true if the IP is under the rate limit (10 req/min).
func (h *ErrorReporterHandler) allowIP(ip string) bool {
	now := time.Now()
	window := time.Minute
	h.ipMu.Lock()
	defer h.ipMu.Unlock()
	hits := h.ipHits[ip]
	cutoff := now.Add(-window)
	valid := hits[:0]
	for _, t := range hits {
		if t.After(cutoff) {
			valid = append(valid, t)
		}
	}
	if len(valid) >= 10 {
		h.ipHits[ip] = valid
		return false
	}
	h.ipHits[ip] = append(valid, now)
	return true
}

type errorReportInput struct {
	Source       string `json:"source"`
	URL          string `json:"url"`
	ErrorMessage string `json:"error_message"`
	ClaimID      string `json:"claim_id"`
}

var controlCharsRe = regexp.MustCompile(`[\x00-\x1F\x7F]`)

func sanitize(s string) string {
	s = controlCharsRe.ReplaceAllString(s, "")
	s = strings.Map(func(r rune) rune {
		if unicode.IsPrint(r) {
			return r
		}
		return -1
	}, s)
	if len(s) > 200 {
		s = s[:200]
	}
	return s
}

// Report accepts a frontend error report and posts a Slack alert.
// POST /api/errors — unauthenticated, IP rate-limited (10 req/min).
func (h *ErrorReporterHandler) Report(c *gin.Context) {
	if !h.allowIP(c.ClientIP()) {
		c.Status(http.StatusTooManyRequests)
		return
	}

	var input errorReportInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.Status(http.StatusNoContent)
		return
	}

	source := sanitize(input.Source)
	url := sanitize(input.URL)
	errMsg := sanitize(input.ErrorMessage)
	claimID := sanitize(input.ClaimID)

	// Skip if no meaningful data
	if source == "" && errMsg == "" {
		c.Status(http.StatusNoContent)
		return
	}

	fingerprint := fmt.Sprintf("%s|%s", source, errMsg[:min(len(errMsg), 80)])
	msg := fmt.Sprintf(
		"🚨 *ClaimCoach — User Blocked*\nSource: Frontend %s failed\nURL: %s\nClaim: %s\nError: %s\n_%s UTC_",
		source,
		url,
		claimID,
		errMsg,
		time.Now().UTC().Format("2006-01-02 15:04"),
	)

	_ = h.slack.PostAlertWithFingerprint(msg, fingerprint)
	c.Status(http.StatusNoContent)
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd backend && go test ./internal/handlers/... -run TestErrorReporter -v
```
Expected: all 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/internal/handlers/error_reporter_handler.go \
        backend/internal/handlers/error_reporter_handler_test.go
git commit -m "feat: add POST /api/errors handler for frontend error reports"
```

---

### Task 6: Wire middleware and handler into router

**Files:**
- Modify: `backend/internal/api/router.go`

- [ ] **Step 1: Update `NewRouter` to construct and register the Slack-backed middleware and handler**

In `backend/internal/api/router.go`:

1. Add imports:
   ```go
   "github.com/claimcoach/backend/internal/middleware"
   "github.com/claimcoach/backend/internal/slack"
   ```

2. After CORS setup and before the Supabase client construction, add:
   ```go
   // Slack error alerting (no-op if token not set)
   slackSvc := slack.NewSlackService(cfg.SlackBotToken)
   r.Use(middleware.ErrorReporter(slackSvc))
   ```

3. After the public `/health` route, add the unauthenticated error reporter route:
   ```go
   errorReporterHandler := handlers.NewErrorReporterHandler(slackSvc)
   r.POST("/api/errors", errorReporterHandler.Report)
   ```

- [ ] **Step 2: Build to confirm it compiles**

```bash
cd backend && go build ./...
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add backend/internal/api/router.go
git commit -m "feat: register error reporter middleware and POST /api/errors route"
```

---

## Chunk 3: Backend — Async Job Failures

### Task 7: Wire PDF parse goroutine to Slack

**Files:**
- Modify: `backend/internal/handlers/carrier_estimate_handler.go`

- [ ] **Step 1: Add `SlackService` to `CarrierEstimateHandler`**

In `backend/internal/handlers/carrier_estimate_handler.go`:

1. Add a `slack ErrorAlertPoster` field to the `CarrierEstimateHandler` struct:
   ```go
   type CarrierEstimateHandler struct {
       service       *services.CarrierEstimateService
       parserService *services.PDFParserService
       slack         ErrorAlertPoster
   }
   ```

2. Update `NewCarrierEstimateHandler` signature to accept the Slack service:
   ```go
   func NewCarrierEstimateHandler(service *services.CarrierEstimateService, parserService *services.PDFParserService, slackSvc ErrorAlertPoster) *CarrierEstimateHandler {
       return &CarrierEstimateHandler{
           service:       service,
           parserService: parserService,
           slack:         slackSvc,
       }
   }
   ```

3. Replace `_ = err` in the parse goroutine with:
   ```go
   if err != nil {
       msg := fmt.Sprintf(
           "🚨 *ClaimCoach — Async Job Failed*\nJob: PDF parse\nEstimate ID: %s\nError: %s\n_%s UTC_",
           estimateID,
           err.Error(),
           time.Now().UTC().Format("2006-01-02 15:04"),
       )
       _ = h.slack.PostAlertWithFingerprint(msg, "pdf-parse|"+estimateID)
   }
   ```

4. Add required imports: `"fmt"`, `"time"` (if not already present).

- [ ] **Step 2: Update router.go to pass `slackSvc` to `NewCarrierEstimateHandler`**

In `router.go`, find:
```go
carrierEstimateHandler := handlers.NewCarrierEstimateHandler(carrierEstimateService, pdfParserService)
```
Replace with:
```go
carrierEstimateHandler := handlers.NewCarrierEstimateHandler(carrierEstimateService, pdfParserService, slackSvc)
```

- [ ] **Step 3: Build to confirm it compiles**

```bash
cd backend && go build ./...
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add backend/internal/handlers/carrier_estimate_handler.go \
        backend/internal/api/router.go
git commit -m "feat: alert Slack when async PDF parse job fails"
```

---

### Task 8: Wire estimate generation failure to Slack

**Files:**
- Modify: `backend/cmd/lambda/main.go`

- [ ] **Step 1: Add `slackSvc` package-level var to `lambda/main.go`**

In `backend/cmd/lambda/main.go`:

1. Add import: `"github.com/claimcoach/backend/internal/slack"`

2. Add package-level var alongside `auditService`:
   ```go
   var slackSvc *slack.SlackService
   ```

3. In `init()`, after `auditService = svc`, add:
   ```go
   slackSvc = slack.NewSlackService(cfg.SlackBotToken)
   ```

4. Replace the silent drop in `handler()`:
   ```go
   if err := auditService.ProcessEstimateJob(ctx, job.AuditReportID, job.ClaimID, job.UserID, job.OrgID); err != nil {
       log.Printf("ProcessEstimateJob failed: %v", err)
       msg := fmt.Sprintf(
           "🚨 *ClaimCoach — Async Job Failed*\nJob: Estimate generation\nAudit Report ID: %s\nClaim: %s\nError: %s\n_%s UTC_",
           job.AuditReportID,
           job.ClaimID,
           err.Error(),
           time.Now().UTC().Format("2006-01-02 15:04"),
       )
       _ = slackSvc.PostAlertWithFingerprint(msg, "estimate-gen|"+job.AuditReportID)
   }
   ```

5. Add imports `"fmt"`, `"time"` if not already present.

- [ ] **Step 2: Build the Lambda binary to confirm it compiles**

```bash
cd backend && go build ./cmd/lambda/
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add backend/cmd/lambda/main.go
git commit -m "feat: alert Slack when async estimate generation job fails"
```

---

## Chunk 4: Infrastructure

### Task 9: Add `SLACK_BOT_TOKEN` to Terraform and deploy workflow

**Files:**
- Modify: `backend/deploy/variables.tf`
- Modify: `backend/deploy/main.tf`
- Modify: `.github/workflows/deploy-backend.yml`

- [ ] **Step 1: Add variable to `variables.tf`**

In `backend/deploy/variables.tf`, add after the `sendgrid_from_name` block:

```hcl
variable "slack_bot_token" {
  description = "Slack bot token for error alerting (optional — alerts disabled if not set)"
  type        = string
  sensitive   = true
  default     = ""
}
```

- [ ] **Step 2: Add to Lambda env in `main.tf`**

In `backend/deploy/main.tf`, inside the `environment { variables = { ... } }` block, add:

```hcl
SLACK_BOT_TOKEN = var.slack_bot_token
```

- [ ] **Step 3: Pass the secret in the deploy workflow**

In `.github/workflows/deploy-backend.yml`, inside the `Terraform Apply` step's `env:` block, add:

```yaml
TF_VAR_slack_bot_token: ${{ secrets.SLACK_BOT_TOKEN }}
```

- [ ] **Step 4: Build to confirm Terraform config is valid**

```bash
cd backend/deploy && terraform validate
```
Expected: `Success! The configuration is valid.`

- [ ] **Step 5: Commit**

```bash
git add backend/deploy/variables.tf backend/deploy/main.tf .github/workflows/deploy-backend.yml
git commit -m "feat: add SLACK_BOT_TOKEN to Lambda environment via Terraform"
```

---

## Chunk 5: Frontend

### Task 10: Create `errorReporter.ts`

**Files:**
- Create: `frontend/src/lib/errorReporter.ts`

- [ ] **Step 1: Create the reporter**

Create `frontend/src/lib/errorReporter.ts`:

```typescript
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
      body: JSON.stringify(report),
    }).catch(() => {
      // Intentionally ignored — error reporting must never throw
    })
  } catch {
    // Intentionally ignored
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/errorReporter.ts
git commit -m "feat: add frontend errorReporter utility"
```

---

### Task 11: Wire React Query global error handlers in `App.tsx`

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Update `App.tsx` imports and QueryClient**

In `frontend/src/App.tsx`:

1. Update the React Query import to add `MutationCache` and `QueryCache`:
   ```typescript
   import { QueryClient, QueryClientProvider, MutationCache, QueryCache } from '@tanstack/react-query'
   ```

2. Add the error reporter import at the top:
   ```typescript
   import { reportError, extractClaimId } from './lib/errorReporter'
   ```

3. Replace the existing `const queryClient = new QueryClient({...})` with:
   ```typescript
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
         // Only fire on first failure — backend rate limiter absorbs any duplicates
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
   ```

   Note: `queryClient` stays at module scope (outside the `App` function). Do not move it inside.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat: wire React Query global error handlers to Slack reporter"
```

---

### Task 12: Wire ErrorBoundary to reporter

**Files:**
- Modify: `frontend/src/components/ErrorBoundary.tsx`

- [ ] **Step 1: Update `componentDidCatch`**

In `frontend/src/components/ErrorBoundary.tsx`:

1. Add import:
   ```typescript
   import { reportError, extractClaimId } from '../lib/errorReporter'
   ```

2. Replace the `componentDidCatch` body:
   ```typescript
   componentDidCatch(error: Error, errorInfo: ErrorInfo) {
     console.error('ErrorBoundary caught:', error, errorInfo)
     reportError({
       source: 'crash',
       url: window.location.pathname,
       errorMessage: error.message,
       claimId: extractClaimId(window.location.pathname),
     })
   }
   ```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ErrorBoundary.tsx
git commit -m "feat: report React crashes to Slack via ErrorBoundary"
```

---

## Final Verification

- [ ] **Run all backend tests**

```bash
cd backend && go test ./... -v 2>&1 | tail -30
```
Expected: all existing tests pass, new tests pass

- [ ] **Run backend build**

```bash
cd backend && GOOS=linux GOARCH=arm64 CGO_ENABLED=0 go build -tags lambda.norpc -o /tmp/bootstrap-test ./cmd/lambda/
```
Expected: binary produced with no errors

- [ ] **Run frontend type check**

```bash
cd frontend && npx tsc --noEmit
```
Expected: no errors

- [ ] **Final commit if any loose files**

```bash
git status
```
If clean: done. If there are unstaged changes, commit them.
