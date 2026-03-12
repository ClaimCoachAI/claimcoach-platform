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
