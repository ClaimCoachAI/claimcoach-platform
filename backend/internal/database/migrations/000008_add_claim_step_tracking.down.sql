-- Rollback Phase 8: Guided UX Step Tracking

-- Drop indexes
DROP INDEX IF EXISTS idx_claims_steps_completed;
DROP INDEX IF EXISTS idx_claims_current_step;

-- Drop constraints
ALTER TABLE claims DROP CONSTRAINT IF EXISTS claims_deductible_comparison_result_check;
ALTER TABLE claims DROP CONSTRAINT IF EXISTS claims_current_step_check;

-- Drop step-specific fields
ALTER TABLE claims DROP COLUMN IF EXISTS inspection_datetime;
ALTER TABLE claims DROP COLUMN IF EXISTS insurance_claim_number;
ALTER TABLE claims DROP COLUMN IF EXISTS deductible_comparison_result;
ALTER TABLE claims DROP COLUMN IF EXISTS contractor_photos_uploaded_at;
ALTER TABLE claims DROP COLUMN IF EXISTS contractor_name;
ALTER TABLE claims DROP COLUMN IF EXISTS contractor_email;

-- Drop step tracking fields
ALTER TABLE claims DROP COLUMN IF EXISTS description;
ALTER TABLE claims DROP COLUMN IF EXISTS steps_completed;
ALTER TABLE claims DROP COLUMN IF EXISTS current_step;
