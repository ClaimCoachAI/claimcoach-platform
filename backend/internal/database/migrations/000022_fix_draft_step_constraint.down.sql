ALTER TABLE scope_sheets DROP CONSTRAINT IF EXISTS scope_sheets_draft_step_check;
ALTER TABLE scope_sheets ADD CONSTRAINT scope_sheets_draft_step_check CHECK (draft_step >= 1 AND draft_step <= 10);
