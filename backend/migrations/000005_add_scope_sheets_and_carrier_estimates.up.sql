-- Scope sheets table (contractor-submitted damage scope)
CREATE TABLE scope_sheets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,

    -- Roof Main
    roof_type VARCHAR(100),
    roof_square_footage INTEGER,
    roof_pitch VARCHAR(50),
    fascia_lf INTEGER,
    fascia_paint BOOLEAN DEFAULT false,
    soffit_lf INTEGER,
    soffit_paint BOOLEAN DEFAULT false,
    drip_edge_lf INTEGER,
    drip_edge_paint BOOLEAN DEFAULT false,
    pipe_jacks_count INTEGER,
    pipe_jacks_paint BOOLEAN DEFAULT false,
    ex_vents_count INTEGER,
    ex_vents_paint BOOLEAN DEFAULT false,
    turbines_count INTEGER,
    turbines_paint BOOLEAN DEFAULT false,
    furnaces_count INTEGER,
    furnaces_paint BOOLEAN DEFAULT false,
    power_vents_count INTEGER,
    power_vents_paint BOOLEAN DEFAULT false,
    ridge_lf INTEGER,
    satellites_count INTEGER,
    step_flashing_lf INTEGER,
    chimney_flashing BOOLEAN DEFAULT false,
    rain_diverter_lf INTEGER,
    skylights_count INTEGER,
    skylights_damaged BOOLEAN DEFAULT false,

    -- Roof Other
    roof_other_type VARCHAR(100),
    roof_other_pitch VARCHAR(50),
    roof_other_fascia_lf INTEGER,
    roof_other_fascia_paint BOOLEAN DEFAULT false,
    roof_other_soffit_lf INTEGER,
    roof_other_soffit_paint BOOLEAN DEFAULT false,
    roof_other_drip_edge_lf INTEGER,
    roof_other_drip_edge_paint BOOLEAN DEFAULT false,
    roof_other_pipe_jacks_count INTEGER,
    roof_other_pipe_jacks_paint BOOLEAN DEFAULT false,
    roof_other_ex_vents_count INTEGER,
    roof_other_ex_vents_paint BOOLEAN DEFAULT false,
    roof_other_turbines_count INTEGER,
    roof_other_turbines_paint BOOLEAN DEFAULT false,
    roof_other_furnaces_count INTEGER,
    roof_other_furnaces_paint BOOLEAN DEFAULT false,
    roof_other_power_vents_count INTEGER,
    roof_other_power_vents_paint BOOLEAN DEFAULT false,
    roof_other_ridge_lf INTEGER,
    roof_other_satellites_count INTEGER,
    roof_other_step_flashing_lf INTEGER,
    roof_other_chimney_flashing BOOLEAN DEFAULT false,
    roof_other_rain_diverter_lf INTEGER,
    roof_other_skylights_count INTEGER,
    roof_other_skylights_damaged BOOLEAN DEFAULT false,

    -- Dimensions
    porch_paint BOOLEAN DEFAULT false,
    patio_paint BOOLEAN DEFAULT false,
    fence TEXT,

    -- Siding - Front
    front_siding_1_replace_sf INTEGER,
    front_siding_1_paint_sf INTEGER,
    front_siding_2_replace_sf INTEGER,
    front_siding_2_paint_sf INTEGER,
    front_gutters_lf INTEGER,
    front_gutters_paint BOOLEAN DEFAULT false,
    front_windows TEXT,
    front_screens TEXT,
    front_doors TEXT,
    front_ac_replace BOOLEAN DEFAULT false,
    front_ac_comb_fins BOOLEAN DEFAULT false,

    -- Siding - Right
    right_siding_1_replace_sf INTEGER,
    right_siding_1_paint_sf INTEGER,
    right_siding_2_replace_sf INTEGER,
    right_siding_2_paint_sf INTEGER,
    right_gutters_lf INTEGER,
    right_gutters_paint BOOLEAN DEFAULT false,
    right_windows TEXT,
    right_screens TEXT,
    right_doors TEXT,
    right_ac_replace BOOLEAN DEFAULT false,
    right_ac_comb_fins BOOLEAN DEFAULT false,

    -- Siding - Back
    back_siding_1_replace_sf INTEGER,
    back_siding_1_paint_sf INTEGER,
    back_siding_2_replace_sf INTEGER,
    back_siding_2_paint_sf INTEGER,
    back_gutters_lf INTEGER,
    back_gutters_paint BOOLEAN DEFAULT false,
    back_windows TEXT,
    back_screens TEXT,
    back_doors TEXT,
    back_ac_replace BOOLEAN DEFAULT false,
    back_ac_comb_fins BOOLEAN DEFAULT false,

    -- Siding - Left
    left_siding_1_replace_sf INTEGER,
    left_siding_1_paint_sf INTEGER,
    left_siding_2_replace_sf INTEGER,
    left_siding_2_paint_sf INTEGER,
    left_gutters_lf INTEGER,
    left_gutters_paint BOOLEAN DEFAULT false,
    left_windows TEXT,
    left_screens TEXT,
    left_doors TEXT,
    left_ac_replace BOOLEAN DEFAULT false,
    left_ac_comb_fins BOOLEAN DEFAULT false,

    -- Additional
    additional_items_main TEXT,
    additional_items_other TEXT,
    notes TEXT,

    submitted_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_scope_sheets_claim ON scope_sheets(claim_id);

-- Carrier estimates table (insurance company estimates)
CREATE TABLE carrier_estimates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    uploaded_by_user_id UUID NOT NULL REFERENCES users(id),

    file_path VARCHAR(500) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_size_bytes BIGINT,

    parsed_data JSONB,
    parse_status VARCHAR(50) DEFAULT 'pending' CHECK (parse_status IN ('pending', 'processing', 'completed', 'failed')),
    parse_error TEXT,

    uploaded_at TIMESTAMP DEFAULT NOW(),
    parsed_at TIMESTAMP
);

CREATE INDEX idx_carrier_estimates_claim ON carrier_estimates(claim_id);
CREATE INDEX idx_carrier_estimates_user ON carrier_estimates(uploaded_by_user_id);
