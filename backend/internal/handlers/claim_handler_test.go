package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/claimcoach/backend/internal/models"
	"github.com/claimcoach/backend/internal/services"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	_ "github.com/lib/pq"
)

// Test helper functions

func setupTestDB(t *testing.T) *sql.DB {
	// Connect to test database
	db, err := sql.Open("postgres", "postgres://postgres:postgres@localhost:5432/claimcoach_test?sslmode=disable")
	if err != nil {
		t.Fatalf("Failed to connect to test database: %v", err)
	}

	// Clean up tables before test
	cleanupTables(t, db)

	return db
}

func cleanupTables(t *testing.T, db *sql.DB) {
	tables := []string{
		"claim_activities",
		"documents",
		"claims",
		"insurance_policies",
		"properties",
		"users",
		"organizations",
	}

	for _, table := range tables {
		_, err := db.Exec("DELETE FROM " + table)
		if err != nil {
			t.Logf("Warning: Failed to clean table %s: %v", table, err)
		}
	}
}

func setupTestRouter(handler *ClaimHandler) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()

	// Mock auth middleware that sets user in context
	r.Use(func(c *gin.Context) {
		token := c.GetHeader("Authorization")
		if token == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
			c.Abort()
			return
		}

		// Extract token from "Bearer <token>"
		parts := strings.Split(token, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid authorization header"})
			c.Abort()
			return
		}

		actualToken := parts[1]

		// In tests, token is the user ID
		// Get DB from handler service
		db := getDBFromHandler(handler)
		var user models.User
		err := db.QueryRow(`
			SELECT id, organization_id, email, name, role, created_at, updated_at
			FROM users WHERE id = $1
		`, actualToken).Scan(
			&user.ID,
			&user.OrganizationID,
			&user.Email,
			&user.Name,
			&user.Role,
			&user.CreatedAt,
			&user.UpdatedAt,
		)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "User not found"})
			c.Abort()
			return
		}

		c.Set("user", user)
		c.Next()
	})

	// Register routes
	r.PATCH("/api/claims/:id/estimate", handler.PatchClaimEstimate)

	return r
}

func getDBFromHandler(handler *ClaimHandler) *sql.DB {
	// Access the service's DB through the GetDB method
	return handler.service.GetDB()
}

func createAuthenticatedUser(t *testing.T, db *sql.DB) (string, string, string) {
	orgID := uuid.New().String()
	userID := uuid.New().String()

	// Create organization
	_, err := db.Exec(`
		INSERT INTO organizations (id, name, created_at, updated_at)
		VALUES ($1, $2, $3, $4)
	`, orgID, "Test Org", time.Now(), time.Now())
	if err != nil {
		t.Fatalf("Failed to create organization: %v", err)
	}

	// Create user
	_, err = db.Exec(`
		INSERT INTO users (id, organization_id, email, name, role, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`, userID, orgID, "test@example.com", "Test User", "admin", time.Now(), time.Now())
	if err != nil {
		t.Fatalf("Failed to create user: %v", err)
	}

	// Token is just the user ID in tests
	return orgID, userID, userID
}

func createTestProperty(t *testing.T, db *sql.DB, orgID string) string {
	propertyID := uuid.New().String()

	_, err := db.Exec(`
		INSERT INTO properties (id, organization_id, street_address, city, state, zip_code, property_type, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	`, propertyID, orgID, "123 Main St", "Anytown", "CA", "12345", "single_family", time.Now(), time.Now())
	if err != nil {
		t.Fatalf("Failed to create property: %v", err)
	}

	return propertyID
}

func createTestPolicy(t *testing.T, db *sql.DB, propertyID string, deductible float64) string {
	policyID := uuid.New().String()

	_, err := db.Exec(`
		INSERT INTO insurance_policies (id, property_id, carrier_name, policy_number, coverage_amount, deductible_type, deductible_percentage, deductible_flat, deductible_calculated, policy_start_date, policy_end_date, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
	`, policyID, propertyID, "Test Insurance", "POL-12345", 500000.0, "flat", nil, &deductible, deductible, time.Now(), time.Now().AddDate(1, 0, 0), time.Now(), time.Now())
	if err != nil {
		t.Fatalf("Failed to create policy: %v", err)
	}

	return policyID
}

func createTestClaim(t *testing.T, db *sql.DB, propertyID, policyID, orgID, userID string) string {
	claimID := uuid.New().String()

	_, err := db.Exec(`
		INSERT INTO claims (id, property_id, policy_id, loss_type, incident_date, status, created_by_user_id, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	`, claimID, propertyID, policyID, "water", time.Now(), "draft", userID, time.Now(), time.Now())
	if err != nil {
		t.Fatalf("Failed to create claim: %v", err)
	}

	return claimID
}

// Test cases

func TestPatchClaimEstimate_Success(t *testing.T) {
	// Setup
	db := setupTestDB(t)
	defer db.Close()

	propertyService := services.NewPropertyService(db)
	claimService := services.NewClaimService(db, propertyService)
	handler := NewClaimHandler(claimService)
	router := setupTestRouter(handler)

	// Create test data
	orgID, userID, token := createAuthenticatedUser(t, db)
	propertyID := createTestProperty(t, db, orgID)
	policyID := createTestPolicy(t, db, propertyID, 10000.0)
	claimID := createTestClaim(t, db, propertyID, policyID, orgID, userID)

	// Request
	body := `{"contractor_estimate_total": 15000.00}`
	req := httptest.NewRequest("PATCH", "/api/claims/"+claimID+"/estimate", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	// Assert
	assert.Equal(t, http.StatusOK, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	assert.NoError(t, err)

	assert.Equal(t, true, response["success"])
	assert.Contains(t, response, "data")

	data := response["data"].(map[string]interface{})
	assert.Contains(t, data, "claim")
	assert.Contains(t, data, "comparison")

	comparison := data["comparison"].(map[string]interface{})
	assert.Equal(t, 10000.0, comparison["deductible"])
	assert.Equal(t, 15000.0, comparison["estimate"])
	assert.Equal(t, 5000.0, comparison["delta"])
	assert.Equal(t, "worth_filing", comparison["recommendation"])
}

func TestPatchClaimEstimate_Unauthorized(t *testing.T) {
	// Setup
	db := setupTestDB(t)
	defer db.Close()

	propertyService := services.NewPropertyService(db)
	claimService := services.NewClaimService(db, propertyService)
	handler := NewClaimHandler(claimService)
	router := setupTestRouter(handler)

	// Request without token
	body := `{"contractor_estimate_total": 15000.00}`
	req := httptest.NewRequest("PATCH", "/api/claims/some-id/estimate", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")

	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	// Assert
	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

func TestPatchClaimEstimate_InvalidInput(t *testing.T) {
	// Setup
	db := setupTestDB(t)
	defer db.Close()

	propertyService := services.NewPropertyService(db)
	claimService := services.NewClaimService(db, propertyService)
	handler := NewClaimHandler(claimService)
	router := setupTestRouter(handler)

	_, _, token := createAuthenticatedUser(t, db)

	// Request with negative estimate
	body := `{"contractor_estimate_total": -1000.00}`
	req := httptest.NewRequest("PATCH", "/api/claims/some-id/estimate", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	// Assert
	assert.Equal(t, http.StatusBadRequest, w.Code)
}
