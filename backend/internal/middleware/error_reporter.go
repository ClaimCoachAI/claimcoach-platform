package middleware

import (
	"fmt"
	"time"
	"github.com/gin-gonic/gin"
)

type AlertPoster interface {
	PostAlertWithFingerprint(message, fingerprint string) error
}

func ErrorReporter(svc AlertPoster) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Next()
		status := c.Writer.Status()
		if status < 500 {
			return
		}
		errMsg := ""
		if len(c.Errors) > 0 {
			errMsg = c.Errors.Last().Error()
		}
		fingerprint := fmt.Sprintf("%s %s %d", c.Request.Method, c.FullPath(), status)
		msg := fmt.Sprintf(
			"🚨 *ClaimCoach — Backend Error*\nEndpoint: %s %s\nStatus: %d\nError: %s\n_%s UTC_",
			c.Request.Method, c.Request.URL.Path, status, errMsg,
			time.Now().UTC().Format("2006-01-02 15:04"),
		)
		_ = svc.PostAlertWithFingerprint(msg, fingerprint)
	}
}
