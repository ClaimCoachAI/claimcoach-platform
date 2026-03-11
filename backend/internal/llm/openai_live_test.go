package llm

import (
	"context"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"
)

// TestLivePricingSearch hits the real OpenAI API using the key from OPENAI_API_KEY env var.
// Run with: go test ./internal/llm/ -run TestLivePricingSearch -v -timeout 60s
func TestLivePricingSearch(t *testing.T) {
	apiKey := os.Getenv("OPENAI_API_KEY")
	if apiKey == "" {
		t.Skip("OPENAI_API_KEY not set — skipping live test")
	}

	client := NewOpenAIClient(apiKey, "gpt-4o-mini-search-preview", 45)

	city := "El Paso"
	state := "TX"

	query := fmt.Sprintf(
		"What are current %d contractor repair prices in %s, %s for the following damage types: Roof, Shingles_Damaged? "+
			"Provide cost per square foot or linear foot for materials and labor separately. "+
			"Include Xactimate-standard line items where possible. Cite local sources if available.",
		time.Now().Year(),
		city, state,
	)

	fmt.Printf("\n=== SENDING QUERY TO OpenAI gpt-4o-mini-search-preview ===\n%s\n\n", query)
	fmt.Printf("=== Location context: city=%q state=%q ===\n\n", city, state)

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	messages := []Message{{Role: "user", Content: query}}
	resp, err := client.SearchChat(ctx, messages, 1.0, 800, city, state)
	if err != nil {
		t.Fatalf("SearchChat failed: %v", err)
	}

	if len(resp.Choices) == 0 {
		t.Fatal("No choices returned")
	}

	content := resp.Choices[0].Message.Content
	fmt.Printf("=== RAW RESPONSE FROM OPENAI ===\n%s\n", content)
	fmt.Printf("\n=== TOKENS USED: prompt=%d completion=%d total=%d ===\n",
		resp.Usage.PromptTokens, resp.Usage.CompletionTokens, resp.Usage.TotalTokens)

	if strings.TrimSpace(content) == "" {
		t.Fatal("Response content was empty")
	}
}
