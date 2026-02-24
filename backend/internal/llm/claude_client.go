package llm

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// ClaudeClient provides access to the Anthropic Claude API.
type ClaudeClient struct {
	apiKey     string
	model      string
	httpClient *http.Client
	baseURL    string
}

// NewClaudeClient creates a new Anthropic Claude API client.
func NewClaudeClient(apiKey, model string, timeoutSeconds int) *ClaudeClient {
	return &ClaudeClient{
		apiKey: apiKey,
		model:  model,
		httpClient: &http.Client{
			Timeout: time.Duration(timeoutSeconds) * time.Second,
		},
		baseURL: "https://api.anthropic.com/v1/messages",
	}
}

type claudeDocumentSource struct {
	Type      string `json:"type"`
	MediaType string `json:"media_type"`
	Data      string `json:"data"`
}

type claudeContentBlock struct {
	Type   string                `json:"type"`
	Source *claudeDocumentSource `json:"source,omitempty"`
	Text   string                `json:"text,omitempty"`
}

type claudeMessage struct {
	Role    string               `json:"role"`
	Content []claudeContentBlock `json:"content"`
}

type claudeRequest struct {
	Model     string          `json:"model"`
	MaxTokens int             `json:"max_tokens"`
	System    string          `json:"system,omitempty"`
	Messages  []claudeMessage `json:"messages"`
}

type claudeResponseContent struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

type claudeResponse struct {
	Content []claudeResponseContent `json:"content"`
	Error   *struct {
		Type    string `json:"type"`
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

// Chat sends a text chat request to Claude and returns a response in the same
// shape as ChatResponse so it satisfies the LLMClient interface.
func (c *ClaudeClient) Chat(ctx context.Context, messages []Message, temperature float64, maxTokens int) (*ChatResponse, error) {
	// Separate system message from conversation messages
	var systemPrompt string
	var convMessages []claudeMessage
	for _, m := range messages {
		if m.Role == "system" {
			systemPrompt = m.Content
		} else {
			convMessages = append(convMessages, claudeMessage{
				Role: m.Role,
				Content: []claudeContentBlock{
					{Type: "text", Text: m.Content},
				},
			})
		}
	}

	req := claudeRequest{
		Model:     c.model,
		MaxTokens: maxTokens,
		System:    systemPrompt,
		Messages:  convMessages,
	}

	responseText, err := c.sendRequest(ctx, req)
	if err != nil {
		return nil, err
	}

	// Return in ChatResponse shape so existing callers work unchanged
	return &ChatResponse{
		Choices: []struct {
			Index   int `json:"index"`
			Message struct {
				Role    string `json:"role"`
				Content string `json:"content"`
			} `json:"message"`
		}{
			{
				Index: 0,
				Message: struct {
					Role    string `json:"role"`
					Content string `json:"content"`
				}{
					Role:    "assistant",
					Content: responseText,
				},
			},
		},
	}, nil
}

// ParsePDF sends a PDF document to Claude and returns the text response.
func (c *ClaudeClient) ParsePDF(ctx context.Context, pdfContent []byte, prompt string, maxTokens int) (string, error) {
	encodedPDF := base64.StdEncoding.EncodeToString(pdfContent)

	req := claudeRequest{
		Model:     c.model,
		MaxTokens: maxTokens,
		Messages: []claudeMessage{
			{
				Role: "user",
				Content: []claudeContentBlock{
					{
						Type: "document",
						Source: &claudeDocumentSource{
							Type:      "base64",
							MediaType: "application/pdf",
							Data:      encodedPDF,
						},
					},
					{Type: "text", Text: prompt},
				},
			},
		},
	}

	return c.sendRequest(ctx, req)
}

// sendRequest marshals and sends a claudeRequest, returning the first text response.
func (c *ClaudeClient) sendRequest(ctx context.Context, req claudeRequest) (string, error) {
	body, err := json.Marshal(req)
	if err != nil {
		return "", fmt.Errorf("failed to marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", c.baseURL, bytes.NewBuffer(body))
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}

	httpReq.Header.Set("x-api-key", c.apiKey)
	httpReq.Header.Set("anthropic-version", "2023-06-01")
	httpReq.Header.Set("content-type", "application/json")

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return "", fmt.Errorf("failed to make request: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read response: %w", err)
	}

	var claudeResp claudeResponse
	if err := json.Unmarshal(respBody, &claudeResp); err != nil {
		return "", fmt.Errorf("failed to decode response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		if claudeResp.Error != nil {
			return "", fmt.Errorf("Claude API error %d: %s", resp.StatusCode, claudeResp.Error.Message)
		}
		return "", fmt.Errorf("Claude API returned status %d: %s", resp.StatusCode, string(respBody))
	}

	if len(claudeResp.Content) == 0 {
		return "", fmt.Errorf("no content in Claude response")
	}

	return claudeResp.Content[0].Text, nil
}
