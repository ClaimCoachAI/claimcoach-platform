-- Revert current_step constraint back to max 6
ALTER TABLE claims DROP CONSTRAINT claims_current_step_check;
ALTER TABLE claims ADD CONSTRAINT claims_current_step_check CHECK (current_step >= 1 AND current_step <= 6);
