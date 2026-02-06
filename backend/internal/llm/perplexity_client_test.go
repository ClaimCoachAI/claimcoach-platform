package llm

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPerplexityClient_Chat_Success(t *testing.T) {
	// Mock server
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "POST", r.Method)
		assert.Equal(t, "Bearer test-key", r.Header.Get("Authorization"))
		assert.Equal(t, "application/json", r.Header.Get("Content-Type"))

		// Read and validate request body
		bodyBytes, err := io.ReadAll(r.Body)
		require.NoError(t, err)

		var request ChatRequest
		err = json.Unmarshal(bodyBytes, &request)
		require.NoError(t, err)

		assert.Equal(t, "sonar-pro", request.Model)
		assert.Equal(t, 0.2, request.Temperature)
		assert.Equal(t, 100, request.MaxTokens)
		assert.Len(t, request.Messages, 1)
		assert.Equal(t, "user", request.Messages[0].Role)
		assert.Equal(t, "Test prompt", request.Messages[0].Content)

		response := `{
			"id": "test-id",
			"model": "sonar-pro",
			"choices": [{
				"index": 0,
				"message": {
					"role": "assistant",
					"content": "Test response"
				}
			}],
			"usage": {
				"prompt_tokens": 10,
				"completion_tokens": 5,
				"total_tokens": 15
			}
		}`
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(response))
	}))
	defer server.Close()

	// Create client with test server URL
	client := NewPerplexityClient("test-key", "sonar-pro", 60, 3)
	client.baseURL = server.URL

	messages := []Message{
		{Role: "user", Content: "Test prompt"},
	}

	response, err := client.Chat(context.Background(), messages, 0.2, 100)

	assert.NoError(t, err)
	require.NotNil(t, response)
	assert.Equal(t, "test-id", response.ID)
	assert.Equal(t, "sonar-pro", response.Model)
	assert.Len(t, response.Choices, 1)
	assert.Equal(t, "assistant", response.Choices[0].Message.Role)
	assert.Equal(t, "Test response", response.Choices[0].Message.Content)
	assert.Equal(t, 10, response.Usage.PromptTokens)
	assert.Equal(t, 5, response.Usage.CompletionTokens)
	assert.Equal(t, 15, response.Usage.TotalTokens)
}

func TestPerplexityClient_Chat_RetryOnFailure(t *testing.T) {
	attempts := 0

	// Mock server that fails twice, then succeeds
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts++
		if attempts < 3 {
			w.WriteHeader(http.StatusInternalServerError)
			w.Write([]byte(`{"error": "Internal server error"}`))
			return
		}

		response := `{
			"id": "test-id",
			"model": "sonar-pro",
			"choices": [{
				"index": 0,
				"message": {
					"role": "assistant",
					"content": "Success after retries"
				}
			}],
			"usage": {
				"prompt_tokens": 10,
				"completion_tokens": 5,
				"total_tokens": 15
			}
		}`
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(response))
	}))
	defer server.Close()

	client := NewPerplexityClient("test-key", "sonar-pro", 60, 3)
	client.baseURL = server.URL

	messages := []Message{
		{Role: "user", Content: "Test prompt"},
	}

	response, err := client.Chat(context.Background(), messages, 0.2, 100)

	assert.NoError(t, err)
	require.NotNil(t, response)
	assert.Equal(t, "Success after retries", response.Choices[0].Message.Content)
	assert.Equal(t, 3, attempts, "Should have made 3 attempts")
}

func TestPerplexityClient_Chat_FailAfterMaxRetries(t *testing.T) {
	attempts := 0

	// Mock server that always fails
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts++
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(`{"error": "Internal server error"}`))
	}))
	defer server.Close()

	client := NewPerplexityClient("test-key", "sonar-pro", 60, 3)
	client.baseURL = server.URL

	messages := []Message{
		{Role: "user", Content: "Test prompt"},
	}

	response, err := client.Chat(context.Background(), messages, 0.2, 100)

	assert.Error(t, err)
	assert.Nil(t, response)
	assert.Contains(t, err.Error(), "all 3 retries failed")
	assert.Equal(t, 3, attempts, "Should have made 3 attempts")
}

func TestPerplexityClient_Chat_InvalidJSON(t *testing.T) {
	// Mock server returning invalid JSON
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{invalid json}`))
	}))
	defer server.Close()

	client := NewPerplexityClient("test-key", "sonar-pro", 60, 3)
	client.baseURL = server.URL

	messages := []Message{
		{Role: "user", Content: "Test prompt"},
	}

	response, err := client.Chat(context.Background(), messages, 0.2, 100)

	assert.Error(t, err)
	assert.Nil(t, response)
	assert.Contains(t, err.Error(), "failed to decode response")
}

func TestPerplexityClient_Chat_NonOKStatus(t *testing.T) {
	// Mock server returning 400 Bad Request
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		w.Write([]byte(`{"error": "Invalid request"}`))
	}))
	defer server.Close()

	client := NewPerplexityClient("test-key", "sonar-pro", 60, 3)
	client.baseURL = server.URL

	messages := []Message{
		{Role: "user", Content: "Test prompt"},
	}

	response, err := client.Chat(context.Background(), messages, 0.2, 100)

	assert.Error(t, err)
	assert.Nil(t, response)
	assert.Contains(t, err.Error(), "API returned status 400")
}

func TestNewPerplexityClient(t *testing.T) {
	client := NewPerplexityClient("test-key", "sonar-pro", 60, 3)

	assert.NotNil(t, client)
	assert.Equal(t, "test-key", client.apiKey)
	assert.Equal(t, "sonar-pro", client.model)
	assert.Equal(t, 3, client.maxRetries)
	assert.NotNil(t, client.httpClient)
}

func TestPerplexityClient_Chat_InputValidation(t *testing.T) {
	client := NewPerplexityClient("test-key", "sonar-pro", 60, 3)

	tests := []struct {
		name        string
		messages    []Message
		temperature float64
		maxTokens   int
		expectedErr string
	}{
		{
			name:        "empty messages",
			messages:    []Message{},
			temperature: 0.2,
			maxTokens:   100,
			expectedErr: "messages cannot be empty",
		},
		{
			name:        "temperature too low",
			messages:    []Message{{Role: "user", Content: "test"}},
			temperature: -0.1,
			maxTokens:   100,
			expectedErr: "temperature must be between 0 and 2",
		},
		{
			name:        "temperature too high",
			messages:    []Message{{Role: "user", Content: "test"}},
			temperature: 2.1,
			maxTokens:   100,
			expectedErr: "temperature must be between 0 and 2",
		},
		{
			name:        "maxTokens zero",
			messages:    []Message{{Role: "user", Content: "test"}},
			temperature: 0.2,
			maxTokens:   0,
			expectedErr: "maxTokens must be positive",
		},
		{
			name:        "maxTokens negative",
			messages:    []Message{{Role: "user", Content: "test"}},
			temperature: 0.2,
			maxTokens:   -1,
			expectedErr: "maxTokens must be positive",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			response, err := client.Chat(context.Background(), tt.messages, tt.temperature, tt.maxTokens)
			assert.Error(t, err)
			assert.Nil(t, response)
			assert.Contains(t, err.Error(), tt.expectedErr)
		})
	}
}

func TestPerplexityClient_Chat_NoRetryOn4xx(t *testing.T) {
	attempts := 0

	// Mock server that returns 400 Bad Request
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts++
		w.WriteHeader(http.StatusBadRequest)
		w.Write([]byte(`{"error": "Bad request"}`))
	}))
	defer server.Close()

	client := NewPerplexityClient("test-key", "sonar-pro", 60, 3)
	client.baseURL = server.URL

	messages := []Message{
		{Role: "user", Content: "Test prompt"},
	}

	response, err := client.Chat(context.Background(), messages, 0.2, 100)

	assert.Error(t, err)
	assert.Nil(t, response)
	assert.Contains(t, err.Error(), "API returned status 400")
	assert.Equal(t, 1, attempts, "Should only make 1 attempt for 4xx errors")
}

func TestPerplexityClient_Chat_RetryOn429(t *testing.T) {
	attempts := 0

	// Mock server that returns 429 twice, then succeeds
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts++
		if attempts < 3 {
			w.WriteHeader(http.StatusTooManyRequests)
			w.Write([]byte(`{"error": "Rate limit exceeded"}`))
			return
		}

		response := `{
			"id": "test-id",
			"model": "sonar-pro",
			"choices": [{
				"index": 0,
				"message": {
					"role": "assistant",
					"content": "Success after rate limit retries"
				}
			}],
			"usage": {
				"prompt_tokens": 10,
				"completion_tokens": 5,
				"total_tokens": 15
			}
		}`
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(response))
	}))
	defer server.Close()

	client := NewPerplexityClient("test-key", "sonar-pro", 60, 3)
	client.baseURL = server.URL

	messages := []Message{
		{Role: "user", Content: "Test prompt"},
	}

	response, err := client.Chat(context.Background(), messages, 0.2, 100)

	assert.NoError(t, err)
	require.NotNil(t, response)
	assert.Equal(t, "Success after rate limit retries", response.Choices[0].Message.Content)
	assert.Equal(t, 3, attempts, "Should have made 3 attempts for 429 errors")
}
