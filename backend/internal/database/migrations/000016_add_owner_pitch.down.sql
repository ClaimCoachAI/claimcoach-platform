ALTER TABLE audit_reports DROP COLUMN IF EXISTS owner_pitch;

ALTER TABLE claims ADD COLUMN IF NOT EXISTS legal_escalation_status VARCHAR(50) CHECK (legal_escalation_status IN ('pending_approval', 'approved', 'declined', 'sent_to_lawyer'));
ALTER TABLE claims ADD COLUMN IF NOT EXISTS owner_email VARCHAR(255);
ALTER TABLE claims ADD COLUMN IF NOT EXISTS legal_partner_email VARCHAR(255);
ALTER TABLE claims ADD COLUMN IF NOT EXISTS legal_partner_name VARCHAR(255);

CREATE TABLE IF NOT EXISTS legal_approval_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    token VARCHAR(255) NOT NULL UNIQUE,
    owner_name VARCHAR(255) NOT NULL,
    owner_email VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'declined', 'expired')),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    responded_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_legal_approval_token ON legal_approval_requests(token);
CREATE INDEX IF NOT EXISTS idx_legal_approval_claim ON legal_approval_requests(claim_id);
CREATE INDEX IF NOT EXISTS idx_legal_approval_status ON legal_approval_requests(status);
