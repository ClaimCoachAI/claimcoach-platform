ALTER TABLE audit_reports ADD COLUMN owner_pitch TEXT;

ALTER TABLE claims DROP COLUMN IF EXISTS legal_partner_name;
ALTER TABLE claims DROP COLUMN IF EXISTS legal_partner_email;
ALTER TABLE claims DROP COLUMN IF EXISTS owner_email;
ALTER TABLE claims DROP COLUMN IF EXISTS legal_escalation_status;

DROP TABLE IF EXISTS legal_approval_requests;
