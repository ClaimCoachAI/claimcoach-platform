package services

import (
	"context"
	"testing"
	"time"

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
