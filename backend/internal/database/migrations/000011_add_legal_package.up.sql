-- Migration 000011: Legal Package
-- Adds legal escalation fields to claims table and creates legal_approval_requests table.

-- Legal escalation tracking on the claim itself
ALTER TABLE claims
    ADD COLUMN legal_partner_name    VARCHAR(255),
    ADD COLUMN legal_partner_email   VARCHAR(255),
    ADD COLUMN owner_email           VARCHAR(255),
    ADD COLUMN legal_escalation_status VARCHAR(50)
        CHECK (legal_escalation_status IN (
            'pending_approval', 'approved', 'declined', 'sent_to_lawyer'
        ));

-- One approval request row per escalation attempt
CREATE TABLE legal_approval_requests (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id     UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    token        VARCHAR(255) NOT NULL UNIQUE,
    owner_name   VARCHAR(255) NOT NULL,
    owner_email  VARCHAR(255) NOT NULL,
    status       VARCHAR(50) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'declined', 'expired')),
    expires_at   TIMESTAMP NOT NULL,
    responded_at TIMESTAMP,
    created_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_legal_approval_token  ON legal_approval_requests(token);
CREATE INDEX idx_legal_approval_claim  ON legal_approval_requests(claim_id);
CREATE INDEX idx_legal_approval_status ON legal_approval_requests(status);
