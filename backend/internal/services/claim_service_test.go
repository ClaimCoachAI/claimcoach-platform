package services

import (
	"database/sql"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	_ "github.com/lib/pq"
	"github.com/stretchr/testify/assert"
)

// setupTestDB creates a test database connection
func setupTestDB(t *testing.T) *sql.DB {
	t.Helper()

	// Get database URL from environment or use default test database
	dbURL := os.Getenv("TEST_DATABASE_URL")
	if dbURL == "" {
		// Try DATABASE_URL if TEST_DATABASE_URL is not set
		dbURL = os.Getenv("DATABASE_URL")
	}
	if dbURL == "" {
		// Default to local postgres
		dbURL = "postgresql://postgres:postgres@localhost:5432/claimcoach?sslmode=disable"
	}

	db, err := sql.Open("postgres", dbURL)
	if err != nil {
		t.Fatalf("Failed to connect to test database: %v", err)
	}

	// Ping to verify connection
	if err := db.Ping(); err != nil {
		t.Skipf("Skipping test: database not available: %v", err)
	}

	// Clean up test data before each test
	cleanupTestData(t, db)

	return db
}

// cleanupTestData removes all test data from the database
func cleanupTestData(t *testing.T, db *sql.DB) {
	t.Helper()

	// Delete in reverse order of foreign key dependencies
	tables := []string{
		"api_usage_logs",
		"rebuttals",
		"audit_reports",
		"carrier_estimates",
		"claim_activities",
		"documents",
		"scope_sheets",
		"claims",
		"insurance_policies",
		"properties",
		"users",
		"organizations",
	}

	for _, table := range tables {
		_, err := db.Exec(fmt.Sprintf("DELETE FROM %s", table))
		if err != nil {
			t.Logf("Warning: Failed to clean up table %s: %v", table, err)
		}
	}
}

// createTestOrg creates a test organization and returns its ID
func createTestOrg(t *testing.T, db *sql.DB) string {
	t.Helper()

	orgID := uuid.New().String()
	query := `INSERT INTO organizations (id, name, created_at, updated_at) VALUES ($1, $2, NOW(), NOW())`
	_, err := db.Exec(query, orgID, "Test Org")
	if err != nil {
		t.Fatalf("Failed to create test org: %v", err)
	}

	return orgID
}

// createTestUser creates a test user and returns its ID
func createTestUser(t *testing.T, db *sql.DB, orgID string) string {
	t.Helper()

	userID := uuid.New().String()
	query := `INSERT INTO users (id, organization_id, email, name, role, created_at, updated_at)
	          VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`
	_, err := db.Exec(query, userID, orgID, fmt.Sprintf("test-%s@example.com", userID), "Test User", "admin")
	if err != nil {
		t.Fatalf("Failed to create test user: %v", err)
	}

	return userID
}

// createTestProperty creates a test property and returns its ID
func createTestProperty(t *testing.T, db *sql.DB, orgID string) string {
	t.Helper()

	propertyID := uuid.New().String()
	query := `INSERT INTO properties (id, organization_id, nickname, legal_address, owner_entity_name, status, created_at, updated_at)
	          VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`
	_, err := db.Exec(query, propertyID, orgID, "Test Property", "123 Test St", "Test Owner", "active_monitored")
	if err != nil {
		t.Fatalf("Failed to create test property: %v", err)
	}

	return propertyID
}

// createTestPolicy creates a test insurance policy and returns its ID
func createTestPolicy(t *testing.T, db *sql.DB, propertyID string, deductible float64) string {
	t.Helper()

	policyID := uuid.New().String()
	query := `INSERT INTO insurance_policies (id, property_id, carrier_name, deductible_type, deductible_value, deductible_calculated, created_at, updated_at)
	          VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`
	_, err := db.Exec(query, policyID, propertyID, "Test Insurance Co", "fixed", deductible, deductible)
	if err != nil {
		t.Fatalf("Failed to create test policy: %v", err)
	}

	return policyID
}

// createTestClaim creates a test claim and returns its ID
func createTestClaim(t *testing.T, db *sql.DB, propertyID, policyID, orgID, userID string) string {
	t.Helper()

	claimID := uuid.New().String()
	query := `INSERT INTO claims (id, property_id, policy_id, loss_type, incident_date, status, created_by_user_id, created_at, updated_at)
	          VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`
	incidentDate := time.Now().Add(-24 * time.Hour)
	_, err := db.Exec(query, claimID, propertyID, policyID, "water", incidentDate, "draft", userID)
	if err != nil {
		t.Fatalf("Failed to create test claim: %v", err)
	}

	return claimID
}

func TestUpdateEstimate_Success(t *testing.T) {
	// Setup
	db := setupTestDB(t)
	defer db.Close()

	service := NewClaimService(db, nil)

	// Create test org, user, property, policy, claim
	orgID := createTestOrg(t, db)
	userID := createTestUser(t, db, orgID)
	propertyID := createTestProperty(t, db, orgID)
	policyID := createTestPolicy(t, db, propertyID, 10000.0) // $10k deductible
	claimID := createTestClaim(t, db, propertyID, policyID, orgID, userID)

	// Test
	estimate := 15000.0
	claim, comparison, err := service.UpdateEstimate(claimID, estimate, userID, orgID)

	// Assert
	assert.NoError(t, err)
	assert.NotNil(t, claim)
	assert.NotNil(t, comparison)
	assert.Equal(t, estimate, *claim.ContractorEstimateTotal)
	assert.Equal(t, 10000.0, comparison.Deductible)
	assert.Equal(t, 15000.0, comparison.Estimate)
	assert.Equal(t, 5000.0, comparison.Delta)
	assert.Equal(t, "worth_filing", comparison.Recommendation)
}

func TestUpdateEstimate_NotWorthFiling(t *testing.T) {
	// Setup
	db := setupTestDB(t)
	defer db.Close()

	service := NewClaimService(db, nil)

	// Create test data with $10k deductible
	orgID := createTestOrg(t, db)
	userID := createTestUser(t, db, orgID)
	propertyID := createTestProperty(t, db, orgID)
	policyID := createTestPolicy(t, db, propertyID, 10000.0)
	claimID := createTestClaim(t, db, propertyID, policyID, orgID, userID)

	// Test with estimate below deductible
	estimate := 8000.0
	claim, comparison, err := service.UpdateEstimate(claimID, estimate, userID, orgID)

	// Assert
	assert.NoError(t, err)
	assert.Equal(t, estimate, *claim.ContractorEstimateTotal)
	assert.Equal(t, 10000.0, comparison.Deductible)
	assert.Equal(t, 8000.0, comparison.Estimate)
	assert.Equal(t, -2000.0, comparison.Delta)
	assert.Equal(t, "not_worth_filing", comparison.Recommendation)
}

func TestUpdateEstimate_UnauthorizedOrg(t *testing.T) {
	// Setup
	db := setupTestDB(t)
	defer db.Close()

	service := NewClaimService(db, nil)

	// Create claim for org1
	org1ID := createTestOrg(t, db)
	user1ID := createTestUser(t, db, org1ID)
	propertyID := createTestProperty(t, db, org1ID)
	policyID := createTestPolicy(t, db, propertyID, 10000.0)
	claimID := createTestClaim(t, db, propertyID, policyID, org1ID, user1ID)

	// Try to update from org2
	org2ID := createTestOrg(t, db)
	user2ID := createTestUser(t, db, org2ID)

	// Test
	_, _, err := service.UpdateEstimate(claimID, 15000.0, user2ID, org2ID)

	// Assert
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "unauthorized")
}
