package services

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/claimcoach/backend/internal/models"
	"github.com/google/uuid"
)

// Sentinel errors for scope sheet operations
var (
	ErrTokenInvalid     = errors.New("magic link token is invalid or expired")
	ErrDraftNotFound    = errors.New("draft not found")
	ErrInvalidDraftStep = errors.New("draft_step must be between 1 and 10")
)

type ScopeSheetService struct {
	db *sql.DB
}

func NewScopeSheetService(db *sql.DB) *ScopeSheetService {
	return &ScopeSheetService{
		db: db,
	}
}

type CreateScopeSheetInput struct {
	// Roof Main
	RoofType          *string
	RoofSquareFootage *int
	RoofPitch         *string
	FasciaLF          *int
	FasciaPaint       bool
	SoffitLF          *int
	SoffitPaint       bool
	DripEdgeLF        *int
	DripEdgePaint     bool
	PipeJacksCount    *int
	PipeJacksPaint    bool
	ExVentsCount      *int
	ExVentsPaint      bool
	TurbinesCount     *int
	TurbinesPaint     bool
	FurnacesCount     *int
	FurnacesPaint     bool
	PowerVentsCount   *int
	PowerVentsPaint   bool
	RidgeLF           *int
	SatellitesCount   *int
	StepFlashingLF    *int
	ChimneyFlashing   bool
	RainDiverterLF    *int
	SkylightsCount    *int
	SkylightsDamaged  bool

	// Roof Other
	RoofOtherType               *string
	RoofOtherPitch              *string
	RoofOtherFasciaLF           *int
	RoofOtherFasciaPaint        bool
	RoofOtherSoffitLF           *int
	RoofOtherSoffitPaint        bool
	RoofOtherDripEdgeLF         *int
	RoofOtherDripEdgePaint      bool
	RoofOtherPipeJacksCount     *int
	RoofOtherPipeJacksPaint     bool
	RoofOtherExVentsCount       *int
	RoofOtherExVentsPaint       bool
	RoofOtherTurbinesCount      *int
	RoofOtherTurbinesPaint      bool
	RoofOtherFurnacesCount      *int
	RoofOtherFurnacesPaint      bool
	RoofOtherPowerVentsCount    *int
	RoofOtherPowerVentsPaint    bool
	RoofOtherRidgeLF            *int
	RoofOtherSatellitesCount    *int
	RoofOtherStepFlashingLF     *int
	RoofOtherChimneyFlashing    bool
	RoofOtherRainDiverterLF     *int
	RoofOtherSkylightsCount     *int
	RoofOtherSkylightsDamaged   bool

	// Dimensions
	PorchPaint bool
	PatioPaint bool
	Fence      *string

	// Siding - Front
	FrontSiding1ReplaceSF *int
	FrontSiding1PaintSF   *int
	FrontSiding2ReplaceSF *int
	FrontSiding2PaintSF   *int
	FrontGuttersLF        *int
	FrontGuttersPaint     bool
	FrontWindows          *string
	FrontScreens          *string
	FrontDoors            *string
	FrontACReplace        bool
	FrontACCombFins       bool

	// Siding - Right
	RightSiding1ReplaceSF *int
	RightSiding1PaintSF   *int
	RightSiding2ReplaceSF *int
	RightSiding2PaintSF   *int
	RightGuttersLF        *int
	RightGuttersPaint     bool
	RightWindows          *string
	RightScreens          *string
	RightDoors            *string
	RightACReplace        bool
	RightACCombFins       bool

	// Siding - Back
	BackSiding1ReplaceSF *int
	BackSiding1PaintSF   *int
	BackSiding2ReplaceSF *int
	BackSiding2PaintSF   *int
	BackGuttersLF        *int
	BackGuttersPaint     bool
	BackWindows          *string
	BackScreens          *string
	BackDoors            *string
	BackACReplace        bool
	BackACCombFins       bool

	// Siding - Left
	LeftSiding1ReplaceSF *int
	LeftSiding1PaintSF   *int
	LeftSiding2ReplaceSF *int
	LeftSiding2PaintSF   *int
	LeftGuttersLF        *int
	LeftGuttersPaint     bool
	LeftWindows          *string
	LeftScreens          *string
	LeftDoors            *string
	LeftACReplace        bool
	LeftACCombFins       bool

	// Additional
	AdditionalItemsMain  *string
	AdditionalItemsOther *string
	Notes                *string

	// Draft fields
	DraftStep *int
}

// CreateScopeSheet creates a new scope sheet for a claim
func (s *ScopeSheetService) CreateScopeSheet(ctx context.Context, claimID string, input CreateScopeSheetInput) (*models.ScopeSheet, error) {
	scopeSheetID := uuid.New().String()
	now := time.Now()

	query := `
		INSERT INTO scope_sheets (
			id, claim_id,
			-- Roof Main
			roof_type, roof_square_footage, roof_pitch, fascia_lf, fascia_paint,
			soffit_lf, soffit_paint, drip_edge_lf, drip_edge_paint,
			pipe_jacks_count, pipe_jacks_paint, ex_vents_count, ex_vents_paint,
			turbines_count, turbines_paint, furnaces_count, furnaces_paint,
			power_vents_count, power_vents_paint, ridge_lf, satellites_count,
			step_flashing_lf, chimney_flashing, rain_diverter_lf,
			skylights_count, skylights_damaged,
			-- Roof Other
			roof_other_type, roof_other_pitch, roof_other_fascia_lf, roof_other_fascia_paint,
			roof_other_soffit_lf, roof_other_soffit_paint, roof_other_drip_edge_lf, roof_other_drip_edge_paint,
			roof_other_pipe_jacks_count, roof_other_pipe_jacks_paint, roof_other_ex_vents_count, roof_other_ex_vents_paint,
			roof_other_turbines_count, roof_other_turbines_paint, roof_other_furnaces_count, roof_other_furnaces_paint,
			roof_other_power_vents_count, roof_other_power_vents_paint, roof_other_ridge_lf, roof_other_satellites_count,
			roof_other_step_flashing_lf, roof_other_chimney_flashing, roof_other_rain_diverter_lf,
			roof_other_skylights_count, roof_other_skylights_damaged,
			-- Dimensions
			porch_paint, patio_paint, fence,
			-- Siding - Front
			front_siding_1_replace_sf, front_siding_1_paint_sf, front_siding_2_replace_sf, front_siding_2_paint_sf,
			front_gutters_lf, front_gutters_paint, front_windows, front_screens, front_doors,
			front_ac_replace, front_ac_comb_fins,
			-- Siding - Right
			right_siding_1_replace_sf, right_siding_1_paint_sf, right_siding_2_replace_sf, right_siding_2_paint_sf,
			right_gutters_lf, right_gutters_paint, right_windows, right_screens, right_doors,
			right_ac_replace, right_ac_comb_fins,
			-- Siding - Back
			back_siding_1_replace_sf, back_siding_1_paint_sf, back_siding_2_replace_sf, back_siding_2_paint_sf,
			back_gutters_lf, back_gutters_paint, back_windows, back_screens, back_doors,
			back_ac_replace, back_ac_comb_fins,
			-- Siding - Left
			left_siding_1_replace_sf, left_siding_1_paint_sf, left_siding_2_replace_sf, left_siding_2_paint_sf,
			left_gutters_lf, left_gutters_paint, left_windows, left_screens, left_doors,
			left_ac_replace, left_ac_comb_fins,
			-- Additional
			additional_items_main, additional_items_other, notes,
			-- Metadata
			submitted_at, created_at, updated_at
		)
		VALUES (
			$1, $2,
			-- Roof Main (27 fields)
			$3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28,
			-- Roof Other (25 fields)
			$29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46, $47, $48, $49, $50, $51, $52, $53,
			-- Dimensions (3 fields)
			$54, $55, $56,
			-- Siding - Front (11 fields)
			$57, $58, $59, $60, $61, $62, $63, $64, $65, $66, $67,
			-- Siding - Right (11 fields)
			$68, $69, $70, $71, $72, $73, $74, $75, $76, $77, $78,
			-- Siding - Back (11 fields)
			$79, $80, $81, $82, $83, $84, $85, $86, $87, $88, $89,
			-- Siding - Left (11 fields)
			$90, $91, $92, $93, $94, $95, $96, $97, $98, $99, $100,
			-- Additional (3 fields)
			$101, $102, $103,
			-- Metadata (3 fields)
			$104, $105, $106
		)
		RETURNING
			id, claim_id,
			-- Roof Main
			roof_type, roof_square_footage, roof_pitch, fascia_lf, fascia_paint,
			soffit_lf, soffit_paint, drip_edge_lf, drip_edge_paint,
			pipe_jacks_count, pipe_jacks_paint, ex_vents_count, ex_vents_paint,
			turbines_count, turbines_paint, furnaces_count, furnaces_paint,
			power_vents_count, power_vents_paint, ridge_lf, satellites_count,
			step_flashing_lf, chimney_flashing, rain_diverter_lf,
			skylights_count, skylights_damaged,
			-- Roof Other
			roof_other_type, roof_other_pitch, roof_other_fascia_lf, roof_other_fascia_paint,
			roof_other_soffit_lf, roof_other_soffit_paint, roof_other_drip_edge_lf, roof_other_drip_edge_paint,
			roof_other_pipe_jacks_count, roof_other_pipe_jacks_paint, roof_other_ex_vents_count, roof_other_ex_vents_paint,
			roof_other_turbines_count, roof_other_turbines_paint, roof_other_furnaces_count, roof_other_furnaces_paint,
			roof_other_power_vents_count, roof_other_power_vents_paint, roof_other_ridge_lf, roof_other_satellites_count,
			roof_other_step_flashing_lf, roof_other_chimney_flashing, roof_other_rain_diverter_lf,
			roof_other_skylights_count, roof_other_skylights_damaged,
			-- Dimensions
			porch_paint, patio_paint, fence,
			-- Siding - Front
			front_siding_1_replace_sf, front_siding_1_paint_sf, front_siding_2_replace_sf, front_siding_2_paint_sf,
			front_gutters_lf, front_gutters_paint, front_windows, front_screens, front_doors,
			front_ac_replace, front_ac_comb_fins,
			-- Siding - Right
			right_siding_1_replace_sf, right_siding_1_paint_sf, right_siding_2_replace_sf, right_siding_2_paint_sf,
			right_gutters_lf, right_gutters_paint, right_windows, right_screens, right_doors,
			right_ac_replace, right_ac_comb_fins,
			-- Siding - Back
			back_siding_1_replace_sf, back_siding_1_paint_sf, back_siding_2_replace_sf, back_siding_2_paint_sf,
			back_gutters_lf, back_gutters_paint, back_windows, back_screens, back_doors,
			back_ac_replace, back_ac_comb_fins,
			-- Siding - Left
			left_siding_1_replace_sf, left_siding_1_paint_sf, left_siding_2_replace_sf, left_siding_2_paint_sf,
			left_gutters_lf, left_gutters_paint, left_windows, left_screens, left_doors,
			left_ac_replace, left_ac_comb_fins,
			-- Additional
			additional_items_main, additional_items_other, notes,
			-- Metadata
			submitted_at, created_at, updated_at
	`

	var scopeSheet models.ScopeSheet
	err := s.db.QueryRowContext(
		ctx,
		query,
		scopeSheetID, claimID,
		// Roof Main (27 values)
		input.RoofType, input.RoofSquareFootage, input.RoofPitch, input.FasciaLF, input.FasciaPaint,
		input.SoffitLF, input.SoffitPaint, input.DripEdgeLF, input.DripEdgePaint,
		input.PipeJacksCount, input.PipeJacksPaint, input.ExVentsCount, input.ExVentsPaint,
		input.TurbinesCount, input.TurbinesPaint, input.FurnacesCount, input.FurnacesPaint,
		input.PowerVentsCount, input.PowerVentsPaint, input.RidgeLF, input.SatellitesCount,
		input.StepFlashingLF, input.ChimneyFlashing, input.RainDiverterLF,
		input.SkylightsCount, input.SkylightsDamaged,
		// Roof Other (25 values)
		input.RoofOtherType, input.RoofOtherPitch, input.RoofOtherFasciaLF, input.RoofOtherFasciaPaint,
		input.RoofOtherSoffitLF, input.RoofOtherSoffitPaint, input.RoofOtherDripEdgeLF, input.RoofOtherDripEdgePaint,
		input.RoofOtherPipeJacksCount, input.RoofOtherPipeJacksPaint, input.RoofOtherExVentsCount, input.RoofOtherExVentsPaint,
		input.RoofOtherTurbinesCount, input.RoofOtherTurbinesPaint, input.RoofOtherFurnacesCount, input.RoofOtherFurnacesPaint,
		input.RoofOtherPowerVentsCount, input.RoofOtherPowerVentsPaint, input.RoofOtherRidgeLF, input.RoofOtherSatellitesCount,
		input.RoofOtherStepFlashingLF, input.RoofOtherChimneyFlashing, input.RoofOtherRainDiverterLF,
		input.RoofOtherSkylightsCount, input.RoofOtherSkylightsDamaged,
		// Dimensions (3 values)
		input.PorchPaint, input.PatioPaint, input.Fence,
		// Siding - Front (11 values)
		input.FrontSiding1ReplaceSF, input.FrontSiding1PaintSF, input.FrontSiding2ReplaceSF, input.FrontSiding2PaintSF,
		input.FrontGuttersLF, input.FrontGuttersPaint, input.FrontWindows, input.FrontScreens, input.FrontDoors,
		input.FrontACReplace, input.FrontACCombFins,
		// Siding - Right (11 values)
		input.RightSiding1ReplaceSF, input.RightSiding1PaintSF, input.RightSiding2ReplaceSF, input.RightSiding2PaintSF,
		input.RightGuttersLF, input.RightGuttersPaint, input.RightWindows, input.RightScreens, input.RightDoors,
		input.RightACReplace, input.RightACCombFins,
		// Siding - Back (11 values)
		input.BackSiding1ReplaceSF, input.BackSiding1PaintSF, input.BackSiding2ReplaceSF, input.BackSiding2PaintSF,
		input.BackGuttersLF, input.BackGuttersPaint, input.BackWindows, input.BackScreens, input.BackDoors,
		input.BackACReplace, input.BackACCombFins,
		// Siding - Left (11 values)
		input.LeftSiding1ReplaceSF, input.LeftSiding1PaintSF, input.LeftSiding2ReplaceSF, input.LeftSiding2PaintSF,
		input.LeftGuttersLF, input.LeftGuttersPaint, input.LeftWindows, input.LeftScreens, input.LeftDoors,
		input.LeftACReplace, input.LeftACCombFins,
		// Additional (3 values)
		input.AdditionalItemsMain, input.AdditionalItemsOther, input.Notes,
		// Metadata (3 values)
		nil, now, now,
	).Scan(
		&scopeSheet.ID, &scopeSheet.ClaimID,
		// Roof Main
		&scopeSheet.RoofType, &scopeSheet.RoofSquareFootage, &scopeSheet.RoofPitch, &scopeSheet.FasciaLF, &scopeSheet.FasciaPaint,
		&scopeSheet.SoffitLF, &scopeSheet.SoffitPaint, &scopeSheet.DripEdgeLF, &scopeSheet.DripEdgePaint,
		&scopeSheet.PipeJacksCount, &scopeSheet.PipeJacksPaint, &scopeSheet.ExVentsCount, &scopeSheet.ExVentsPaint,
		&scopeSheet.TurbinesCount, &scopeSheet.TurbinesPaint, &scopeSheet.FurnacesCount, &scopeSheet.FurnacesPaint,
		&scopeSheet.PowerVentsCount, &scopeSheet.PowerVentsPaint, &scopeSheet.RidgeLF, &scopeSheet.SatellitesCount,
		&scopeSheet.StepFlashingLF, &scopeSheet.ChimneyFlashing, &scopeSheet.RainDiverterLF,
		&scopeSheet.SkylightsCount, &scopeSheet.SkylightsDamaged,
		// Roof Other
		&scopeSheet.RoofOtherType, &scopeSheet.RoofOtherPitch, &scopeSheet.RoofOtherFasciaLF, &scopeSheet.RoofOtherFasciaPaint,
		&scopeSheet.RoofOtherSoffitLF, &scopeSheet.RoofOtherSoffitPaint, &scopeSheet.RoofOtherDripEdgeLF, &scopeSheet.RoofOtherDripEdgePaint,
		&scopeSheet.RoofOtherPipeJacksCount, &scopeSheet.RoofOtherPipeJacksPaint, &scopeSheet.RoofOtherExVentsCount, &scopeSheet.RoofOtherExVentsPaint,
		&scopeSheet.RoofOtherTurbinesCount, &scopeSheet.RoofOtherTurbinesPaint, &scopeSheet.RoofOtherFurnacesCount, &scopeSheet.RoofOtherFurnacesPaint,
		&scopeSheet.RoofOtherPowerVentsCount, &scopeSheet.RoofOtherPowerVentsPaint, &scopeSheet.RoofOtherRidgeLF, &scopeSheet.RoofOtherSatellitesCount,
		&scopeSheet.RoofOtherStepFlashingLF, &scopeSheet.RoofOtherChimneyFlashing, &scopeSheet.RoofOtherRainDiverterLF,
		&scopeSheet.RoofOtherSkylightsCount, &scopeSheet.RoofOtherSkylightsDamaged,
		// Dimensions
		&scopeSheet.PorchPaint, &scopeSheet.PatioPaint, &scopeSheet.Fence,
		// Siding - Front
		&scopeSheet.FrontSiding1ReplaceSF, &scopeSheet.FrontSiding1PaintSF, &scopeSheet.FrontSiding2ReplaceSF, &scopeSheet.FrontSiding2PaintSF,
		&scopeSheet.FrontGuttersLF, &scopeSheet.FrontGuttersPaint, &scopeSheet.FrontWindows, &scopeSheet.FrontScreens, &scopeSheet.FrontDoors,
		&scopeSheet.FrontACReplace, &scopeSheet.FrontACCombFins,
		// Siding - Right
		&scopeSheet.RightSiding1ReplaceSF, &scopeSheet.RightSiding1PaintSF, &scopeSheet.RightSiding2ReplaceSF, &scopeSheet.RightSiding2PaintSF,
		&scopeSheet.RightGuttersLF, &scopeSheet.RightGuttersPaint, &scopeSheet.RightWindows, &scopeSheet.RightScreens, &scopeSheet.RightDoors,
		&scopeSheet.RightACReplace, &scopeSheet.RightACCombFins,
		// Siding - Back
		&scopeSheet.BackSiding1ReplaceSF, &scopeSheet.BackSiding1PaintSF, &scopeSheet.BackSiding2ReplaceSF, &scopeSheet.BackSiding2PaintSF,
		&scopeSheet.BackGuttersLF, &scopeSheet.BackGuttersPaint, &scopeSheet.BackWindows, &scopeSheet.BackScreens, &scopeSheet.BackDoors,
		&scopeSheet.BackACReplace, &scopeSheet.BackACCombFins,
		// Siding - Left
		&scopeSheet.LeftSiding1ReplaceSF, &scopeSheet.LeftSiding1PaintSF, &scopeSheet.LeftSiding2ReplaceSF, &scopeSheet.LeftSiding2PaintSF,
		&scopeSheet.LeftGuttersLF, &scopeSheet.LeftGuttersPaint, &scopeSheet.LeftWindows, &scopeSheet.LeftScreens, &scopeSheet.LeftDoors,
		&scopeSheet.LeftACReplace, &scopeSheet.LeftACCombFins,
		// Additional
		&scopeSheet.AdditionalItemsMain, &scopeSheet.AdditionalItemsOther, &scopeSheet.Notes,
		// Metadata
		&scopeSheet.SubmittedAt, &scopeSheet.CreatedAt, &scopeSheet.UpdatedAt,
	)

	if err != nil {
		return nil, fmt.Errorf("failed to create scope sheet: %w", err)
	}

	return &scopeSheet, nil
}

// GetScopeSheetByClaimID retrieves a scope sheet by claim ID
// Returns nil if not found (not an error)
func (s *ScopeSheetService) GetScopeSheetByClaimID(ctx context.Context, claimID string) (*models.ScopeSheet, error) {
	query := `
		SELECT
			id, claim_id,
			-- Roof Main
			roof_type, roof_square_footage, roof_pitch, fascia_lf, fascia_paint,
			soffit_lf, soffit_paint, drip_edge_lf, drip_edge_paint,
			pipe_jacks_count, pipe_jacks_paint, ex_vents_count, ex_vents_paint,
			turbines_count, turbines_paint, furnaces_count, furnaces_paint,
			power_vents_count, power_vents_paint, ridge_lf, satellites_count,
			step_flashing_lf, chimney_flashing, rain_diverter_lf,
			skylights_count, skylights_damaged,
			-- Roof Other
			roof_other_type, roof_other_pitch, roof_other_fascia_lf, roof_other_fascia_paint,
			roof_other_soffit_lf, roof_other_soffit_paint, roof_other_drip_edge_lf, roof_other_drip_edge_paint,
			roof_other_pipe_jacks_count, roof_other_pipe_jacks_paint, roof_other_ex_vents_count, roof_other_ex_vents_paint,
			roof_other_turbines_count, roof_other_turbines_paint, roof_other_furnaces_count, roof_other_furnaces_paint,
			roof_other_power_vents_count, roof_other_power_vents_paint, roof_other_ridge_lf, roof_other_satellites_count,
			roof_other_step_flashing_lf, roof_other_chimney_flashing, roof_other_rain_diverter_lf,
			roof_other_skylights_count, roof_other_skylights_damaged,
			-- Dimensions
			porch_paint, patio_paint, fence,
			-- Siding - Front
			front_siding_1_replace_sf, front_siding_1_paint_sf, front_siding_2_replace_sf, front_siding_2_paint_sf,
			front_gutters_lf, front_gutters_paint, front_windows, front_screens, front_doors,
			front_ac_replace, front_ac_comb_fins,
			-- Siding - Right
			right_siding_1_replace_sf, right_siding_1_paint_sf, right_siding_2_replace_sf, right_siding_2_paint_sf,
			right_gutters_lf, right_gutters_paint, right_windows, right_screens, right_doors,
			right_ac_replace, right_ac_comb_fins,
			-- Siding - Back
			back_siding_1_replace_sf, back_siding_1_paint_sf, back_siding_2_replace_sf, back_siding_2_paint_sf,
			back_gutters_lf, back_gutters_paint, back_windows, back_screens, back_doors,
			back_ac_replace, back_ac_comb_fins,
			-- Siding - Left
			left_siding_1_replace_sf, left_siding_1_paint_sf, left_siding_2_replace_sf, left_siding_2_paint_sf,
			left_gutters_lf, left_gutters_paint, left_windows, left_screens, left_doors,
			left_ac_replace, left_ac_comb_fins,
			-- Additional
			additional_items_main, additional_items_other, notes,
			-- Metadata
			submitted_at, created_at, updated_at
		FROM scope_sheets
		WHERE claim_id = $1
	`

	var scopeSheet models.ScopeSheet
	err := s.db.QueryRowContext(ctx, query, claimID).Scan(
		&scopeSheet.ID, &scopeSheet.ClaimID,
		// Roof Main
		&scopeSheet.RoofType, &scopeSheet.RoofSquareFootage, &scopeSheet.RoofPitch, &scopeSheet.FasciaLF, &scopeSheet.FasciaPaint,
		&scopeSheet.SoffitLF, &scopeSheet.SoffitPaint, &scopeSheet.DripEdgeLF, &scopeSheet.DripEdgePaint,
		&scopeSheet.PipeJacksCount, &scopeSheet.PipeJacksPaint, &scopeSheet.ExVentsCount, &scopeSheet.ExVentsPaint,
		&scopeSheet.TurbinesCount, &scopeSheet.TurbinesPaint, &scopeSheet.FurnacesCount, &scopeSheet.FurnacesPaint,
		&scopeSheet.PowerVentsCount, &scopeSheet.PowerVentsPaint, &scopeSheet.RidgeLF, &scopeSheet.SatellitesCount,
		&scopeSheet.StepFlashingLF, &scopeSheet.ChimneyFlashing, &scopeSheet.RainDiverterLF,
		&scopeSheet.SkylightsCount, &scopeSheet.SkylightsDamaged,
		// Roof Other
		&scopeSheet.RoofOtherType, &scopeSheet.RoofOtherPitch, &scopeSheet.RoofOtherFasciaLF, &scopeSheet.RoofOtherFasciaPaint,
		&scopeSheet.RoofOtherSoffitLF, &scopeSheet.RoofOtherSoffitPaint, &scopeSheet.RoofOtherDripEdgeLF, &scopeSheet.RoofOtherDripEdgePaint,
		&scopeSheet.RoofOtherPipeJacksCount, &scopeSheet.RoofOtherPipeJacksPaint, &scopeSheet.RoofOtherExVentsCount, &scopeSheet.RoofOtherExVentsPaint,
		&scopeSheet.RoofOtherTurbinesCount, &scopeSheet.RoofOtherTurbinesPaint, &scopeSheet.RoofOtherFurnacesCount, &scopeSheet.RoofOtherFurnacesPaint,
		&scopeSheet.RoofOtherPowerVentsCount, &scopeSheet.RoofOtherPowerVentsPaint, &scopeSheet.RoofOtherRidgeLF, &scopeSheet.RoofOtherSatellitesCount,
		&scopeSheet.RoofOtherStepFlashingLF, &scopeSheet.RoofOtherChimneyFlashing, &scopeSheet.RoofOtherRainDiverterLF,
		&scopeSheet.RoofOtherSkylightsCount, &scopeSheet.RoofOtherSkylightsDamaged,
		// Dimensions
		&scopeSheet.PorchPaint, &scopeSheet.PatioPaint, &scopeSheet.Fence,
		// Siding - Front
		&scopeSheet.FrontSiding1ReplaceSF, &scopeSheet.FrontSiding1PaintSF, &scopeSheet.FrontSiding2ReplaceSF, &scopeSheet.FrontSiding2PaintSF,
		&scopeSheet.FrontGuttersLF, &scopeSheet.FrontGuttersPaint, &scopeSheet.FrontWindows, &scopeSheet.FrontScreens, &scopeSheet.FrontDoors,
		&scopeSheet.FrontACReplace, &scopeSheet.FrontACCombFins,
		// Siding - Right
		&scopeSheet.RightSiding1ReplaceSF, &scopeSheet.RightSiding1PaintSF, &scopeSheet.RightSiding2ReplaceSF, &scopeSheet.RightSiding2PaintSF,
		&scopeSheet.RightGuttersLF, &scopeSheet.RightGuttersPaint, &scopeSheet.RightWindows, &scopeSheet.RightScreens, &scopeSheet.RightDoors,
		&scopeSheet.RightACReplace, &scopeSheet.RightACCombFins,
		// Siding - Back
		&scopeSheet.BackSiding1ReplaceSF, &scopeSheet.BackSiding1PaintSF, &scopeSheet.BackSiding2ReplaceSF, &scopeSheet.BackSiding2PaintSF,
		&scopeSheet.BackGuttersLF, &scopeSheet.BackGuttersPaint, &scopeSheet.BackWindows, &scopeSheet.BackScreens, &scopeSheet.BackDoors,
		&scopeSheet.BackACReplace, &scopeSheet.BackACCombFins,
		// Siding - Left
		&scopeSheet.LeftSiding1ReplaceSF, &scopeSheet.LeftSiding1PaintSF, &scopeSheet.LeftSiding2ReplaceSF, &scopeSheet.LeftSiding2PaintSF,
		&scopeSheet.LeftGuttersLF, &scopeSheet.LeftGuttersPaint, &scopeSheet.LeftWindows, &scopeSheet.LeftScreens, &scopeSheet.LeftDoors,
		&scopeSheet.LeftACReplace, &scopeSheet.LeftACCombFins,
		// Additional
		&scopeSheet.AdditionalItemsMain, &scopeSheet.AdditionalItemsOther, &scopeSheet.Notes,
		// Metadata
		&scopeSheet.SubmittedAt, &scopeSheet.CreatedAt, &scopeSheet.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, nil // Not found - return nil without error
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get scope sheet: %w", err)
	}

	return &scopeSheet, nil
}

// SubmitScopeSheet marks a scope sheet as submitted by setting submitted_at to NOW()
func (s *ScopeSheetService) SubmitScopeSheet(ctx context.Context, scopeSheetID string) error {
	query := `
		UPDATE scope_sheets
		SET submitted_at = NOW(), updated_at = NOW()
		WHERE id = $1
	`

	result, err := s.db.ExecContext(ctx, query, scopeSheetID)
	if err != nil {
		return fmt.Errorf("failed to submit scope sheet: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to check rows affected: %w", err)
	}

	if rowsAffected == 0 {
		return fmt.Errorf("scope sheet not found")
	}

	return nil
}

// validateMagicLinkToken validates a magic link token and returns the associated claim ID
// Returns ErrTokenInvalid if token is not found, expired, or inactive
func (s *ScopeSheetService) validateMagicLinkToken(ctx context.Context, token string) (string, error) {
	var claimID string
	query := `SELECT claim_id FROM magic_links WHERE token = $1 AND status = 'active' AND expires_at > NOW()`
	err := s.db.QueryRowContext(ctx, query, token).Scan(&claimID)
	if err == sql.ErrNoRows {
		return "", ErrTokenInvalid
	}
	if err != nil {
		return "", fmt.Errorf("failed to validate token: %w", err)
	}
	return claimID, nil
}

// SaveScopeDraft saves or updates a draft scope sheet for a claim (UPSERT)
// Only one draft per claim is allowed - enforced by unique partial index
// Uses PostgreSQL's ON CONFLICT for atomic UPSERT to prevent race conditions
func (s *ScopeSheetService) SaveScopeDraft(ctx context.Context, token string, draft *CreateScopeSheetInput) (*models.ScopeSheet, error) {
	// Step 1: Validate token and get claim ID
	claimID, err := s.validateMagicLinkToken(ctx, token)
	if err != nil {
		return nil, err
	}

	// Step 2: Validate draft_step if provided
	if draft.DraftStep != nil {
		if *draft.DraftStep < 1 || *draft.DraftStep > 10 {
			return nil, ErrInvalidDraftStep
		}
	}

	now := time.Now()
	scopeSheetID := uuid.New().String()

	// Step 3: Atomic UPSERT using ON CONFLICT
	// The unique partial index on (claim_id) WHERE is_draft = true ensures atomicity
	query := `
		INSERT INTO scope_sheets (
			id, claim_id,
			-- Roof Main
			roof_type, roof_square_footage, roof_pitch, fascia_lf, fascia_paint,
			soffit_lf, soffit_paint, drip_edge_lf, drip_edge_paint,
			pipe_jacks_count, pipe_jacks_paint, ex_vents_count, ex_vents_paint,
			turbines_count, turbines_paint, furnaces_count, furnaces_paint,
			power_vents_count, power_vents_paint, ridge_lf, satellites_count,
			step_flashing_lf, chimney_flashing, rain_diverter_lf,
			skylights_count, skylights_damaged,
			-- Roof Other
			roof_other_type, roof_other_pitch, roof_other_fascia_lf, roof_other_fascia_paint,
			roof_other_soffit_lf, roof_other_soffit_paint, roof_other_drip_edge_lf, roof_other_drip_edge_paint,
			roof_other_pipe_jacks_count, roof_other_pipe_jacks_paint, roof_other_ex_vents_count, roof_other_ex_vents_paint,
			roof_other_turbines_count, roof_other_turbines_paint, roof_other_furnaces_count, roof_other_furnaces_paint,
			roof_other_power_vents_count, roof_other_power_vents_paint, roof_other_ridge_lf, roof_other_satellites_count,
			roof_other_step_flashing_lf, roof_other_chimney_flashing, roof_other_rain_diverter_lf,
			roof_other_skylights_count, roof_other_skylights_damaged,
			-- Dimensions
			porch_paint, patio_paint, fence,
			-- Siding - Front
			front_siding_1_replace_sf, front_siding_1_paint_sf, front_siding_2_replace_sf, front_siding_2_paint_sf,
			front_gutters_lf, front_gutters_paint, front_windows, front_screens, front_doors,
			front_ac_replace, front_ac_comb_fins,
			-- Siding - Right
			right_siding_1_replace_sf, right_siding_1_paint_sf, right_siding_2_replace_sf, right_siding_2_paint_sf,
			right_gutters_lf, right_gutters_paint, right_windows, right_screens, right_doors,
			right_ac_replace, right_ac_comb_fins,
			-- Siding - Back
			back_siding_1_replace_sf, back_siding_1_paint_sf, back_siding_2_replace_sf, back_siding_2_paint_sf,
			back_gutters_lf, back_gutters_paint, back_windows, back_screens, back_doors,
			back_ac_replace, back_ac_comb_fins,
			-- Siding - Left
			left_siding_1_replace_sf, left_siding_1_paint_sf, left_siding_2_replace_sf, left_siding_2_paint_sf,
			left_gutters_lf, left_gutters_paint, left_windows, left_screens, left_doors,
			left_ac_replace, left_ac_comb_fins,
			-- Additional
			additional_items_main, additional_items_other, notes,
			-- Draft and metadata
			is_draft, draft_step, draft_saved_at, submitted_at, created_at, updated_at
		)
		VALUES (
			$1, $2,
			-- Roof Main (26 fields)
			$3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28,
			-- Roof Other (25 fields)
			$29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46, $47, $48, $49, $50, $51, $52, $53,
			-- Dimensions (3 fields)
			$54, $55, $56,
			-- Siding - Front (11 fields)
			$57, $58, $59, $60, $61, $62, $63, $64, $65, $66, $67,
			-- Siding - Right (11 fields)
			$68, $69, $70, $71, $72, $73, $74, $75, $76, $77, $78,
			-- Siding - Back (11 fields)
			$79, $80, $81, $82, $83, $84, $85, $86, $87, $88, $89,
			-- Siding - Left (11 fields)
			$90, $91, $92, $93, $94, $95, $96, $97, $98, $99, $100,
			-- Additional (3 fields)
			$101, $102, $103,
			-- Draft and metadata (6 fields)
			$104, $105, $106, $107, $108, $109
		)
		ON CONFLICT (claim_id) WHERE is_draft = true
		DO UPDATE SET
			-- Roof Main
			roof_type = EXCLUDED.roof_type,
			roof_square_footage = EXCLUDED.roof_square_footage,
			roof_pitch = EXCLUDED.roof_pitch,
			fascia_lf = EXCLUDED.fascia_lf,
			fascia_paint = EXCLUDED.fascia_paint,
			soffit_lf = EXCLUDED.soffit_lf,
			soffit_paint = EXCLUDED.soffit_paint,
			drip_edge_lf = EXCLUDED.drip_edge_lf,
			drip_edge_paint = EXCLUDED.drip_edge_paint,
			pipe_jacks_count = EXCLUDED.pipe_jacks_count,
			pipe_jacks_paint = EXCLUDED.pipe_jacks_paint,
			ex_vents_count = EXCLUDED.ex_vents_count,
			ex_vents_paint = EXCLUDED.ex_vents_paint,
			turbines_count = EXCLUDED.turbines_count,
			turbines_paint = EXCLUDED.turbines_paint,
			furnaces_count = EXCLUDED.furnaces_count,
			furnaces_paint = EXCLUDED.furnaces_paint,
			power_vents_count = EXCLUDED.power_vents_count,
			power_vents_paint = EXCLUDED.power_vents_paint,
			ridge_lf = EXCLUDED.ridge_lf,
			satellites_count = EXCLUDED.satellites_count,
			step_flashing_lf = EXCLUDED.step_flashing_lf,
			chimney_flashing = EXCLUDED.chimney_flashing,
			rain_diverter_lf = EXCLUDED.rain_diverter_lf,
			skylights_count = EXCLUDED.skylights_count,
			skylights_damaged = EXCLUDED.skylights_damaged,
			-- Roof Other
			roof_other_type = EXCLUDED.roof_other_type,
			roof_other_pitch = EXCLUDED.roof_other_pitch,
			roof_other_fascia_lf = EXCLUDED.roof_other_fascia_lf,
			roof_other_fascia_paint = EXCLUDED.roof_other_fascia_paint,
			roof_other_soffit_lf = EXCLUDED.roof_other_soffit_lf,
			roof_other_soffit_paint = EXCLUDED.roof_other_soffit_paint,
			roof_other_drip_edge_lf = EXCLUDED.roof_other_drip_edge_lf,
			roof_other_drip_edge_paint = EXCLUDED.roof_other_drip_edge_paint,
			roof_other_pipe_jacks_count = EXCLUDED.roof_other_pipe_jacks_count,
			roof_other_pipe_jacks_paint = EXCLUDED.roof_other_pipe_jacks_paint,
			roof_other_ex_vents_count = EXCLUDED.roof_other_ex_vents_count,
			roof_other_ex_vents_paint = EXCLUDED.roof_other_ex_vents_paint,
			roof_other_turbines_count = EXCLUDED.roof_other_turbines_count,
			roof_other_turbines_paint = EXCLUDED.roof_other_turbines_paint,
			roof_other_furnaces_count = EXCLUDED.roof_other_furnaces_count,
			roof_other_furnaces_paint = EXCLUDED.roof_other_furnaces_paint,
			roof_other_power_vents_count = EXCLUDED.roof_other_power_vents_count,
			roof_other_power_vents_paint = EXCLUDED.roof_other_power_vents_paint,
			roof_other_ridge_lf = EXCLUDED.roof_other_ridge_lf,
			roof_other_satellites_count = EXCLUDED.roof_other_satellites_count,
			roof_other_step_flashing_lf = EXCLUDED.roof_other_step_flashing_lf,
			roof_other_chimney_flashing = EXCLUDED.roof_other_chimney_flashing,
			roof_other_rain_diverter_lf = EXCLUDED.roof_other_rain_diverter_lf,
			roof_other_skylights_count = EXCLUDED.roof_other_skylights_count,
			roof_other_skylights_damaged = EXCLUDED.roof_other_skylights_damaged,
			-- Dimensions
			porch_paint = EXCLUDED.porch_paint,
			patio_paint = EXCLUDED.patio_paint,
			fence = EXCLUDED.fence,
			-- Siding - Front
			front_siding_1_replace_sf = EXCLUDED.front_siding_1_replace_sf,
			front_siding_1_paint_sf = EXCLUDED.front_siding_1_paint_sf,
			front_siding_2_replace_sf = EXCLUDED.front_siding_2_replace_sf,
			front_siding_2_paint_sf = EXCLUDED.front_siding_2_paint_sf,
			front_gutters_lf = EXCLUDED.front_gutters_lf,
			front_gutters_paint = EXCLUDED.front_gutters_paint,
			front_windows = EXCLUDED.front_windows,
			front_screens = EXCLUDED.front_screens,
			front_doors = EXCLUDED.front_doors,
			front_ac_replace = EXCLUDED.front_ac_replace,
			front_ac_comb_fins = EXCLUDED.front_ac_comb_fins,
			-- Siding - Right
			right_siding_1_replace_sf = EXCLUDED.right_siding_1_replace_sf,
			right_siding_1_paint_sf = EXCLUDED.right_siding_1_paint_sf,
			right_siding_2_replace_sf = EXCLUDED.right_siding_2_replace_sf,
			right_siding_2_paint_sf = EXCLUDED.right_siding_2_paint_sf,
			right_gutters_lf = EXCLUDED.right_gutters_lf,
			right_gutters_paint = EXCLUDED.right_gutters_paint,
			right_windows = EXCLUDED.right_windows,
			right_screens = EXCLUDED.right_screens,
			right_doors = EXCLUDED.right_doors,
			right_ac_replace = EXCLUDED.right_ac_replace,
			right_ac_comb_fins = EXCLUDED.right_ac_comb_fins,
			-- Siding - Back
			back_siding_1_replace_sf = EXCLUDED.back_siding_1_replace_sf,
			back_siding_1_paint_sf = EXCLUDED.back_siding_1_paint_sf,
			back_siding_2_replace_sf = EXCLUDED.back_siding_2_replace_sf,
			back_siding_2_paint_sf = EXCLUDED.back_siding_2_paint_sf,
			back_gutters_lf = EXCLUDED.back_gutters_lf,
			back_gutters_paint = EXCLUDED.back_gutters_paint,
			back_windows = EXCLUDED.back_windows,
			back_screens = EXCLUDED.back_screens,
			back_doors = EXCLUDED.back_doors,
			back_ac_replace = EXCLUDED.back_ac_replace,
			back_ac_comb_fins = EXCLUDED.back_ac_comb_fins,
			-- Siding - Left
			left_siding_1_replace_sf = EXCLUDED.left_siding_1_replace_sf,
			left_siding_1_paint_sf = EXCLUDED.left_siding_1_paint_sf,
			left_siding_2_replace_sf = EXCLUDED.left_siding_2_replace_sf,
			left_siding_2_paint_sf = EXCLUDED.left_siding_2_paint_sf,
			left_gutters_lf = EXCLUDED.left_gutters_lf,
			left_gutters_paint = EXCLUDED.left_gutters_paint,
			left_windows = EXCLUDED.left_windows,
			left_screens = EXCLUDED.left_screens,
			left_doors = EXCLUDED.left_doors,
			left_ac_replace = EXCLUDED.left_ac_replace,
			left_ac_comb_fins = EXCLUDED.left_ac_comb_fins,
			-- Additional
			additional_items_main = EXCLUDED.additional_items_main,
			additional_items_other = EXCLUDED.additional_items_other,
			notes = EXCLUDED.notes,
			-- Draft fields
			draft_step = EXCLUDED.draft_step,
			draft_saved_at = EXCLUDED.draft_saved_at,
			updated_at = EXCLUDED.updated_at
		RETURNING
			id, claim_id,
			-- Roof Main
			roof_type, roof_square_footage, roof_pitch, fascia_lf, fascia_paint,
			soffit_lf, soffit_paint, drip_edge_lf, drip_edge_paint,
			pipe_jacks_count, pipe_jacks_paint, ex_vents_count, ex_vents_paint,
			turbines_count, turbines_paint, furnaces_count, furnaces_paint,
			power_vents_count, power_vents_paint, ridge_lf, satellites_count,
			step_flashing_lf, chimney_flashing, rain_diverter_lf,
			skylights_count, skylights_damaged,
			-- Roof Other
			roof_other_type, roof_other_pitch, roof_other_fascia_lf, roof_other_fascia_paint,
			roof_other_soffit_lf, roof_other_soffit_paint, roof_other_drip_edge_lf, roof_other_drip_edge_paint,
			roof_other_pipe_jacks_count, roof_other_pipe_jacks_paint, roof_other_ex_vents_count, roof_other_ex_vents_paint,
			roof_other_turbines_count, roof_other_turbines_paint, roof_other_furnaces_count, roof_other_furnaces_paint,
			roof_other_power_vents_count, roof_other_power_vents_paint, roof_other_ridge_lf, roof_other_satellites_count,
			roof_other_step_flashing_lf, roof_other_chimney_flashing, roof_other_rain_diverter_lf,
			roof_other_skylights_count, roof_other_skylights_damaged,
			-- Dimensions
			porch_paint, patio_paint, fence,
			-- Siding - Front
			front_siding_1_replace_sf, front_siding_1_paint_sf, front_siding_2_replace_sf, front_siding_2_paint_sf,
			front_gutters_lf, front_gutters_paint, front_windows, front_screens, front_doors,
			front_ac_replace, front_ac_comb_fins,
			-- Siding - Right
			right_siding_1_replace_sf, right_siding_1_paint_sf, right_siding_2_replace_sf, right_siding_2_paint_sf,
			right_gutters_lf, right_gutters_paint, right_windows, right_screens, right_doors,
			right_ac_replace, right_ac_comb_fins,
			-- Siding - Back
			back_siding_1_replace_sf, back_siding_1_paint_sf, back_siding_2_replace_sf, back_siding_2_paint_sf,
			back_gutters_lf, back_gutters_paint, back_windows, back_screens, back_doors,
			back_ac_replace, back_ac_comb_fins,
			-- Siding - Left
			left_siding_1_replace_sf, left_siding_1_paint_sf, left_siding_2_replace_sf, left_siding_2_paint_sf,
			left_gutters_lf, left_gutters_paint, left_windows, left_screens, left_doors,
			left_ac_replace, left_ac_comb_fins,
			-- Additional
			additional_items_main, additional_items_other, notes,
			-- Draft and metadata
			is_draft, draft_step, draft_saved_at, submitted_at, created_at, updated_at
	`

	var scopeSheet models.ScopeSheet
	err = s.db.QueryRowContext(
		ctx,
		query,
		scopeSheetID, claimID,
		// Roof Main (26 values)
		draft.RoofType, draft.RoofSquareFootage, draft.RoofPitch, draft.FasciaLF, draft.FasciaPaint,
		draft.SoffitLF, draft.SoffitPaint, draft.DripEdgeLF, draft.DripEdgePaint,
		draft.PipeJacksCount, draft.PipeJacksPaint, draft.ExVentsCount, draft.ExVentsPaint,
		draft.TurbinesCount, draft.TurbinesPaint, draft.FurnacesCount, draft.FurnacesPaint,
		draft.PowerVentsCount, draft.PowerVentsPaint, draft.RidgeLF, draft.SatellitesCount,
		draft.StepFlashingLF, draft.ChimneyFlashing, draft.RainDiverterLF,
		draft.SkylightsCount, draft.SkylightsDamaged,
		// Roof Other (25 values)
		draft.RoofOtherType, draft.RoofOtherPitch, draft.RoofOtherFasciaLF, draft.RoofOtherFasciaPaint,
		draft.RoofOtherSoffitLF, draft.RoofOtherSoffitPaint, draft.RoofOtherDripEdgeLF, draft.RoofOtherDripEdgePaint,
		draft.RoofOtherPipeJacksCount, draft.RoofOtherPipeJacksPaint, draft.RoofOtherExVentsCount, draft.RoofOtherExVentsPaint,
		draft.RoofOtherTurbinesCount, draft.RoofOtherTurbinesPaint, draft.RoofOtherFurnacesCount, draft.RoofOtherFurnacesPaint,
		draft.RoofOtherPowerVentsCount, draft.RoofOtherPowerVentsPaint, draft.RoofOtherRidgeLF, draft.RoofOtherSatellitesCount,
		draft.RoofOtherStepFlashingLF, draft.RoofOtherChimneyFlashing, draft.RoofOtherRainDiverterLF,
		draft.RoofOtherSkylightsCount, draft.RoofOtherSkylightsDamaged,
		// Dimensions (3 values)
		draft.PorchPaint, draft.PatioPaint, draft.Fence,
		// Siding - Front (11 values)
		draft.FrontSiding1ReplaceSF, draft.FrontSiding1PaintSF, draft.FrontSiding2ReplaceSF, draft.FrontSiding2PaintSF,
		draft.FrontGuttersLF, draft.FrontGuttersPaint, draft.FrontWindows, draft.FrontScreens, draft.FrontDoors,
		draft.FrontACReplace, draft.FrontACCombFins,
		// Siding - Right (11 values)
		draft.RightSiding1ReplaceSF, draft.RightSiding1PaintSF, draft.RightSiding2ReplaceSF, draft.RightSiding2PaintSF,
		draft.RightGuttersLF, draft.RightGuttersPaint, draft.RightWindows, draft.RightScreens, draft.RightDoors,
		draft.RightACReplace, draft.RightACCombFins,
		// Siding - Back (11 values)
		draft.BackSiding1ReplaceSF, draft.BackSiding1PaintSF, draft.BackSiding2ReplaceSF, draft.BackSiding2PaintSF,
		draft.BackGuttersLF, draft.BackGuttersPaint, draft.BackWindows, draft.BackScreens, draft.BackDoors,
		draft.BackACReplace, draft.BackACCombFins,
		// Siding - Left (11 values)
		draft.LeftSiding1ReplaceSF, draft.LeftSiding1PaintSF, draft.LeftSiding2ReplaceSF, draft.LeftSiding2PaintSF,
		draft.LeftGuttersLF, draft.LeftGuttersPaint, draft.LeftWindows, draft.LeftScreens, draft.LeftDoors,
		draft.LeftACReplace, draft.LeftACCombFins,
		// Additional (3 values)
		draft.AdditionalItemsMain, draft.AdditionalItemsOther, draft.Notes,
		// Draft and metadata (6 values)
		true, draft.DraftStep, now, nil, now, now,
	).Scan(
		&scopeSheet.ID, &scopeSheet.ClaimID,
		// Roof Main
		&scopeSheet.RoofType, &scopeSheet.RoofSquareFootage, &scopeSheet.RoofPitch, &scopeSheet.FasciaLF, &scopeSheet.FasciaPaint,
		&scopeSheet.SoffitLF, &scopeSheet.SoffitPaint, &scopeSheet.DripEdgeLF, &scopeSheet.DripEdgePaint,
		&scopeSheet.PipeJacksCount, &scopeSheet.PipeJacksPaint, &scopeSheet.ExVentsCount, &scopeSheet.ExVentsPaint,
		&scopeSheet.TurbinesCount, &scopeSheet.TurbinesPaint, &scopeSheet.FurnacesCount, &scopeSheet.FurnacesPaint,
		&scopeSheet.PowerVentsCount, &scopeSheet.PowerVentsPaint, &scopeSheet.RidgeLF, &scopeSheet.SatellitesCount,
		&scopeSheet.StepFlashingLF, &scopeSheet.ChimneyFlashing, &scopeSheet.RainDiverterLF,
		&scopeSheet.SkylightsCount, &scopeSheet.SkylightsDamaged,
		// Roof Other
		&scopeSheet.RoofOtherType, &scopeSheet.RoofOtherPitch, &scopeSheet.RoofOtherFasciaLF, &scopeSheet.RoofOtherFasciaPaint,
		&scopeSheet.RoofOtherSoffitLF, &scopeSheet.RoofOtherSoffitPaint, &scopeSheet.RoofOtherDripEdgeLF, &scopeSheet.RoofOtherDripEdgePaint,
		&scopeSheet.RoofOtherPipeJacksCount, &scopeSheet.RoofOtherPipeJacksPaint, &scopeSheet.RoofOtherExVentsCount, &scopeSheet.RoofOtherExVentsPaint,
		&scopeSheet.RoofOtherTurbinesCount, &scopeSheet.RoofOtherTurbinesPaint, &scopeSheet.RoofOtherFurnacesCount, &scopeSheet.RoofOtherFurnacesPaint,
		&scopeSheet.RoofOtherPowerVentsCount, &scopeSheet.RoofOtherPowerVentsPaint, &scopeSheet.RoofOtherRidgeLF, &scopeSheet.RoofOtherSatellitesCount,
		&scopeSheet.RoofOtherStepFlashingLF, &scopeSheet.RoofOtherChimneyFlashing, &scopeSheet.RoofOtherRainDiverterLF,
		&scopeSheet.RoofOtherSkylightsCount, &scopeSheet.RoofOtherSkylightsDamaged,
		// Dimensions
		&scopeSheet.PorchPaint, &scopeSheet.PatioPaint, &scopeSheet.Fence,
		// Siding - Front
		&scopeSheet.FrontSiding1ReplaceSF, &scopeSheet.FrontSiding1PaintSF, &scopeSheet.FrontSiding2ReplaceSF, &scopeSheet.FrontSiding2PaintSF,
		&scopeSheet.FrontGuttersLF, &scopeSheet.FrontGuttersPaint, &scopeSheet.FrontWindows, &scopeSheet.FrontScreens, &scopeSheet.FrontDoors,
		&scopeSheet.FrontACReplace, &scopeSheet.FrontACCombFins,
		// Siding - Right
		&scopeSheet.RightSiding1ReplaceSF, &scopeSheet.RightSiding1PaintSF, &scopeSheet.RightSiding2ReplaceSF, &scopeSheet.RightSiding2PaintSF,
		&scopeSheet.RightGuttersLF, &scopeSheet.RightGuttersPaint, &scopeSheet.RightWindows, &scopeSheet.RightScreens, &scopeSheet.RightDoors,
		&scopeSheet.RightACReplace, &scopeSheet.RightACCombFins,
		// Siding - Back
		&scopeSheet.BackSiding1ReplaceSF, &scopeSheet.BackSiding1PaintSF, &scopeSheet.BackSiding2ReplaceSF, &scopeSheet.BackSiding2PaintSF,
		&scopeSheet.BackGuttersLF, &scopeSheet.BackGuttersPaint, &scopeSheet.BackWindows, &scopeSheet.BackScreens, &scopeSheet.BackDoors,
		&scopeSheet.BackACReplace, &scopeSheet.BackACCombFins,
		// Siding - Left
		&scopeSheet.LeftSiding1ReplaceSF, &scopeSheet.LeftSiding1PaintSF, &scopeSheet.LeftSiding2ReplaceSF, &scopeSheet.LeftSiding2PaintSF,
		&scopeSheet.LeftGuttersLF, &scopeSheet.LeftGuttersPaint, &scopeSheet.LeftWindows, &scopeSheet.LeftScreens, &scopeSheet.LeftDoors,
		&scopeSheet.LeftACReplace, &scopeSheet.LeftACCombFins,
		// Additional
		&scopeSheet.AdditionalItemsMain, &scopeSheet.AdditionalItemsOther, &scopeSheet.Notes,
		// Draft and metadata
		&scopeSheet.IsDraft, &scopeSheet.DraftStep, &scopeSheet.DraftSavedAt,
		&scopeSheet.SubmittedAt, &scopeSheet.CreatedAt, &scopeSheet.UpdatedAt,
	)

	if err != nil {
		return nil, fmt.Errorf("failed to save draft: %w", err)
	}

	return &scopeSheet, nil
}

// GetScopeDraft retrieves the draft scope sheet for a claim via magic link token
// Returns ErrDraftNotFound if no draft exists
func (s *ScopeSheetService) GetScopeDraft(ctx context.Context, token string) (*models.ScopeSheet, error) {
	// Step 1: Validate token and get claim ID
	claimID, err := s.validateMagicLinkToken(ctx, token)
	if err != nil {
		return nil, err
	}

	// Step 2: Get the draft for this claim
	query := `
		SELECT
			id, claim_id,
			-- Roof Main
			roof_type, roof_square_footage, roof_pitch, fascia_lf, fascia_paint,
			soffit_lf, soffit_paint, drip_edge_lf, drip_edge_paint,
			pipe_jacks_count, pipe_jacks_paint, ex_vents_count, ex_vents_paint,
			turbines_count, turbines_paint, furnaces_count, furnaces_paint,
			power_vents_count, power_vents_paint, ridge_lf, satellites_count,
			step_flashing_lf, chimney_flashing, rain_diverter_lf,
			skylights_count, skylights_damaged,
			-- Roof Other
			roof_other_type, roof_other_pitch, roof_other_fascia_lf, roof_other_fascia_paint,
			roof_other_soffit_lf, roof_other_soffit_paint, roof_other_drip_edge_lf, roof_other_drip_edge_paint,
			roof_other_pipe_jacks_count, roof_other_pipe_jacks_paint, roof_other_ex_vents_count, roof_other_ex_vents_paint,
			roof_other_turbines_count, roof_other_turbines_paint, roof_other_furnaces_count, roof_other_furnaces_paint,
			roof_other_power_vents_count, roof_other_power_vents_paint, roof_other_ridge_lf, roof_other_satellites_count,
			roof_other_step_flashing_lf, roof_other_chimney_flashing, roof_other_rain_diverter_lf,
			roof_other_skylights_count, roof_other_skylights_damaged,
			-- Dimensions
			porch_paint, patio_paint, fence,
			-- Siding - Front
			front_siding_1_replace_sf, front_siding_1_paint_sf, front_siding_2_replace_sf, front_siding_2_paint_sf,
			front_gutters_lf, front_gutters_paint, front_windows, front_screens, front_doors,
			front_ac_replace, front_ac_comb_fins,
			-- Siding - Right
			right_siding_1_replace_sf, right_siding_1_paint_sf, right_siding_2_replace_sf, right_siding_2_paint_sf,
			right_gutters_lf, right_gutters_paint, right_windows, right_screens, right_doors,
			right_ac_replace, right_ac_comb_fins,
			-- Siding - Back
			back_siding_1_replace_sf, back_siding_1_paint_sf, back_siding_2_replace_sf, back_siding_2_paint_sf,
			back_gutters_lf, back_gutters_paint, back_windows, back_screens, back_doors,
			back_ac_replace, back_ac_comb_fins,
			-- Siding - Left
			left_siding_1_replace_sf, left_siding_1_paint_sf, left_siding_2_replace_sf, left_siding_2_paint_sf,
			left_gutters_lf, left_gutters_paint, left_windows, left_screens, left_doors,
			left_ac_replace, left_ac_comb_fins,
			-- Additional
			additional_items_main, additional_items_other, notes,
			-- Draft and metadata
			is_draft, draft_step, draft_saved_at, submitted_at, created_at, updated_at
		FROM scope_sheets
		WHERE claim_id = $1 AND is_draft = true
	`

	var scopeSheet models.ScopeSheet
	err = s.db.QueryRowContext(ctx, query, claimID).Scan(
		&scopeSheet.ID, &scopeSheet.ClaimID,
		// Roof Main
		&scopeSheet.RoofType, &scopeSheet.RoofSquareFootage, &scopeSheet.RoofPitch, &scopeSheet.FasciaLF, &scopeSheet.FasciaPaint,
		&scopeSheet.SoffitLF, &scopeSheet.SoffitPaint, &scopeSheet.DripEdgeLF, &scopeSheet.DripEdgePaint,
		&scopeSheet.PipeJacksCount, &scopeSheet.PipeJacksPaint, &scopeSheet.ExVentsCount, &scopeSheet.ExVentsPaint,
		&scopeSheet.TurbinesCount, &scopeSheet.TurbinesPaint, &scopeSheet.FurnacesCount, &scopeSheet.FurnacesPaint,
		&scopeSheet.PowerVentsCount, &scopeSheet.PowerVentsPaint, &scopeSheet.RidgeLF, &scopeSheet.SatellitesCount,
		&scopeSheet.StepFlashingLF, &scopeSheet.ChimneyFlashing, &scopeSheet.RainDiverterLF,
		&scopeSheet.SkylightsCount, &scopeSheet.SkylightsDamaged,
		// Roof Other
		&scopeSheet.RoofOtherType, &scopeSheet.RoofOtherPitch, &scopeSheet.RoofOtherFasciaLF, &scopeSheet.RoofOtherFasciaPaint,
		&scopeSheet.RoofOtherSoffitLF, &scopeSheet.RoofOtherSoffitPaint, &scopeSheet.RoofOtherDripEdgeLF, &scopeSheet.RoofOtherDripEdgePaint,
		&scopeSheet.RoofOtherPipeJacksCount, &scopeSheet.RoofOtherPipeJacksPaint, &scopeSheet.RoofOtherExVentsCount, &scopeSheet.RoofOtherExVentsPaint,
		&scopeSheet.RoofOtherTurbinesCount, &scopeSheet.RoofOtherTurbinesPaint, &scopeSheet.RoofOtherFurnacesCount, &scopeSheet.RoofOtherFurnacesPaint,
		&scopeSheet.RoofOtherPowerVentsCount, &scopeSheet.RoofOtherPowerVentsPaint, &scopeSheet.RoofOtherRidgeLF, &scopeSheet.RoofOtherSatellitesCount,
		&scopeSheet.RoofOtherStepFlashingLF, &scopeSheet.RoofOtherChimneyFlashing, &scopeSheet.RoofOtherRainDiverterLF,
		&scopeSheet.RoofOtherSkylightsCount, &scopeSheet.RoofOtherSkylightsDamaged,
		// Dimensions
		&scopeSheet.PorchPaint, &scopeSheet.PatioPaint, &scopeSheet.Fence,
		// Siding - Front
		&scopeSheet.FrontSiding1ReplaceSF, &scopeSheet.FrontSiding1PaintSF, &scopeSheet.FrontSiding2ReplaceSF, &scopeSheet.FrontSiding2PaintSF,
		&scopeSheet.FrontGuttersLF, &scopeSheet.FrontGuttersPaint, &scopeSheet.FrontWindows, &scopeSheet.FrontScreens, &scopeSheet.FrontDoors,
		&scopeSheet.FrontACReplace, &scopeSheet.FrontACCombFins,
		// Siding - Right
		&scopeSheet.RightSiding1ReplaceSF, &scopeSheet.RightSiding1PaintSF, &scopeSheet.RightSiding2ReplaceSF, &scopeSheet.RightSiding2PaintSF,
		&scopeSheet.RightGuttersLF, &scopeSheet.RightGuttersPaint, &scopeSheet.RightWindows, &scopeSheet.RightScreens, &scopeSheet.RightDoors,
		&scopeSheet.RightACReplace, &scopeSheet.RightACCombFins,
		// Siding - Back
		&scopeSheet.BackSiding1ReplaceSF, &scopeSheet.BackSiding1PaintSF, &scopeSheet.BackSiding2ReplaceSF, &scopeSheet.BackSiding2PaintSF,
		&scopeSheet.BackGuttersLF, &scopeSheet.BackGuttersPaint, &scopeSheet.BackWindows, &scopeSheet.BackScreens, &scopeSheet.BackDoors,
		&scopeSheet.BackACReplace, &scopeSheet.BackACCombFins,
		// Siding - Left
		&scopeSheet.LeftSiding1ReplaceSF, &scopeSheet.LeftSiding1PaintSF, &scopeSheet.LeftSiding2ReplaceSF, &scopeSheet.LeftSiding2PaintSF,
		&scopeSheet.LeftGuttersLF, &scopeSheet.LeftGuttersPaint, &scopeSheet.LeftWindows, &scopeSheet.LeftScreens, &scopeSheet.LeftDoors,
		&scopeSheet.LeftACReplace, &scopeSheet.LeftACCombFins,
		// Additional
		&scopeSheet.AdditionalItemsMain, &scopeSheet.AdditionalItemsOther, &scopeSheet.Notes,
		// Draft and metadata
		&scopeSheet.IsDraft, &scopeSheet.DraftStep, &scopeSheet.DraftSavedAt,
		&scopeSheet.SubmittedAt, &scopeSheet.CreatedAt, &scopeSheet.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, ErrDraftNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get draft: %w", err)
	}

	return &scopeSheet, nil
}
