-- Fix draft_step CHECK constraint.
-- The original constraint (1–10) was too narrow for the wizard's encoding scheme
-- where tour steps are encoded as (10 + step_index), e.g. step 1 = 11, step 2 = 12, ...
-- and the review phase is encoded as 99.
-- Relax the constraint to only require a non-negative integer.
ALTER TABLE scope_sheets DROP CONSTRAINT IF EXISTS scope_sheets_draft_step_check;
ALTER TABLE scope_sheets ADD CONSTRAINT scope_sheets_draft_step_check CHECK (draft_step >= 0);
