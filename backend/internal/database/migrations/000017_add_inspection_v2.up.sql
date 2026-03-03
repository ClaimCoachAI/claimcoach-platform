-- 000017_add_inspection_v2.up.sql

CREATE TABLE inspection_v2 (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id       UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    magic_link_id  UUID NOT NULL REFERENCES magic_links(id) ON DELETE CASCADE,
    property_type  TEXT CHECK (property_type IN ('sfh','duplex','small_mf','mf','commercial_light')),
    stories        INT CHECK (stories BETWEEN 1 AND 5),
    status         TEXT NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft','in_progress','submitted')),
    current_step   INT NOT NULL DEFAULT 1,
    submitted_at   TIMESTAMP,
    created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_inspection_v2_claim ON inspection_v2(claim_id);
CREATE UNIQUE INDEX idx_inspection_v2_magic_link ON inspection_v2(magic_link_id);

CREATE TABLE inspection_area_selection (
    inspection_id    UUID PRIMARY KEY REFERENCES inspection_v2(id) ON DELETE CASCADE,
    include_roof     BOOLEAN NOT NULL DEFAULT false,
    include_exterior BOOLEAN NOT NULL DEFAULT false,
    include_interior BOOLEAN NOT NULL DEFAULT false,
    include_porch    BOOLEAN NOT NULL DEFAULT false
);
