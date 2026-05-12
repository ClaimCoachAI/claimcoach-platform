package handlers

import (
	"encoding/json"
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

// newClaimMediaTestRouter sets up a gin engine with mock auth that loads a real
// user from the DB (token == userID, same pattern as setupTestRouter).
func newClaimMediaTestRouter(h *ClaimMediaHandler) *gin.Engine {
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
		// token == userID in tests
		userID := parts[1]
		realDB := h.claimService.GetDB()
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
	r.GET("/api/claims/:id/media", h.GetMedia)
	return r
}

func newClaimMediaHandler(t *testing.T) (*ClaimMediaHandler, func()) {
	db := setupTestDB(t)
	storageClient, err := storage.NewSupabaseStorage("http://localhost", "fake-key")
	if err != nil {
		t.Logf("storage init warning: %v (expected in tests)", err)
	}
	claimSvc := services.NewClaimService(db, nil, nil)
	magicLinkSvc := services.NewMagicLinkService(db, nil, storageClient, claimSvc, nil)
	inspSvc := services.NewInspectionService(db, magicLinkSvc, storageClient)
	h := NewClaimMediaHandler(claimSvc, inspSvc, db, storageClient)
	return h, func() { db.Close() }
}

func TestClaimMediaHandler_NoAuth(t *testing.T) {
	h, cleanup := newClaimMediaHandler(t)
	defer cleanup()

	r := newClaimMediaTestRouter(h)
	req, _ := http.NewRequest("GET", "/api/claims/some-id/media", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

func TestClaimMediaHandler_ClaimNotFound(t *testing.T) {
	h, cleanup := newClaimMediaHandler(t)
	defer cleanup()

	db := h.claimService.GetDB()
	_, _, token := createAuthenticatedUser(t, db)

	r := newClaimMediaTestRouter(h)
	req, _ := http.NewRequest("GET", "/api/claims/nonexistent-id/media", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusNotFound, w.Code)
}

func TestClaimMediaHandler_NoInspection_ReturnsEmptyArray(t *testing.T) {
	h, cleanup := newClaimMediaHandler(t)
	defer cleanup()

	db := h.claimService.GetDB()
	orgID, userID, token := createAuthenticatedUser(t, db)
	propID := createTestProperty(t, db, orgID)
	policyID := createTestPolicy(t, db, propID, 2500.00)
	claimID := createTestClaim(t, db, propID, policyID, orgID, userID)

	r := newClaimMediaTestRouter(h)
	req, _ := http.NewRequest("GET", "/api/claims/"+claimID+"/media", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var body struct {
		Data []json.RawMessage `json:"data"`
	}
	err := json.Unmarshal(w.Body.Bytes(), &body)
	assert.NoError(t, err)
	assert.NotNil(t, body.Data)      // must be [] not null
	assert.Len(t, body.Data, 0)
}
