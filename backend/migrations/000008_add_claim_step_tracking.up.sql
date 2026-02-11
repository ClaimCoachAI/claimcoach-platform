-- Phase 8: Guided UX Step Tracking
-- Add step tracking fields for the 6-step claim workflow

-- Add step tracking fields
ALTER TABLE claims ADD COLUMN current_step INTEGER DEFAULT 1 NOT NULL;
ALTER TABLE claims ADD COLUMN steps_completed JSONB DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE claims ADD COLUMN description TEXT;

-- Add step-specific fields
ALTER TABLE claims ADD COLUMN contractor_email TEXT;
ALTER TABLE claims ADD COLUMN contractor_name TEXT;
ALTER TABLE claims ADD COLUMN contractor_photos_uploaded_at TIMESTAMP;
ALTER TABLE claims ADD COLUMN deductible_comparison_result TEXT;
ALTER TABLE claims ADD COLUMN insurance_claim_number TEXT;
ALTER TABLE claims ADD COLUMN inspection_datetime TIMESTAMP;

-- Add constraint for current_step
ALTER TABLE claims ADD CONSTRAINT claims_current_step_check CHECK (current_step >= 1 AND current_step <= 6);

-- Add constraint for deductible_comparison_result
ALTER TABLE claims ADD CONSTRAINT claims_deductible_comparison_result_check
    CHECK (deductible_comparison_result IN ('worth_filing', 'not_worth_filing') OR deductible_comparison_result IS NULL);

-- Add index for step tracking queries
CREATE INDEX idx_claims_current_step ON claims(current_step);
CREATE INDEX idx_claims_steps_completed ON claims USING GIN(steps_completed);
