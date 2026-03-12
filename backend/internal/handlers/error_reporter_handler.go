package handlers

import (
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"
	"unicode"
	"github.com/gin-gonic/gin"
)

type ErrorAlertPoster interface {
	PostAlertWithFingerprint(message, fingerprint string) error
}

type ErrorReporterHandler struct {
	slack  ErrorAlertPoster
	ipMu   sync.Mutex
	ipHits map[string][]time.Time
}

func NewErrorReporterHandler(svc ErrorAlertPoster) *ErrorReporterHandler {
	return &ErrorReporterHandler{slack: svc, ipHits: make(map[string][]time.Time)}
}

func (h *ErrorReporterHandler) allowIP(ip string) bool {
	now := time.Now()
	window := time.Minute
	h.ipMu.Lock()
	defer h.ipMu.Unlock()
	hits := h.ipHits[ip]
	cutoff := now.Add(-window)
	valid := hits[:0]
	for _, t := range hits {
		if t.After(cutoff) {
			valid = append(valid, t)
		}
	}
	if len(valid) >= 10 {
		h.ipHits[ip] = valid
		return false
	}
	h.ipHits[ip] = append(valid, now)
	return true
}

var controlCharsRe = regexp.MustCompile(`[\x00-\x1F\x7F]`)

func sanitize(s string) string {
	s = controlCharsRe.ReplaceAllString(s, "")
	s = strings.Map(func(r rune) rune {
		if unicode.IsPrint(r) { return r }
		return -1
	}, s)
	if len(s) > 200 { s = s[:200] }
	return s
}

type errorReportInput struct {
	Source       string `json:"source"`
	URL          string `json:"url"`
	ErrorMessage string `json:"error_message"`
	ClaimID      string `json:"claim_id"`
}

func (h *ErrorReporterHandler) Report(c *gin.Context) {
	if !h.allowIP(c.ClientIP()) {
		c.Status(http.StatusTooManyRequests)
		return
	}
	var input errorReportInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.Status(http.StatusNoContent)
		return
	}
	source := sanitize(input.Source)
	url := sanitize(input.URL)
	errMsg := sanitize(input.ErrorMessage)
	claimID := sanitize(input.ClaimID)
	if source == "" && errMsg == "" {
		c.Status(http.StatusNoContent)
		return
	}
	fp := source + "|" + errMsg
	if len(fp) > 80+1 { fp = fp[:81] }
	msg := fmt.Sprintf(
		"🚨 *ClaimCoach — User Blocked*\nSource: Frontend %s failed\nURL: %s\nClaim: %s\nError: %s\n_%s UTC_",
		source, url, claimID, errMsg,
		time.Now().UTC().Format("2006-01-02 15:04"),
	)
	_ = h.slack.PostAlertWithFingerprint(msg, fp)
	c.Status(http.StatusNoContent)
}
