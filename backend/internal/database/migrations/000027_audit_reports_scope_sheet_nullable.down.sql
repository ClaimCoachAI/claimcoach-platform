-- 000027_audit_reports_scope_sheet_nullable.down.sql
-- NOTE: Down migration cannot restore NOT NULL if rows exist with NULL scope_sheet_id.
-- Manual intervention required. This is a one-way migration.
ALTER TABLE audit_reports ALTER COLUMN scope_sheet_id SET NOT NULL;
