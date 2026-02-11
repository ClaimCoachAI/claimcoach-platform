-- Remove draft-related fields from scope_sheets table
DROP INDEX IF EXISTS idx_scope_sheets_draft_unique;

ALTER TABLE scope_sheets
DROP COLUMN IF EXISTS is_draft,
DROP COLUMN IF EXISTS draft_step,
DROP COLUMN IF EXISTS draft_saved_at;
