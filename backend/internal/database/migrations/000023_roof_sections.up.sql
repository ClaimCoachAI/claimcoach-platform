-- 000023_roof_sections.up.sql
-- Drop the one-per-inspection unique constraint so we can have multiple sections.
ALTER TABLE inspection_roof DROP CONSTRAINT IF EXISTS inspection_roof_inspection_id_key;

-- Section identity fields
ALTER TABLE inspection_roof
  ADD COLUMN IF NOT EXISTS section_type        TEXT CHECK (section_type IN ('main_house','garage','patio','carport','flat_roof','other')),
  ADD COLUMN IF NOT EXISTS section_custom_name TEXT,
  ADD COLUMN IF NOT EXISTS penetrations        TEXT CHECK (penetrations IN ('0_3','4_7','8_plus')),
  ADD COLUMN IF NOT EXISTS complexity          TEXT CHECK (complexity IN ('simple','moderate','complex')),
  ADD COLUMN IF NOT EXISTS sort_order          INT  NOT NULL DEFAULT 0;
