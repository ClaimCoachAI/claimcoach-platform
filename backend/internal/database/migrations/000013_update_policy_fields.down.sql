ALTER TABLE insurance_policies
  DROP COLUMN IF EXISTS carrier_phone,
  DROP COLUMN IF EXISTS carrier_email,
  DROP COLUMN IF EXISTS exclusions;

ALTER TABLE insurance_policies
  ADD COLUMN coverage_a_limit NUMERIC,
  ADD COLUMN coverage_b_limit NUMERIC,
  ADD COLUMN coverage_d_limit NUMERIC,
  ADD COLUMN deductible_type TEXT NOT NULL DEFAULT 'fixed',
  ADD COLUMN deductible_calculated NUMERIC NOT NULL DEFAULT 0;
