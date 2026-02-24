ALTER TABLE insurance_policies
  DROP COLUMN IF EXISTS carrier_phone,
  DROP COLUMN IF EXISTS carrier_email,
  DROP COLUMN IF EXISTS exclusions;

ALTER TABLE insurance_policies
  ADD COLUMN coverage_a_limit      DECIMAL(12, 2),
  ADD COLUMN coverage_b_limit      DECIMAL(12, 2),
  ADD COLUMN coverage_d_limit      DECIMAL(12, 2),
  ADD COLUMN deductible_type       TEXT NOT NULL CHECK (deductible_type IN ('percentage', 'fixed')) DEFAULT 'fixed',
  ADD COLUMN deductible_calculated DECIMAL(12, 2) NOT NULL DEFAULT 0;
