//go:build integration

package services

import (
	"context"
	"database/sql"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
)

func TestCreateScopeSheet_Success(t *testing.T) {
	// Setup
	db := setupTestDB(t)
	defer db.Close()

	// Create test data
	orgID := createTestOrg(t, db)
	userID := createTestUser(t, db, orgID)
	propertyID := createTestProperty(t, db, orgID)
	policyID := createTestPolicy(t, db, propertyID, 10000.0)
	claimID := createTestClaim(t, db, propertyID, policyID, orgID, userID)

	// Create service
	service := NewScopeSheetService(db)

	// Prepare input with all fields
	roofType := "asphalt_shingles"
	roofSquareFootage := 2000
	roofPitch := "6/12"
	fasciaLF := 150
	notes := "Test scope sheet"

	input := CreateScopeSheetInput{
		// Roof Main
		RoofType:          &roofType,
		RoofSquareFootage: &roofSquareFootage,
		RoofPitch:         &roofPitch,
		FasciaLF:          &fasciaLF,
		FasciaPaint:       true,
		SoffitLF:          nil,
		SoffitPaint:       false,
		DripEdgeLF:        nil,
		DripEdgePaint:     false,
		PipeJacksCount:    nil,
		PipeJacksPaint:    false,
		ExVentsCount:      nil,
		ExVentsPaint:      false,
		TurbinesCount:     nil,
		TurbinesPaint:     false,
		FurnacesCount:     nil,
		FurnacesPaint:     false,
		PowerVentsCount:   nil,
		PowerVentsPaint:   false,
		RidgeLF:           nil,
		SatellitesCount:   nil,
		StepFlashingLF:    nil,
		ChimneyFlashing:   false,
		RainDiverterLF:    nil,
		SkylightsCount:    nil,
		SkylightsDamaged:  false,

		// Roof Other
		RoofOtherType:               nil,
		RoofOtherPitch:              nil,
		RoofOtherFasciaLF:           nil,
		RoofOtherFasciaPaint:        false,
		RoofOtherSoffitLF:           nil,
		RoofOtherSoffitPaint:        false,
		RoofOtherDripEdgeLF:         nil,
		RoofOtherDripEdgePaint:      false,
		RoofOtherPipeJacksCount:     nil,
		RoofOtherPipeJacksPaint:     false,
		RoofOtherExVentsCount:       nil,
		RoofOtherExVentsPaint:       false,
		RoofOtherTurbinesCount:      nil,
		RoofOtherTurbinesPaint:      false,
		RoofOtherFurnacesCount:      nil,
		RoofOtherFurnacesPaint:      false,
		RoofOtherPowerVentsCount:    nil,
		RoofOtherPowerVentsPaint:    false,
		RoofOtherRidgeLF:            nil,
		RoofOtherSatellitesCount:    nil,
		RoofOtherStepFlashingLF:     nil,
		RoofOtherChimneyFlashing:    false,
		RoofOtherRainDiverterLF:     nil,
		RoofOtherSkylightsCount:     nil,
		RoofOtherSkylightsDamaged:   false,

		// Dimensions
		PorchPaint: false,
		PatioPaint: false,
		Fence:      nil,

		// Siding - Front
		FrontSiding1ReplaceSF: nil,
		FrontSiding1PaintSF:   nil,
		FrontSiding2ReplaceSF: nil,
		FrontSiding2PaintSF:   nil,
		FrontGuttersLF:        nil,
		FrontGuttersPaint:     false,
		FrontWindows:          nil,
		FrontScreens:          nil,
		FrontDoors:            nil,
		FrontACReplace:        false,
		FrontACCombFins:       false,

		// Siding - Right
		RightSiding1ReplaceSF: nil,
		RightSiding1PaintSF:   nil,
		RightSiding2ReplaceSF: nil,
		RightSiding2PaintSF:   nil,
		RightGuttersLF:        nil,
		RightGuttersPaint:     false,
		RightWindows:          nil,
		RightScreens:          nil,
		RightDoors:            nil,
		RightACReplace:        false,
		RightACCombFins:       false,

		// Siding - Back
		BackSiding1ReplaceSF: nil,
		BackSiding1PaintSF:   nil,
		BackSiding2ReplaceSF: nil,
		BackSiding2PaintSF:   nil,
		BackGuttersLF:        nil,
		BackGuttersPaint:     false,
		BackWindows:          nil,
		BackScreens:          nil,
		BackDoors:            nil,
		BackACReplace:        false,
		BackACCombFins:       false,

		// Siding - Left
		LeftSiding1ReplaceSF: nil,
		LeftSiding1PaintSF:   nil,
		LeftSiding2ReplaceSF: nil,
		LeftSiding2PaintSF:   nil,
		LeftGuttersLF:        nil,
		LeftGuttersPaint:     false,
		LeftWindows:          nil,
		LeftScreens:          nil,
		LeftDoors:            nil,
		LeftACReplace:        false,
		LeftACCombFins:       false,

		// Additional
		AdditionalItemsMain:  nil,
		AdditionalItemsOther: nil,
		Notes:                &notes,
	}

	// Test
	ctx := context.Background()
	scopeSheet, err := service.CreateScopeSheet(ctx, claimID, input)

	// Assert
	assert.NoError(t, err)
	assert.NotNil(t, scopeSheet)
	assert.NotEmpty(t, scopeSheet.ID)
	assert.Equal(t, claimID, scopeSheet.ClaimID)
	assert.Equal(t, &roofType, scopeSheet.RoofType)
	assert.Equal(t, &roofSquareFootage, scopeSheet.RoofSquareFootage)
	assert.Equal(t, &roofPitch, scopeSheet.RoofPitch)
	assert.Equal(t, &fasciaLF, scopeSheet.FasciaLF)
	assert.True(t, scopeSheet.FasciaPaint)
	assert.Equal(t, &notes, scopeSheet.Notes)
	assert.Nil(t, scopeSheet.SubmittedAt)
	assert.False(t, scopeSheet.CreatedAt.IsZero())
	assert.False(t, scopeSheet.UpdatedAt.IsZero())
}

func TestGetScopeSheetByClaimID_Success(t *testing.T) {
	// Setup
	db := setupTestDB(t)
	defer db.Close()

	// Create test data
	orgID := createTestOrg(t, db)
	userID := createTestUser(t, db, orgID)
	propertyID := createTestProperty(t, db, orgID)
	policyID := createTestPolicy(t, db, propertyID, 10000.0)
	claimID := createTestClaim(t, db, propertyID, policyID, orgID, userID)

	// Create service
	service := NewScopeSheetService(db)

	// Create a scope sheet first
	roofType := "metal"
	input := CreateScopeSheetInput{
		RoofType: &roofType,
	}
	ctx := context.Background()
	created, err := service.CreateScopeSheet(ctx, claimID, input)
	assert.NoError(t, err)

	// Test
	retrieved, err := service.GetScopeSheetByClaimID(ctx, claimID)

	// Assert
	assert.NoError(t, err)
	assert.NotNil(t, retrieved)
	assert.Equal(t, created.ID, retrieved.ID)
	assert.Equal(t, claimID, retrieved.ClaimID)
	assert.Equal(t, &roofType, retrieved.RoofType)
}

func TestGetScopeSheetByClaimID_NotFound(t *testing.T) {
	// Setup
	db := setupTestDB(t)
	defer db.Close()

	// Create test data
	orgID := createTestOrg(t, db)
	userID := createTestUser(t, db, orgID)
	propertyID := createTestProperty(t, db, orgID)
	policyID := createTestPolicy(t, db, propertyID, 10000.0)
	claimID := createTestClaim(t, db, propertyID, policyID, orgID, userID)

	// Create service
	service := NewScopeSheetService(db)

	// Test - no scope sheet exists for this claim
	ctx := context.Background()
	scopeSheet, err := service.GetScopeSheetByClaimID(ctx, claimID)

	// Assert - should return nil without error
	assert.NoError(t, err)
	assert.Nil(t, scopeSheet)
}

func TestSubmitScopeSheet_Success(t *testing.T) {
	// Setup
	db := setupTestDB(t)
	defer db.Close()

	// Create test data
	orgID := createTestOrg(t, db)
	userID := createTestUser(t, db, orgID)
	propertyID := createTestProperty(t, db, orgID)
	policyID := createTestPolicy(t, db, propertyID, 10000.0)
	claimID := createTestClaim(t, db, propertyID, policyID, orgID, userID)

	// Create service
	service := NewScopeSheetService(db)

	// Create a scope sheet first
	roofType := "tile"
	input := CreateScopeSheetInput{
		RoofType: &roofType,
	}
	ctx := context.Background()
	scopeSheet, err := service.CreateScopeSheet(ctx, claimID, input)
	assert.NoError(t, err)
	assert.Nil(t, scopeSheet.SubmittedAt)

	// Test
	beforeSubmit := time.Now()
	err = service.SubmitScopeSheet(ctx, scopeSheet.ID)
	afterSubmit := time.Now()

	// Assert
	assert.NoError(t, err)

	// Verify submitted_at was set
	retrieved, err := service.GetScopeSheetByClaimID(ctx, claimID)
	assert.NoError(t, err)
	assert.NotNil(t, retrieved.SubmittedAt)
	assert.True(t, retrieved.SubmittedAt.After(beforeSubmit) || retrieved.SubmittedAt.Equal(beforeSubmit))
	assert.True(t, retrieved.SubmittedAt.Before(afterSubmit) || retrieved.SubmittedAt.Equal(afterSubmit))
}

func TestSubmitScopeSheet_NotFound(t *testing.T) {
	// Setup
	db := setupTestDB(t)
	defer db.Close()

	// Create service
	service := NewScopeSheetService(db)

	// Test - submit non-existent scope sheet
	ctx := context.Background()
	err := service.SubmitScopeSheet(ctx, "non-existent-id")

	// Assert
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "scope sheet not found")
}

// ==================== DRAFT TESTS ====================

func TestSaveScopeDraft_CreateNew(t *testing.T) {
	// Setup
	db := setupTestDB(t)
	defer db.Close()

	// Create test data
	orgID := createTestOrg(t, db)
	userID := createTestUser(t, db, orgID)
	propertyID := createTestProperty(t, db, orgID)
	policyID := createTestPolicy(t, db, propertyID, 10000.0)
	claimID := createTestClaim(t, db, propertyID, policyID, orgID, userID)

	// Create magic link
	magicLinkToken := createTestMagicLink(t, db, claimID)

	// Create service
	service := NewScopeSheetService(db)

	// Prepare draft data - partial data is allowed
	roofType := "asphalt_shingles"
	roofSquareFootage := 2000
	step := 1

	draft := &CreateScopeSheetInput{
		RoofType:          &roofType,
		RoofSquareFootage: &roofSquareFootage,
		DraftStep:         &step,
	}

	// Test
	ctx := context.Background()
	beforeSave := time.Now()
	scopeSheet, err := service.SaveScopeDraft(ctx, magicLinkToken, draft)
	afterSave := time.Now()

	// Assert
	assert.NoError(t, err)
	assert.NotNil(t, scopeSheet)
	assert.NotEmpty(t, scopeSheet.ID)
	assert.Equal(t, claimID, scopeSheet.ClaimID)
	assert.True(t, scopeSheet.IsDraft)
	assert.Equal(t, &step, scopeSheet.DraftStep)
	assert.NotNil(t, scopeSheet.DraftSavedAt)
	assert.True(t, scopeSheet.DraftSavedAt.After(beforeSave) || scopeSheet.DraftSavedAt.Equal(beforeSave))
	assert.True(t, scopeSheet.DraftSavedAt.Before(afterSave) || scopeSheet.DraftSavedAt.Equal(afterSave))
	assert.Nil(t, scopeSheet.SubmittedAt)
	assert.Equal(t, &roofType, scopeSheet.RoofType)
	assert.Equal(t, &roofSquareFootage, scopeSheet.RoofSquareFootage)
}

func TestSaveScopeDraft_UpdateExisting(t *testing.T) {
	// Setup
	db := setupTestDB(t)
	defer db.Close()

	// Create test data
	orgID := createTestOrg(t, db)
	userID := createTestUser(t, db, orgID)
	propertyID := createTestProperty(t, db, orgID)
	policyID := createTestPolicy(t, db, propertyID, 10000.0)
	claimID := createTestClaim(t, db, propertyID, policyID, orgID, userID)

	// Create magic link
	magicLinkToken := createTestMagicLink(t, db, claimID)

	// Create service
	service := NewScopeSheetService(db)

	// Save initial draft
	roofType := "asphalt_shingles"
	step1 := 1
	draft1 := &CreateScopeSheetInput{
		RoofType:  &roofType,
		DraftStep: &step1,
	}

	ctx := context.Background()
	firstSave, err := service.SaveScopeDraft(ctx, magicLinkToken, draft1)
	assert.NoError(t, err)
	firstID := firstSave.ID

	// Wait a bit to ensure different timestamps
	time.Sleep(10 * time.Millisecond)

	// Update draft with more data
	roofPitch := "6/12"
	step2 := 2
	draft2 := &CreateScopeSheetInput{
		RoofType:  &roofType,
		RoofPitch: &roofPitch,
		DraftStep: &step2,
	}

	// Test
	beforeUpdate := time.Now()
	secondSave, err := service.SaveScopeDraft(ctx, magicLinkToken, draft2)
	afterUpdate := time.Now()

	// Assert
	assert.NoError(t, err)
	assert.NotNil(t, secondSave)
	assert.Equal(t, firstID, secondSave.ID) // Same ID (updated, not inserted)
	assert.True(t, secondSave.IsDraft)
	assert.Equal(t, &step2, secondSave.DraftStep)
	assert.NotNil(t, secondSave.DraftSavedAt)
	assert.True(t, secondSave.DraftSavedAt.After(beforeUpdate) || secondSave.DraftSavedAt.Equal(beforeUpdate))
	assert.True(t, secondSave.DraftSavedAt.Before(afterUpdate) || secondSave.DraftSavedAt.Equal(afterUpdate))
	assert.True(t, secondSave.DraftSavedAt.After(*firstSave.DraftSavedAt)) // Updated timestamp
	assert.Equal(t, &roofType, secondSave.RoofType)
	assert.Equal(t, &roofPitch, secondSave.RoofPitch)
}

func TestSaveScopeDraft_InvalidToken(t *testing.T) {
	// Setup
	db := setupTestDB(t)
	defer db.Close()

	// Create service
	service := NewScopeSheetService(db)

	// Prepare draft data
	roofType := "asphalt_shingles"
	step := 1
	draft := &CreateScopeSheetInput{
		RoofType:  &roofType,
		DraftStep: &step,
	}

	// Test - invalid token
	ctx := context.Background()
	_, err := service.SaveScopeDraft(ctx, "invalid-token-123", draft)

	// Assert - check for sentinel error
	assert.Error(t, err)
	assert.True(t, errors.Is(err, ErrTokenInvalid), "Expected ErrTokenInvalid")
}

func TestSaveScopeDraft_InvalidDraftStep(t *testing.T) {
	// Setup
	db := setupTestDB(t)
	defer db.Close()

	// Create test data
	orgID := createTestOrg(t, db)
	userID := createTestUser(t, db, orgID)
	propertyID := createTestProperty(t, db, orgID)
	policyID := createTestPolicy(t, db, propertyID, 10000.0)
	claimID := createTestClaim(t, db, propertyID, policyID, orgID, userID)

	// Create magic link
	magicLinkToken := createTestMagicLink(t, db, claimID)

	// Create service
	service := NewScopeSheetService(db)

	// Test 1: draft_step = 0 (too low)
	roofType := "asphalt_shingles"
	invalidStep := 0
	draft1 := &CreateScopeSheetInput{
		RoofType:  &roofType,
		DraftStep: &invalidStep,
	}

	ctx := context.Background()
	_, err := service.SaveScopeDraft(ctx, magicLinkToken, draft1)
	assert.Error(t, err)
	assert.True(t, errors.Is(err, ErrInvalidDraftStep), "Expected ErrInvalidDraftStep for step 0")

	// Test 2: draft_step = 11 (too high)
	invalidStep2 := 11
	draft2 := &CreateScopeSheetInput{
		RoofType:  &roofType,
		DraftStep: &invalidStep2,
	}

	_, err = service.SaveScopeDraft(ctx, magicLinkToken, draft2)
	assert.Error(t, err)
	assert.True(t, errors.Is(err, ErrInvalidDraftStep), "Expected ErrInvalidDraftStep for step 11")
}

func TestGetScopeDraft_Success(t *testing.T) {
	// Setup
	db := setupTestDB(t)
	defer db.Close()

	// Create test data
	orgID := createTestOrg(t, db)
	userID := createTestUser(t, db, orgID)
	propertyID := createTestProperty(t, db, orgID)
	policyID := createTestPolicy(t, db, propertyID, 10000.0)
	claimID := createTestClaim(t, db, propertyID, policyID, orgID, userID)

	// Create magic link
	magicLinkToken := createTestMagicLink(t, db, claimID)

	// Create service
	service := NewScopeSheetService(db)

	// Save a draft first
	roofType := "tile"
	step := 3
	draft := &CreateScopeSheetInput{
		RoofType:  &roofType,
		DraftStep: &step,
	}

	ctx := context.Background()
	saved, err := service.SaveScopeDraft(ctx, magicLinkToken, draft)
	assert.NoError(t, err)

	// Test - retrieve the draft
	retrieved, err := service.GetScopeDraft(ctx, magicLinkToken)

	// Assert
	assert.NoError(t, err)
	assert.NotNil(t, retrieved)
	assert.Equal(t, saved.ID, retrieved.ID)
	assert.Equal(t, claimID, retrieved.ClaimID)
	assert.True(t, retrieved.IsDraft)
	assert.Equal(t, &step, retrieved.DraftStep)
	assert.Equal(t, &roofType, retrieved.RoofType)
}

func TestGetScopeDraft_NotFound(t *testing.T) {
	// Setup
	db := setupTestDB(t)
	defer db.Close()

	// Create test data
	orgID := createTestOrg(t, db)
	userID := createTestUser(t, db, orgID)
	propertyID := createTestProperty(t, db, orgID)
	policyID := createTestPolicy(t, db, propertyID, 10000.0)
	claimID := createTestClaim(t, db, propertyID, policyID, orgID, userID)

	// Create magic link
	magicLinkToken := createTestMagicLink(t, db, claimID)

	// Create service
	service := NewScopeSheetService(db)

	// Test - retrieve draft when none exists
	ctx := context.Background()
	retrieved, err := service.GetScopeDraft(ctx, magicLinkToken)

	// Assert - check for sentinel error
	assert.Error(t, err)
	assert.Nil(t, retrieved)
	assert.True(t, errors.Is(err, ErrDraftNotFound), "Expected ErrDraftNotFound")
}

func TestGetScopeDraft_InvalidToken(t *testing.T) {
	// Setup
	db := setupTestDB(t)
	defer db.Close()

	// Create service
	service := NewScopeSheetService(db)

	// Test - retrieve draft with invalid token
	ctx := context.Background()
	retrieved, err := service.GetScopeDraft(ctx, "invalid-token-456")

	// Assert - check for sentinel error
	assert.Error(t, err)
	assert.Nil(t, retrieved)
	assert.True(t, errors.Is(err, ErrTokenInvalid), "Expected ErrTokenInvalid")
}

// createTestMagicLink creates a test magic link and returns its token
func createTestMagicLink(t *testing.T, db *sql.DB, claimID string) string {
	t.Helper()

	token := uuid.New().String()
	query := `
		INSERT INTO magic_links (
			id, claim_id, token, contractor_name, contractor_email,
			expires_at, access_count, status, created_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
	`
	_, err := db.Exec(
		query,
		uuid.New().String(),
		claimID,
		token,
		"Test Contractor",
		"contractor@test.com",
		time.Now().Add(72*time.Hour),
		0,
		"active",
	)
	if err != nil {
		t.Fatalf("Failed to create test magic link: %v", err)
	}

	return token
}
