package handlers_test

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"
	"github.com/gin-gonic/gin"
	"github.com/claimcoach/backend/internal/handlers"
)

type captureSlack struct{ messages []string }
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
	if w.Code != http.StatusNoContent { t.Errorf("expected 204, got %d", w.Code) }
	if len(svc.messages) != 1 { t.Fatalf("expected 1 alert, got %d", len(svc.messages)) }
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
	if w.Code != http.StatusNoContent { t.Errorf("expected 204, got %d", w.Code) }
	if len(svc.messages) != 0 { t.Errorf("expected no alert for empty body, got %d", len(svc.messages)) }
}

func TestErrorReporterHandler_IPRateLimit(t *testing.T) {
	gin.SetMode(gin.TestMode)
	svc := &captureSlack{}
	h := handlers.NewErrorReporterHandler(svc)
	r := gin.New()
	r.POST("/api/errors", h.Report)
	body := `{"source":"mutation","url":"/claims/abc","error_message":"err","claim_id":"abc"}`
	var lastCode int
	for i := 0; i < 11; i++ {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("POST", "/api/errors", bytes.NewBufferString(body))
		req.Header.Set("Content-Type", "application/json")
		req.RemoteAddr = "1.2.3.4:9999"
		r.ServeHTTP(w, req)
		lastCode = w.Code
	}
	if lastCode != http.StatusTooManyRequests { t.Errorf("expected 429 on 11th request, got %d", lastCode) }
}
