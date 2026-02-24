-- Rollback 000011: Legal Package

DROP INDEX IF EXISTS idx_legal_approval_status;
DROP INDEX IF EXISTS idx_legal_approval_claim;
DROP INDEX IF EXISTS idx_legal_approval_token;

DROP TABLE IF EXISTS legal_approval_requests;

ALTER TABLE claims
    DROP COLUMN IF EXISTS legal_escalation_status,
    DROP COLUMN IF EXISTS owner_email,
    DROP COLUMN IF EXISTS legal_partner_email,
    DROP COLUMN IF EXISTS legal_partner_name;
