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
	defaultSlackURL   = "https://slack.com/api/chat.postMessage"
	defaultRateWindow = 5 * time.Minute
	alertChannel      = "#ops"
)

type SlackService struct {
	token      string
	apiURL     string
	rateWindow time.Duration

	mu        sync.Mutex
	lastFired map[string]time.Time
}

func NewSlackService(token string) *SlackService {
	return newService(token, defaultSlackURL, defaultRateWindow)
}

func NewSlackServiceWithURL(token, apiURL string) *SlackService {
	return newService(token, apiURL, defaultRateWindow)
}

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

func (s *SlackService) PostAlert(message string) error {
	fp := message
	if len(fp) > 80 {
		fp = fp[:80]
	}
	return s.PostAlertWithFingerprint(message, fp)
}

func (s *SlackService) PostAlertWithFingerprint(message, fingerprint string) error {
	if s.token == "" {
		return nil
	}

	s.mu.Lock()
	last, seen := s.lastFired[fingerprint]
	if seen && time.Since(last) < s.rateWindow {
		s.mu.Unlock()
		return nil
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
