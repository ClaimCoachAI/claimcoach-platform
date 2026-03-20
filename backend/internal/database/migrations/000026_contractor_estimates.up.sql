-- 000026_contractor_estimates.up.sql
CREATE TABLE IF NOT EXISTS contractor_estimates (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id            UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    file_path           TEXT NOT NULL,
    file_name           TEXT NOT NULL,
    file_size_bytes     BIGINT,
    uploaded_by_user_id UUID REFERENCES users(id),
    uploaded_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    parse_status        TEXT NOT NULL DEFAULT 'pending',
    parsed_data         JSONB,
    parse_error         TEXT,
    parsed_at           TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contractor_estimates_claim_id ON contractor_estimates(claim_id);
CREATE INDEX IF NOT EXISTS idx_contractor_estimates_parse_status ON contractor_estimates(parse_status);
