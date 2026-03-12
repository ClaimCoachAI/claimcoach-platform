package middleware_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/claimcoach/backend/internal/middleware"
)

type mockAlertPoster struct {
	messages []string
}
func (m *mockAlertPoster) PostAlertWithFingerprint(msg, fp string) error {
	m.messages = append(m.messages, msg)
	return nil
}

func TestErrorReporterMiddleware_FiresOn5xx(t *testing.T) {
	mock := &mockAlertPoster{}
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(middleware.ErrorReporter(mock))
	r.GET("/test", func(c *gin.Context) {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "db exploded"})
	})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/test", nil)
	r.ServeHTTP(w, req)
	if len(mock.messages) != 1 {
		t.Fatalf("expected 1 alert, got %d", len(mock.messages))
	}
}

func TestErrorReporterMiddleware_SilentOn4xx(t *testing.T) {
	mock := &mockAlertPoster{}
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(middleware.ErrorReporter(mock))
	r.GET("/test", func(c *gin.Context) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
	})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/test", nil)
	r.ServeHTTP(w, req)
	if len(mock.messages) != 0 {
		t.Fatalf("expected no alerts for 4xx, got %d", len(mock.messages))
	}
}
