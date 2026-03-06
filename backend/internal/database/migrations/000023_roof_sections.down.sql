-- 000023_roof_sections.down.sql
ALTER TABLE inspection_roof
  DROP COLUMN IF EXISTS sort_order,
  DROP COLUMN IF EXISTS complexity,
  DROP COLUMN IF EXISTS penetrations,
  DROP COLUMN IF EXISTS section_custom_name,
  DROP COLUMN IF EXISTS section_type;

ALTER TABLE inspection_roof ADD CONSTRAINT inspection_roof_inspection_id_key UNIQUE (inspection_id);
