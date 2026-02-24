-- Extend current_step constraint to allow step 7 (payments)
ALTER TABLE claims DROP CONSTRAINT claims_current_step_check;
ALTER TABLE claims ADD CONSTRAINT claims_current_step_check CHECK (current_step >= 1 AND current_step <= 7);
