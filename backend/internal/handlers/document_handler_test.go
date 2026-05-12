package handlers

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/claimcoach/backend/internal/models"
	"github.com/claimcoach/backend/internal/services"
	"github.com/claimcoach/backend/internal/storage"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func newDocumentHandler(t *testing.T) (*DocumentHandler, func()) {
	db := setupTestDB(t)
	storageClient, err := storage.NewSupabaseStorage("http://localhost", "fake-key")
	assert.NoError(t, err)
	propertySvc := services.NewPropertyService(db)
	policySvc := services.NewPolicyService(db, storageClient, propertySvc)
	claimSvc := services.NewClaimService(db, propertySvc, policySvc)
	docSvc := services.NewDocumentService(db, storageClient, claimSvc)
	h := NewDocumentHandler(docSvc)
	return h, func() { db.Close() }
}

func newDocumentTestRouter(h *DocumentHandler) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(func(c *gin.Context) {
		auth := c.GetHeader("Authorization")
		if auth == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
			c.Abort()
			return
		}
		parts := strings.Split(auth, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid authorization header"})
			c.Abort()
			return
		}
		userID := parts[1]
		realDB := h.service.GetDB()
		var user models.User
		err := realDB.QueryRow(`
			SELECT id, organization_id, email, name, role, created_at, updated_at
			FROM users WHERE id = $1
		`, userID).Scan(
			&user.ID, &user.OrganizationID, &user.Email,
			&user.Name, &user.Role, &user.CreatedAt, &user.UpdatedAt,
		)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "User not found"})
			c.Abort()
			return
		}
		c.Set("user", user)
		c.Next()
	})
	r.DELETE("/api/claims/:id/documents/:documentId", h.DeleteDocument)
	return r
}

func TestDeleteDocument_NoAuth(t *testing.T) {
	h, cleanup := newDocumentHandler(t)
	defer cleanup()
	r := newDocumentTestRouter(h)

	req, _ := http.NewRequest("DELETE", "/api/claims/some-claim/documents/some-doc", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

func TestDeleteDocument_NotFound(t *testing.T) {
	h, cleanup := newDocumentHandler(t)
	defer cleanup()

	// Create org, user, property, policy, claim (no document)
	// Uses helpers from claim_handler_test.go (same package)
	db := h.service.GetDB()
	orgID, userID, _ := createAuthenticatedUser(t, db)
	propID := createTestProperty(t, db, orgID)
	policyID := createTestPolicy(t, db, propID, 1000.0)
	claimID := createTestClaim(t, db, propID, policyID, orgID, userID)

	r := newDocumentTestRouter(h)
	req, _ := http.NewRequest("DELETE", "/api/claims/"+claimID+"/documents/nonexistent-doc", nil)
	req.Header.Set("Authorization", "Bearer "+userID)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusNotFound, w.Code)
}
