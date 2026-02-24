-- Add new fields
ALTER TABLE insurance_policies
  ADD COLUMN carrier_phone TEXT,
  ADD COLUMN carrier_email TEXT,
  ADD COLUMN exclusions TEXT;

-- Drop removed fields
ALTER TABLE insurance_policies
  DROP COLUMN IF EXISTS coverage_a_limit,
  DROP COLUMN IF EXISTS coverage_b_limit,
  DROP COLUMN IF EXISTS coverage_d_limit,
  DROP COLUMN IF EXISTS deductible_type,
  DROP COLUMN IF EXISTS deductible_calculated;
