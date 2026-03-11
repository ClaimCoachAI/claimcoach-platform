package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"
)

type checkResult struct {
	Name    string
	OK      bool
	Message string
	Latency time.Duration
}

func main() {
	slackToken := os.Getenv("SLACK_BOT_TOKEN")
	if slackToken == "" {
		fmt.Fprintln(os.Stderr, "SLACK_BOT_TOKEN is required")
		os.Exit(1)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	results := []checkResult{
		checkHTTP(ctx, "Supabase", os.Getenv("SUPABASE_URL")+"/rest/v1/", nil),
		checkHTTP(ctx, "Backend Lambda", os.Getenv("API_URL")+"/health", nil),
		checkHTTP(ctx, "Frontend (Cloudflare)", os.Getenv("FRONTEND_URL"), nil),
		checkAnthropic(ctx, os.Getenv("ANTHROPIC_API_KEY")),
		checkOpenAI(ctx, os.Getenv("OPENAI_API_KEY")),
		checkSendGrid(ctx, os.Getenv("SENDGRID_API_KEY")),
	}

	allOK := true
	for _, r := range results {
		if !r.OK {
			allOK = false
			break
		}
	}

	msg := formatSlackMessage(results, allOK)
	if err := postToSlack(slackToken, "#ops", msg); err != nil {
		fmt.Fprintf(os.Stderr, "failed to post to Slack: %v\n", err)
		os.Exit(1)
	}

	if !allOK {
		os.Exit(1)
	}
}

func checkHTTP(ctx context.Context, name, url string, headers map[string]string) checkResult {
	if url == "" {
		return checkResult{Name: name, OK: false, Message: "URL not configured — check GitHub secrets/vars"}
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return checkResult{Name: name, OK: false, Message: "bad URL"}
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}

	start := time.Now()
	resp, err := http.DefaultClient.Do(req)
	latency := time.Since(start)
	if err != nil {
		return checkResult{Name: name, OK: false, Message: "unreachable — service may be down", Latency: latency}
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 500 {
		return checkResult{Name: name, OK: false, Message: fmt.Sprintf("server error (%d) — service is down", resp.StatusCode), Latency: latency}
	}
	return checkResult{Name: name, OK: true, Latency: latency}
}

func checkAnthropic(ctx context.Context, apiKey string) checkResult {
	if apiKey == "" {
		return checkResult{Name: "Anthropic API", OK: false, Message: "API key not configured — check ANTHROPIC_API_KEY secret"}
	}
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.anthropic.com/v1/models", nil)
	req.Header.Set("x-api-key", apiKey)
	req.Header.Set("anthropic-version", "2023-06-01")

	start := time.Now()
	resp, err := http.DefaultClient.Do(req)
	latency := time.Since(start)
	if err != nil {
		return checkResult{Name: "Anthropic API", OK: false, Message: "unreachable — Anthropic may be having an outage", Latency: latency}
	}
	defer resp.Body.Close()

	switch resp.StatusCode {
	case 200:
		return checkResult{Name: "Anthropic API", OK: true, Latency: latency}
	case 401:
		return checkResult{Name: "Anthropic API", OK: false, Message: "invalid API key — rotate ANTHROPIC_API_KEY", Latency: latency}
	case 529:
		return checkResult{Name: "Anthropic API", OK: false, Message: "Anthropic is overloaded — check status.anthropic.com", Latency: latency}
	default:
		return checkResult{Name: "Anthropic API", OK: false, Message: fmt.Sprintf("unexpected error (%d) — check status.anthropic.com", resp.StatusCode), Latency: latency}
	}
}

func checkOpenAI(ctx context.Context, apiKey string) checkResult {
	if apiKey == "" {
		return checkResult{Name: "OpenAI API", OK: false, Message: "API key not configured — check OPENAI_API_KEY secret"}
	}
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.openai.com/v1/models", nil)
	req.Header.Set("Authorization", "Bearer "+apiKey)

	start := time.Now()
	resp, err := http.DefaultClient.Do(req)
	latency := time.Since(start)
	if err != nil {
		return checkResult{Name: "OpenAI API", OK: false, Message: "unreachable — OpenAI may be having an outage", Latency: latency}
	}
	defer resp.Body.Close()

	switch resp.StatusCode {
	case 200:
		return checkResult{Name: "OpenAI API", OK: true, Latency: latency}
	case 401:
		return checkResult{Name: "OpenAI API", OK: false, Message: "invalid API key — rotate OPENAI_API_KEY", Latency: latency}
	default:
		return checkResult{Name: "OpenAI API", OK: false, Message: fmt.Sprintf("unexpected error (%d) — check status.openai.com", resp.StatusCode), Latency: latency}
	}
}

func checkSendGrid(ctx context.Context, apiKey string) checkResult {
	if apiKey == "" {
		return checkResult{Name: "SendGrid", OK: false, Message: "API key not configured — check SENDGRID_API_KEY secret"}
	}
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.sendgrid.com/v3/scopes", nil)
	req.Header.Set("Authorization", "Bearer "+apiKey)

	start := time.Now()
	resp, err := http.DefaultClient.Do(req)
	latency := time.Since(start)
	if err != nil {
		return checkResult{Name: "SendGrid", OK: false, Message: "unreachable — SendGrid may be having an outage", Latency: latency}
	}
	defer resp.Body.Close()

	switch resp.StatusCode {
	case 200:
		return checkResult{Name: "SendGrid", OK: true, Latency: latency}
	case 401, 403:
		return checkResult{Name: "SendGrid", OK: false, Message: "invalid API key — rotate SENDGRID_API_KEY", Latency: latency}
	default:
		return checkResult{Name: "SendGrid", OK: false, Message: fmt.Sprintf("unexpected error (%d) — check status.sendgrid.com", resp.StatusCode), Latency: latency}
	}
}

func formatSlackMessage(results []checkResult, allOK bool) string {
	var sb strings.Builder

	if allOK {
		sb.WriteString("*ClaimCoach Health Check — All Systems Go*\n")
	} else {
		sb.WriteString("*ClaimCoach Health Check — Issues Detected*\n")
	}
	sb.WriteString(fmt.Sprintf("_%s UTC_\n\n", time.Now().UTC().Format("2006-01-02 15:04")))

	for _, r := range results {
		if r.OK {
			sb.WriteString(fmt.Sprintf(":white_check_mark: *%s*\n", r.Name))
		} else {
			sb.WriteString(fmt.Sprintf(":x: *%s* — %s\n", r.Name, r.Message))
		}
	}

	return sb.String()
}

func postToSlack(token, channel, text string) error {
	payload, _ := json.Marshal(map[string]string{
		"channel": channel,
		"text":    text,
	})
	req, err := http.NewRequest(http.MethodPost, "https://slack.com/api/chat.postMessage", bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	var result struct {
		OK    bool   `json:"ok"`
		Error string `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return err
	}
	if !result.OK {
		return fmt.Errorf("slack API error: %s", result.Error)
	}
	return nil
}
