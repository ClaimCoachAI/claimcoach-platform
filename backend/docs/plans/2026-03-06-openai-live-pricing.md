# OpenAI Live Pricing Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a two-step estimate pipeline where OpenAI `gpt-4o-mini-search-preview` fetches live regional repair pricing, then Claude Sonnet formats the final JSON estimate using that real data instead of hallucinated training-data prices.

**Architecture:** `GenerateIndustryEstimate` first calls `fetchLivePricing()` via a new OpenAI client (plain HTTP, same pattern as the existing Perplexity client). The resulting pricing context is injected into `buildEstimatePrompt()` before handing off to Claude Sonnet. If the OpenAI call fails for any reason, the function falls back silently to the existing Claude-only behavior.

**Tech Stack:** Go stdlib `net/http` (no SDK — mirrors Perplexity client pattern), OpenAI `/v1/chat/completions` endpoint, `gpt-4o-mini-search-preview` model (web search built-in), Claude Sonnet for formatting step.

---

### Task 1: Add OpenAI config fields

**Files:**
- Modify: `backend/internal/config/config.go`

**Step 1: Add fields to the Config struct**

In the `Config` struct (after the Anthropic block, around line 27), add:

```go
// OpenAI API (for live pricing web search)
OpenAIAPIKey     string
OpenAIModel      string
OpenAITimeout    int // seconds
```

**Step 2: Load values in the Load() function**

In the `cfg := &Config{...}` block (after the AnthropicModel line ~54), add:

```go
OpenAIAPIKey:  os.Getenv("OPENAI_API_KEY"),
OpenAIModel:   getEnvOrDefault("OPENAI_MODEL", "gpt-4o-mini-search-preview"),
OpenAITimeout: getEnvIntOrDefault("OPENAI_TIMEOUT", 30),
```

**Step 3: Add optional warning log**

After the existing `AnthropicAPIKey` warning block (~line 78), add:

```go
if cfg.OpenAIAPIKey == "" {
    log.Println("⚠️  OPENAI_API_KEY not set - live pricing search will be unavailable (estimates will use training data)")
}
```

**Step 4: Build and verify**

```bash
cd "/Users/benjaminlopez/Documents/ClaimCoachAI Code/backend" && go build ./...
```
Expected: no errors.

**Step 5: Commit**

```bash
git add backend/internal/config/config.go
git commit -m "feat: add OpenAI config fields for live pricing search"
```

---

### Task 2: Create the OpenAI client

**Files:**
- Create: `backend/internal/llm/openai_client.go`

**Step 1: Write the failing test**

Create `backend/internal/llm/openai_client_test.go`:

```go
package llm

import (
    "context"
    "encoding/json"
    "net/http"
    "net/http/httptest"
    "testing"

    "github.com/stretchr/testify/assert"
    "github.com/stretchr/testify/require"
)

func TestOpenAIClient_Chat_Success(t *testing.T) {
    server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        assert.Equal(t, "Bearer test-key", r.Header.Get("Authorization"))
        assert.Equal(t, "application/json", r.Header.Get("Content-Type"))

        resp := ChatResponse{
            ID:    "test-id",
            Model: "gpt-4o-mini-search-preview",
            Choices: []struct {
                Index   int `json:"index"`
                Message struct {
                    Role    string `json:"role"`
                    Content string `json:"content"`
                } `json:"message"`
            }{
                {Index: 0, Message: struct {
                    Role    string `json:"role"`
                    Content string `json:"content"`
                }{Role: "assistant", Content: "Shingles: $5/sqft in Dallas TX"}},
            },
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(resp)
    }))
    defer server.Close()

    client := newOpenAIClientWithURL("test-key", "gpt-4o-mini-search-preview", 10, server.URL)
    resp, err := client.Chat(context.Background(), []Message{
        {Role: "user", Content: "pricing query"},
    }, 0.3, 500)

    require.NoError(t, err)
    require.Len(t, resp.Choices, 1)
    assert.Equal(t, "Shingles: $5/sqft in Dallas TX", resp.Choices[0].Message.Content)
}

func TestOpenAIClient_Chat_ServerError_ReturnsError(t *testing.T) {
    server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.WriteHeader(http.StatusInternalServerError)
        w.Write([]byte(`{"error": "server error"}`))
    }))
    defer server.Close()

    client := newOpenAIClientWithURL("test-key", "gpt-4o-mini-search-preview", 10, server.URL)
    _, err := client.Chat(context.Background(), []Message{
        {Role: "user", Content: "query"},
    }, 0.3, 500)

    require.Error(t, err)
}
```

**Step 2: Run test to verify it fails**

```bash
cd "/Users/benjaminlopez/Documents/ClaimCoachAI Code/backend" && go test ./internal/llm/ -run TestOpenAIClient -v
```
Expected: compile error — `OpenAIClient` and `newOpenAIClientWithURL` undefined.

**Step 3: Create `openai_client.go`**

```go
package llm

import (
    "bytes"
    "context"
    "encoding/json"
    "fmt"
    "io"
    "net/http"
    "time"
)

// OpenAIClient provides access to the OpenAI chat completions API.
// Uses gpt-4o-mini-search-preview which has web search built in.
type OpenAIClient struct {
    apiKey     string
    model      string
    timeout    time.Duration
    httpClient *http.Client
    baseURL    string
}

// NewOpenAIClient creates a new OpenAI API client.
func NewOpenAIClient(apiKey, model string, timeoutSeconds int) *OpenAIClient {
    return newOpenAIClientWithURL(apiKey, model, timeoutSeconds, "https://api.openai.com/v1/chat/completions")
}

func newOpenAIClientWithURL(apiKey, model string, timeoutSeconds int, baseURL string) *OpenAIClient {
    d := time.Duration(timeoutSeconds) * time.Second
    return &OpenAIClient{
        apiKey:     apiKey,
        model:      model,
        timeout:    d,
        httpClient: &http.Client{Timeout: d},
        baseURL:    baseURL,
    }
}

// Chat sends a chat completion request to the OpenAI API.
func (c *OpenAIClient) Chat(ctx context.Context, messages []Message, temperature float64, maxTokens int) (*ChatResponse, error) {
    if len(messages) == 0 {
        return nil, fmt.Errorf("messages cannot be empty")
    }

    request := ChatRequest{
        Model:       c.model,
        Messages:    messages,
        Temperature: temperature,
        MaxTokens:   maxTokens,
    }

    body, err := json.Marshal(request)
    if err != nil {
        return nil, fmt.Errorf("failed to marshal request: %w", err)
    }

    req, err := http.NewRequestWithContext(ctx, "POST", c.baseURL, bytes.NewBuffer(body))
    if err != nil {
        return nil, fmt.Errorf("failed to create request: %w", err)
    }

    req.Header.Set("Authorization", "Bearer "+c.apiKey)
    req.Header.Set("Content-Type", "application/json")

    resp, err := c.httpClient.Do(req)
    if err != nil {
        return nil, fmt.Errorf("failed to make request: %w", err)
    }
    defer resp.Body.Close()

    if resp.StatusCode != http.StatusOK {
        bodyBytes, _ := io.ReadAll(resp.Body)
        return nil, fmt.Errorf("OpenAI API returned status %d: %s", resp.StatusCode, string(bodyBytes))
    }

    var chatResponse ChatResponse
    if err := json.NewDecoder(resp.Body).Decode(&chatResponse); err != nil {
        return nil, fmt.Errorf("failed to decode response: %w", err)
    }

    return &chatResponse, nil
}
```

**Step 4: Run tests to verify they pass**

```bash
cd "/Users/benjaminlopez/Documents/ClaimCoachAI Code/backend" && go test ./internal/llm/ -run TestOpenAIClient -v
```
Expected: PASS both tests.

**Step 5: Commit**

```bash
git add backend/internal/llm/openai_client.go backend/internal/llm/openai_client_test.go
git commit -m "feat: add OpenAI client for live pricing web search"
```

---

### Task 3: Add searchClient to AuditService and wire fetchLivePricing

**Files:**
- Modify: `backend/internal/services/audit_service.go`

**Step 1: Write the failing test**

Add to `backend/internal/services/audit_service_test.go` (find existing test file and append):

```go
func TestFetchLivePricing_ReturnsContext(t *testing.T) {
    mockClient := &mockLLMClient{
        response: &llm.ChatResponse{
            Choices: []struct {
                Index   int `json:"index"`
                Message struct {
                    Role    string `json:"role"`
                    Content string `json:"content"`
                } `json:"message"`
            }{
                {Message: struct {
                    Role    string `json:"role"`
                    Content string `json:"content"`
                }{Content: "Shingle replacement in Dallas TX: $4.50-$6.00/sqft"}},
            },
        },
    }

    svc := &AuditService{
        db:           nil,
        llmClient:    mockClient,
        searchClient: mockClient,
        scopeService: nil,
    }

    ctx := context.Background()
    result := svc.fetchLivePricing(ctx, []string{"Shingles_Damaged", "Gutters_Damaged"}, "123 Main St, Dallas TX")
    assert.Contains(t, result, "Dallas")
}

func TestFetchLivePricing_FailsGracefully(t *testing.T) {
    mockClient := &mockLLMClient{err: fmt.Errorf("network error")}

    svc := &AuditService{
        searchClient: mockClient,
    }

    ctx := context.Background()
    result := svc.fetchLivePricing(ctx, []string{"Shingles_Damaged"}, "123 Main St, Dallas TX")
    assert.Equal(t, "", result) // returns empty string, no panic
}
```

**Step 2: Run test to verify it fails**

```bash
cd "/Users/benjaminlopez/Documents/ClaimCoachAI Code/backend" && go test ./internal/services/ -run TestFetchLivePricing -v
```
Expected: compile error — `searchClient` field and `fetchLivePricing` undefined.

**Step 3: Add searchClient field and fetchLivePricing to audit_service.go**

Add `searchClient LLMClient` to the `AuditService` struct (line ~24):

```go
type AuditService struct {
    db           *sql.DB
    llmClient    LLMClient
    searchClient LLMClient // OpenAI client for live pricing — nil means fallback to training data
    scopeService *ScopeSheetService
}
```

Update `NewAuditService` signature (line ~30):

```go
func NewAuditService(db *sql.DB, llmClient LLMClient, searchClient LLMClient, scopeService *ScopeSheetService) *AuditService {
    return &AuditService{
        db:           db,
        llmClient:    llmClient,
        searchClient: searchClient,
        scopeService: scopeService,
    }
}
```

Add the `fetchLivePricing` function after `buildEstimatePrompt` (around line 160):

```go
// fetchLivePricing queries OpenAI with web search for current regional repair pricing.
// Returns an empty string if searchClient is nil or the call fails — callers treat "" as "use training data".
func (s *AuditService) fetchLivePricing(ctx context.Context, damageTags []string, propertyAddress string) string {
    if s.searchClient == nil {
        return ""
    }

    query := fmt.Sprintf(
        "What are current %d contractor repair prices for the following damage types: %s — at a property located at %s? "+
            "Include cost per square foot or linear foot for materials and labor. Cite sources if available.",
        time.Now().Year(),
        strings.Join(damageTags, ", "),
        propertyAddress,
    )

    messages := []llm.Message{
        {Role: "user", Content: query},
    }

    resp, err := s.searchClient.Chat(ctx, messages, 0.3, 800)
    if err != nil {
        log.Printf("fetchLivePricing: OpenAI search failed, falling back to training data: %v", err)
        return ""
    }
    if len(resp.Choices) == 0 {
        return ""
    }

    return resp.Choices[0].Message.Content
}
```

**Step 4: Update GenerateIndustryEstimate to fetch address and call fetchLivePricing**

Replace the function body of `GenerateIndustryEstimate` (lines ~39-99). The key additions are fetching the property address and calling `fetchLivePricing`:

```go
func (s *AuditService) GenerateIndustryEstimate(ctx context.Context, claimID, userID, orgID string) (string, error) {
    // 1. Get the scope sheet for this claim
    scopeSheet, err := s.scopeService.GetScopeSheetByClaimID(ctx, claimID)
    if err != nil {
        return "", fmt.Errorf("failed to get scope sheet: %w", err)
    }
    if scopeSheet == nil {
        return "", fmt.Errorf("scope sheet not found for claim %s", claimID)
    }

    // 2. Fetch property address for regional pricing query
    var propertyAddress string
    err = s.db.QueryRowContext(ctx, `
        SELECT p.legal_address
        FROM claims c
        INNER JOIN properties p ON c.property_id = p.id
        WHERE c.id = $1
    `, claimID).Scan(&propertyAddress)
    if err != nil {
        log.Printf("GenerateIndustryEstimate: could not fetch property address: %v", err)
        // non-fatal — pricing search will use empty address
    }

    // 3. Collect all damage tags across areas for the pricing query
    var allTags []string
    seen := map[string]bool{}
    for _, area := range scopeSheet.Areas {
        for _, tag := range area.Tags {
            if !seen[tag] {
                allTags = append(allTags, tag)
                seen[tag] = true
            }
        }
    }

    // 4. Fetch live pricing (best-effort — empty string means fall back to training data)
    pricingContext := s.fetchLivePricing(ctx, allTags, propertyAddress)

    // 5. Build the prompt
    userPrompt := s.buildEstimatePrompt(scopeSheet, pricingContext)

    // 6. Prepare messages for the LLM
    messages := []llm.Message{
        {
            Role: "system",
            Content: `You are an expert construction estimator specializing in insurance claims.
Your task is to produce accurate, industry-standard repair estimates.
Always respond with valid JSON only, no additional text or explanations.`,
        },
        {
            Role:    "user",
            Content: userPrompt,
        },
    }

    // 7. Call the LLM API — use high token limit since estimate JSON can be large
    response, err := s.llmClient.Chat(ctx, messages, 0.2, 8000)
    if err != nil {
        return "", fmt.Errorf("LLM API call failed: %w", err)
    }

    // 8. Extract and validate the response
    if len(response.Choices) == 0 {
        return "", fmt.Errorf("LLM returned no choices")
    }

    estimateJSON := extractJSON(response.Choices[0].Message.Content)

    var validationCheck map[string]interface{}
    if err := json.Unmarshal([]byte(estimateJSON), &validationCheck); err != nil {
        return "", fmt.Errorf("the AI returned a malformed estimate — please try again: %w", err)
    }

    // 9. Create audit report record
    reportID, err := s.saveAuditReport(ctx, claimID, scopeSheet.ID, userID, estimateJSON)
    if err != nil {
        return "", fmt.Errorf("failed to save audit report: %w", err)
    }

    // 10. Log API usage
    if err = s.logAPIUsage(ctx, orgID, response); err != nil {
        log.Printf("Warning: failed to log API usage: %v", err)
    }

    return reportID, nil
}
```

**Step 5: Update buildEstimatePrompt to accept pricingContext**

Change the signature at line ~102 and inject the context block when non-empty:

```go
func (s *AuditService) buildEstimatePrompt(scope *models.ScopeSheet, pricingContext string) string {
    var builder strings.Builder

    if pricingContext != "" {
        builder.WriteString("LIVE PRICING DATA (current web search results — use these prices):\n")
        builder.WriteString(pricingContext)
        builder.WriteString("\n\n")
    }

    builder.WriteString("Based on the following scope sheet data")
    if pricingContext != "" {
        builder.WriteString(" and the LIVE PRICING DATA above")
    } else {
        builder.WriteString(" and current industry pricing")
    }
    builder.WriteString(", produce a detailed repair estimate in JSON format.\n\n")

    // ... rest of function unchanged (SCOPE SHEET DATA block, RESPONSE FORMAT block) ...
```

Note: keep everything from `builder.WriteString("SCOPE SHEET DATA:\n")` onward exactly as it is now. Only the opening lines change.

Also update the one existing call to `buildEstimatePrompt` in `GenerateIndustryEstimate` — already done in Step 4 above (`s.buildEstimatePrompt(scopeSheet, pricingContext)`).

**Step 6: Run tests**

```bash
cd "/Users/benjaminlopez/Documents/ClaimCoachAI Code/backend" && go test ./internal/services/ -run TestFetchLivePricing -v
```
Expected: PASS.

**Step 7: Build to check for compile errors**

```bash
cd "/Users/benjaminlopez/Documents/ClaimCoachAI Code/backend" && go build ./...
```
Expected: no errors (router will fail until Task 4 — that's fine, fix it in Task 4).

**Step 8: Commit**

```bash
git add backend/internal/services/audit_service.go backend/internal/services/audit_service_test.go
git commit -m "feat: add fetchLivePricing with OpenAI web search and graceful fallback"
```

---

### Task 4: Wire up in router + downgrade estimate to Claude Sonnet

**Files:**
- Modify: `backend/internal/api/router.go`
- Modify: `backend/internal/config/config.go` (one line)

**Step 1: Change default Anthropic model to Sonnet in config.go**

On line ~54, change:
```go
AnthropicModel: getEnvOrDefault("ANTHROPIC_MODEL", "claude-opus-4-6"),
```
to:
```go
AnthropicModel: getEnvOrDefault("ANTHROPIC_MODEL", "claude-sonnet-4-6"),
```

This saves ~5x per estimate call. PM Brain and other heavy tasks can be upgraded individually via env var if needed.

**Step 2: Wire up OpenAI client in router.go**

After the existing `llmClient` line (~line 60), add:

```go
// OpenAI client for live pricing search (optional — nil search client means graceful fallback)
var searchClient services.LLMClient
if cfg.OpenAIAPIKey != "" {
    searchClient = llm.NewOpenAIClient(cfg.OpenAIAPIKey, cfg.OpenAIModel, cfg.OpenAITimeout)
    log.Println("✓ OpenAI live pricing search enabled")
} else {
    log.Println("⚠ OpenAI live pricing search disabled (OPENAI_API_KEY not set)")
}
```

**Step 3: Update NewAuditService call (~line 89)**

Change:
```go
auditService := services.NewAuditService(db, llmClient, scopeSheetService)
```
to:
```go
auditService := services.NewAuditService(db, llmClient, searchClient, scopeSheetService)
```

**Step 4: Build clean**

```bash
cd "/Users/benjaminlopez/Documents/ClaimCoachAI Code/backend" && go build ./...
```
Expected: clean build, no errors.

**Step 5: Run full test suite**

```bash
cd "/Users/benjaminlopez/Documents/ClaimCoachAI Code/backend" && go test ./...
```
Expected: all tests pass.

**Step 6: Add OPENAI_API_KEY to .env**

In your `.env` file, add:
```
OPENAI_API_KEY=your-openai-key-here
OPENAI_MODEL=gpt-4o-mini-search-preview
OPENAI_TIMEOUT=30
```

**Step 7: Commit**

```bash
git add backend/internal/api/router.go backend/internal/config/config.go
git commit -m "feat: wire up OpenAI search client and downgrade estimate to Claude Sonnet"
```

---

## Final Verification

After all tasks complete:

```bash
cd "/Users/benjaminlopez/Documents/ClaimCoachAI Code/backend" && go build ./... && go test ./...
```

Both should be clean. Then test a live estimate generation via the UI — the logs should show:
```
✓ OpenAI live pricing search enabled
```
And the estimate line items should reflect real current prices rather than training-data guesses.
