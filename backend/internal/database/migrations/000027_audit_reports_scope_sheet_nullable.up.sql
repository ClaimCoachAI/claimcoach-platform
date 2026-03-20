-- 000027_audit_reports_scope_sheet_nullable.up.sql
ALTER TABLE audit_reports ALTER COLUMN scope_sheet_id DROP NOT NULL;
ALTER TABLE audit_reports DROP CONSTRAINT IF EXISTS audit_reports_scope_sheet_id_fkey;
ALTER TABLE audit_reports ADD CONSTRAINT audit_reports_scope_sheet_id_fkey
    FOREIGN KEY (scope_sheet_id) REFERENCES scope_sheets(id) ON DELETE SET NULL;
