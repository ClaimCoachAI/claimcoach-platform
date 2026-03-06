ALTER TABLE scope_sheets
DROP COLUMN IF EXISTS areas,
DROP COLUMN IF EXISTS triage_selections,
DROP COLUMN IF EXISTS general_notes;
