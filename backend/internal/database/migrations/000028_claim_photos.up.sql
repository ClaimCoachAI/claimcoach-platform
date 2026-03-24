CREATE TABLE IF NOT EXISTS claim_photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    uploaded_by_user_id UUID REFERENCES users(id),
    file_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    caption TEXT NOT NULL DEFAULT '',
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS claim_photos_claim_id_idx ON claim_photos(claim_id);
