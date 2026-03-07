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
	httpClient *http.Client
	baseURL    string
}

// NewOpenAIClient creates a new OpenAI API client.
func NewOpenAIClient(apiKey, model string, timeoutSeconds int) *OpenAIClient {
	return newOpenAIClientWithURL(apiKey, model, timeoutSeconds, "https://api.openai.com/v1/chat/completions")
}

func newOpenAIClientWithURL(apiKey, model string, timeoutSeconds int, baseURL string) *OpenAIClient {
	return &OpenAIClient{
		apiKey: apiKey,
		model:  model,
		httpClient: &http.Client{
			Timeout: time.Duration(timeoutSeconds) * time.Second,
		},
		baseURL: baseURL,
	}
}

// openAIRequest is the internal request struct used by the OpenAI client.
// It extends the shared ChatRequest with OpenAI-specific fields like web_search_options.
type openAIRequest struct {
	Model            string               `json:"model"`
	Messages         []Message            `json:"messages"`
	Temperature      *float64             `json:"temperature,omitempty"` // nil = omitted (required for search models)
	MaxTokens        int                  `json:"max_tokens"`
	WebSearchOptions *openAIWebSearchOpts `json:"web_search_options,omitempty"`
}

type openAIWebSearchOpts struct {
	UserLocation *openAIUserLocation `json:"user_location,omitempty"`
}

// openAIUserLocation provides regional context to the web search.
// The API requires type="approximate" with location details nested under "approximate".
type openAIUserLocation struct {
	Type        string                   `json:"type"` // always "approximate"
	Approximate *openAILocationApproximate `json:"approximate,omitempty"`
}

type openAILocationApproximate struct {
	City    string `json:"city,omitempty"`
	Region  string `json:"region,omitempty"` // state name or abbreviation
	Country string `json:"country,omitempty"`
}

// Chat sends a standard chat completion request to the OpenAI API (no location context).
func (c *OpenAIClient) Chat(ctx context.Context, messages []Message, temperature float64, maxTokens int) (*ChatResponse, error) {
	return c.send(ctx, openAIRequest{
		Model:       c.model,
		Messages:    messages,
		Temperature: &temperature,
		MaxTokens:   maxTokens,
	})
}

// SearchChat sends a web-search-enabled chat request with regional location context.
// temperature is intentionally omitted — gpt-4o-mini-search-preview rejects it.
// city and state are injected into web_search_options so the model biases results to that region.
func (c *OpenAIClient) SearchChat(ctx context.Context, messages []Message, _ float64, maxTokens int, city, state string) (*ChatResponse, error) {
	req := openAIRequest{
		Model:     c.model,
		Messages:  messages,
		// Temperature omitted (nil) — incompatible with search preview models
		MaxTokens: maxTokens,
	}
	if city != "" || state != "" {
		req.WebSearchOptions = &openAIWebSearchOpts{
			UserLocation: &openAIUserLocation{
				Type: "approximate",
				Approximate: &openAILocationApproximate{
					City:    city,
					Region:  state,
					Country: "US",
				},
			},
		}
	}
	return c.send(ctx, req)
}

// send marshals and POSTs a request, returning the parsed ChatResponse.
func (c *OpenAIClient) send(ctx context.Context, request openAIRequest) (*ChatResponse, error) {
	if len(request.Messages) == 0 {
		return nil, fmt.Errorf("messages cannot be empty")
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
