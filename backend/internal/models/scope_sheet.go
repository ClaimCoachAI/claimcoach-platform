package models

import "time"

type ScopeSheet struct {
	ID      string `json:"id" db:"id"`
	ClaimID string `json:"claim_id" db:"claim_id"`

	// Roof Main
	RoofType          *string `json:"roof_type" db:"roof_type"`
	RoofSquareFootage *int    `json:"roof_square_footage" db:"roof_square_footage"`
	RoofPitch         *string `json:"roof_pitch" db:"roof_pitch"`
	FasciaLF          *int    `json:"fascia_lf" db:"fascia_lf"`
	FasciaPaint       bool    `json:"fascia_paint" db:"fascia_paint"`
	SoffitLF          *int    `json:"soffit_lf" db:"soffit_lf"`
	SoffitPaint       bool    `json:"soffit_paint" db:"soffit_paint"`
	DripEdgeLF        *int    `json:"drip_edge_lf" db:"drip_edge_lf"`
	DripEdgePaint     bool    `json:"drip_edge_paint" db:"drip_edge_paint"`
	PipeJacksCount    *int    `json:"pipe_jacks_count" db:"pipe_jacks_count"`
	PipeJacksPaint    bool    `json:"pipe_jacks_paint" db:"pipe_jacks_paint"`
	ExVentsCount      *int    `json:"ex_vents_count" db:"ex_vents_count"`
	ExVentsPaint      bool    `json:"ex_vents_paint" db:"ex_vents_paint"`
	TurbinesCount     *int    `json:"turbines_count" db:"turbines_count"`
	TurbinesPaint     bool    `json:"turbines_paint" db:"turbines_paint"`
	FurnacesCount     *int    `json:"furnaces_count" db:"furnaces_count"`
	FurnacesPaint     bool    `json:"furnaces_paint" db:"furnaces_paint"`
	PowerVentsCount   *int    `json:"power_vents_count" db:"power_vents_count"`
	PowerVentsPaint   bool    `json:"power_vents_paint" db:"power_vents_paint"`
	RidgeLF           *int    `json:"ridge_lf" db:"ridge_lf"`
	SatellitesCount   *int    `json:"satellites_count" db:"satellites_count"`
	StepFlashingLF    *int    `json:"step_flashing_lf" db:"step_flashing_lf"`
	ChimneyFlashing   bool    `json:"chimney_flashing" db:"chimney_flashing"`
	RainDiverterLF    *int    `json:"rain_diverter_lf" db:"rain_diverter_lf"`
	SkylightsCount    *int    `json:"skylights_count" db:"skylights_count"`
	SkylightsDamaged  bool    `json:"skylights_damaged" db:"skylights_damaged"`

	// Roof Other
	RoofOtherType               *string `json:"roof_other_type" db:"roof_other_type"`
	RoofOtherPitch              *string `json:"roof_other_pitch" db:"roof_other_pitch"`
	RoofOtherFasciaLF           *int    `json:"roof_other_fascia_lf" db:"roof_other_fascia_lf"`
	RoofOtherFasciaPaint        bool    `json:"roof_other_fascia_paint" db:"roof_other_fascia_paint"`
	RoofOtherSoffitLF           *int    `json:"roof_other_soffit_lf" db:"roof_other_soffit_lf"`
	RoofOtherSoffitPaint        bool    `json:"roof_other_soffit_paint" db:"roof_other_soffit_paint"`
	RoofOtherDripEdgeLF         *int    `json:"roof_other_drip_edge_lf" db:"roof_other_drip_edge_lf"`
	RoofOtherDripEdgePaint      bool    `json:"roof_other_drip_edge_paint" db:"roof_other_drip_edge_paint"`
	RoofOtherPipeJacksCount     *int    `json:"roof_other_pipe_jacks_count" db:"roof_other_pipe_jacks_count"`
	RoofOtherPipeJacksPaint     bool    `json:"roof_other_pipe_jacks_paint" db:"roof_other_pipe_jacks_paint"`
	RoofOtherExVentsCount       *int    `json:"roof_other_ex_vents_count" db:"roof_other_ex_vents_count"`
	RoofOtherExVentsPaint       bool    `json:"roof_other_ex_vents_paint" db:"roof_other_ex_vents_paint"`
	RoofOtherTurbinesCount      *int    `json:"roof_other_turbines_count" db:"roof_other_turbines_count"`
	RoofOtherTurbinesPaint      bool    `json:"roof_other_turbines_paint" db:"roof_other_turbines_paint"`
	RoofOtherFurnacesCount      *int    `json:"roof_other_furnaces_count" db:"roof_other_furnaces_count"`
	RoofOtherFurnacesPaint      bool    `json:"roof_other_furnaces_paint" db:"roof_other_furnaces_paint"`
	RoofOtherPowerVentsCount    *int    `json:"roof_other_power_vents_count" db:"roof_other_power_vents_count"`
	RoofOtherPowerVentsPaint    bool    `json:"roof_other_power_vents_paint" db:"roof_other_power_vents_paint"`
	RoofOtherRidgeLF            *int    `json:"roof_other_ridge_lf" db:"roof_other_ridge_lf"`
	RoofOtherSatellitesCount    *int    `json:"roof_other_satellites_count" db:"roof_other_satellites_count"`
	RoofOtherStepFlashingLF     *int    `json:"roof_other_step_flashing_lf" db:"roof_other_step_flashing_lf"`
	RoofOtherChimneyFlashing    bool    `json:"roof_other_chimney_flashing" db:"roof_other_chimney_flashing"`
	RoofOtherRainDiverterLF     *int    `json:"roof_other_rain_diverter_lf" db:"roof_other_rain_diverter_lf"`
	RoofOtherSkylightsCount     *int    `json:"roof_other_skylights_count" db:"roof_other_skylights_count"`
	RoofOtherSkylightsDamaged   bool    `json:"roof_other_skylights_damaged" db:"roof_other_skylights_damaged"`

	// Dimensions
	PorchPaint bool    `json:"porch_paint" db:"porch_paint"`
	PatioPaint bool    `json:"patio_paint" db:"patio_paint"`
	Fence      *string `json:"fence" db:"fence"`

	// Siding - Front
	FrontSiding1ReplaceSF *int    `json:"front_siding_1_replace_sf" db:"front_siding_1_replace_sf"`
	FrontSiding1PaintSF   *int    `json:"front_siding_1_paint_sf" db:"front_siding_1_paint_sf"`
	FrontSiding2ReplaceSF *int    `json:"front_siding_2_replace_sf" db:"front_siding_2_replace_sf"`
	FrontSiding2PaintSF   *int    `json:"front_siding_2_paint_sf" db:"front_siding_2_paint_sf"`
	FrontGuttersLF        *int    `json:"front_gutters_lf" db:"front_gutters_lf"`
	FrontGuttersPaint     bool    `json:"front_gutters_paint" db:"front_gutters_paint"`
	FrontWindows          *string `json:"front_windows" db:"front_windows"`
	FrontScreens          *string `json:"front_screens" db:"front_screens"`
	FrontDoors            *string `json:"front_doors" db:"front_doors"`
	FrontACReplace        bool    `json:"front_ac_replace" db:"front_ac_replace"`
	FrontACCombFins       bool    `json:"front_ac_comb_fins" db:"front_ac_comb_fins"`

	// Siding - Right
	RightSiding1ReplaceSF *int    `json:"right_siding_1_replace_sf" db:"right_siding_1_replace_sf"`
	RightSiding1PaintSF   *int    `json:"right_siding_1_paint_sf" db:"right_siding_1_paint_sf"`
	RightSiding2ReplaceSF *int    `json:"right_siding_2_replace_sf" db:"right_siding_2_replace_sf"`
	RightSiding2PaintSF   *int    `json:"right_siding_2_paint_sf" db:"right_siding_2_paint_sf"`
	RightGuttersLF        *int    `json:"right_gutters_lf" db:"right_gutters_lf"`
	RightGuttersPaint     bool    `json:"right_gutters_paint" db:"right_gutters_paint"`
	RightWindows          *string `json:"right_windows" db:"right_windows"`
	RightScreens          *string `json:"right_screens" db:"right_screens"`
	RightDoors            *string `json:"right_doors" db:"right_doors"`
	RightACReplace        bool    `json:"right_ac_replace" db:"right_ac_replace"`
	RightACCombFins       bool    `json:"right_ac_comb_fins" db:"right_ac_comb_fins"`

	// Siding - Back
	BackSiding1ReplaceSF *int    `json:"back_siding_1_replace_sf" db:"back_siding_1_replace_sf"`
	BackSiding1PaintSF   *int    `json:"back_siding_1_paint_sf" db:"back_siding_1_paint_sf"`
	BackSiding2ReplaceSF *int    `json:"back_siding_2_replace_sf" db:"back_siding_2_replace_sf"`
	BackSiding2PaintSF   *int    `json:"back_siding_2_paint_sf" db:"back_siding_2_paint_sf"`
	BackGuttersLF        *int    `json:"back_gutters_lf" db:"back_gutters_lf"`
	BackGuttersPaint     bool    `json:"back_gutters_paint" db:"back_gutters_paint"`
	BackWindows          *string `json:"back_windows" db:"back_windows"`
	BackScreens          *string `json:"back_screens" db:"back_screens"`
	BackDoors            *string `json:"back_doors" db:"back_doors"`
	BackACReplace        bool    `json:"back_ac_replace" db:"back_ac_replace"`
	BackACCombFins       bool    `json:"back_ac_comb_fins" db:"back_ac_comb_fins"`

	// Siding - Left
	LeftSiding1ReplaceSF *int    `json:"left_siding_1_replace_sf" db:"left_siding_1_replace_sf"`
	LeftSiding1PaintSF   *int    `json:"left_siding_1_paint_sf" db:"left_siding_1_paint_sf"`
	LeftSiding2ReplaceSF *int    `json:"left_siding_2_replace_sf" db:"left_siding_2_replace_sf"`
	LeftSiding2PaintSF   *int    `json:"left_siding_2_paint_sf" db:"left_siding_2_paint_sf"`
	LeftGuttersLF        *int    `json:"left_gutters_lf" db:"left_gutters_lf"`
	LeftGuttersPaint     bool    `json:"left_gutters_paint" db:"left_gutters_paint"`
	LeftWindows          *string `json:"left_windows" db:"left_windows"`
	LeftScreens          *string `json:"left_screens" db:"left_screens"`
	LeftDoors            *string `json:"left_doors" db:"left_doors"`
	LeftACReplace        bool    `json:"left_ac_replace" db:"left_ac_replace"`
	LeftACCombFins       bool    `json:"left_ac_comb_fins" db:"left_ac_comb_fins"`

	// Additional
	AdditionalItemsMain  *string `json:"additional_items_main" db:"additional_items_main"`
	AdditionalItemsOther *string `json:"additional_items_other" db:"additional_items_other"`
	Notes                *string `json:"notes" db:"notes"`

	// Draft fields
	IsDraft      bool       `json:"is_draft" db:"is_draft"`
	DraftStep    *int       `json:"draft_step,omitempty" db:"draft_step"`
	DraftSavedAt *time.Time `json:"draft_saved_at,omitempty" db:"draft_saved_at"`

	SubmittedAt *time.Time `json:"submitted_at" db:"submitted_at"`
	CreatedAt   time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at" db:"updated_at"`
}
