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

// PerplexityClient provides access to the Perplexity AI API with automatic retries.
type PerplexityClient struct {
	apiKey     string
	model      string
	timeout    time.Duration
	maxRetries int
	httpClient *http.Client
	baseURL    string // Configurable for testing
}

// Message represents a single message in a chat conversation.
type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type ChatRequest struct {
	Model       string    `json:"model"`
	Messages    []Message `json:"messages"`
	Temperature float64   `json:"temperature"`
	MaxTokens   int       `json:"max_tokens"`
}

type ChatResponse struct {
	ID      string `json:"id"`
	Model   string `json:"model"`
	Choices []struct {
		Index   int `json:"index"`
		Message struct {
			Role    string `json:"role"`
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
	Usage struct {
		PromptTokens     int `json:"prompt_tokens"`
		CompletionTokens int `json:"completion_tokens"`
		TotalTokens      int `json:"total_tokens"`
	} `json:"usage"`
}

// NewPerplexityClient creates a new Perplexity API client with the given configuration.
func NewPerplexityClient(apiKey, model string, timeout int, maxRetries int) *PerplexityClient {
	return &PerplexityClient{
		apiKey:     apiKey,
		model:      model,
		timeout:    time.Duration(timeout) * time.Second,
		maxRetries: maxRetries,
		httpClient: &http.Client{Timeout: time.Duration(timeout) * time.Second},
		baseURL:    "https://api.perplexity.ai/chat/completions",
	}
}

// Chat sends a chat completion request to the Perplexity API with automatic retry logic.
func (c *PerplexityClient) Chat(ctx context.Context, messages []Message, temperature float64, maxTokens int) (*ChatResponse, error) {
	// Input validation
	if len(messages) == 0 {
		return nil, fmt.Errorf("messages cannot be empty")
	}
	if temperature < 0 || temperature > 2 {
		return nil, fmt.Errorf("temperature must be between 0 and 2, got %f", temperature)
	}
	if maxTokens <= 0 {
		return nil, fmt.Errorf("maxTokens must be positive, got %d", maxTokens)
	}

	request := ChatRequest{
		Model:       c.model,
		Messages:    messages,
		Temperature: temperature,
		MaxTokens:   maxTokens,
	}

	var lastErr error
	for attempt := 0; attempt < c.maxRetries; attempt++ {
		response, statusCode, err := c.makeRequest(ctx, request)
		if err == nil {
			return response, nil
		}
		lastErr = err

		// Only retry if it's a retryable error
		if !shouldRetry(statusCode, err) {
			return nil, lastErr
		}

		if attempt < c.maxRetries-1 {
			// Exponential backoff: 1s, 2s, 4s
			time.Sleep(time.Duration(1<<attempt) * time.Second)
		}
	}

	return nil, fmt.Errorf("all %d retries failed: %w", c.maxRetries, lastErr)
}

// shouldRetry determines if a request should be retried based on the error and status code.
func shouldRetry(statusCode int, err error) bool {
	// Retry on network errors (err != nil with no response)
	if err != nil && statusCode == 0 {
		return true
	}
	// Retry on server errors and rate limits
	return statusCode >= 500 || statusCode == 429
}

func (c *PerplexityClient) makeRequest(ctx context.Context, request ChatRequest) (*ChatResponse, int, error) {
	body, err := json.Marshal(request)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", c.baseURL, bytes.NewBuffer(body))
	if err != nil {
		return nil, 0, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to make request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return nil, resp.StatusCode, fmt.Errorf("API returned status %d: %s", resp.StatusCode, string(bodyBytes))
	}

	var chatResponse ChatResponse
	if err := json.NewDecoder(resp.Body).Decode(&chatResponse); err != nil {
		return nil, resp.StatusCode, fmt.Errorf("failed to decode response: %w", err)
	}

	return &chatResponse, resp.StatusCode, nil
}
