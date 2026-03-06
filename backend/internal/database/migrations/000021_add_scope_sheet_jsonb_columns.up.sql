-- Add JSONB columns to scope_sheets table for the new wizard-based submission format.
-- The old flat columns (roof_type, roof_square_footage, etc.) are left in place for
-- historical data compatibility.
ALTER TABLE scope_sheets
ADD COLUMN IF NOT EXISTS areas              JSONB NOT NULL DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS triage_selections  JSONB NOT NULL DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS general_notes      TEXT;
