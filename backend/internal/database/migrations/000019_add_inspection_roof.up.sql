-- 000019_add_inspection_roof.up.sql

CREATE TABLE inspection_roof (
    id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    inspection_id        UUID         NOT NULL REFERENCES inspection_v2(id) ON DELETE CASCADE,

    -- Named photo slots (URLs resolved at read-time via JOIN)
    overview_photo_id    UUID         REFERENCES documents(id),
    slope_photo_id       UUID         REFERENCES documents(id),
    shingles_photo_id    UUID         REFERENCES documents(id),
    ridge_photo_id       UUID         REFERENCES documents(id),

    -- Roof metrics
    pitch                TEXT         CHECK (pitch IN ('flat','2_12','4_12','6_12','8_12','10_12','12_12_plus')),
    shingle_type         TEXT         CHECK (shingle_type IN ('3tab','architectural','metal','tile','tpo','other')),
    layers               INT          CHECK (layers BETWEEN 1 AND 5),
    squares              NUMERIC(6,1),

    -- Damage flags
    has_ridge_damage     BOOLEAN      NOT NULL DEFAULT false,
    has_valley_damage    BOOLEAN      NOT NULL DEFAULT false,
    has_flashing_damage  BOOLEAN      NOT NULL DEFAULT false,
    decking_condition    TEXT         CHECK (decking_condition IN ('good','soft_spots','needs_replace')),  -- nullable; app enforces when any damage flag = true

    notes                TEXT,
    created_at           TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMP    NOT NULL DEFAULT NOW(),

    UNIQUE (inspection_id)
);

CREATE INDEX idx_inspection_roof_inspection ON inspection_roof(inspection_id);

CREATE TABLE inspection_roof_damage_spot (
    id          UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
    roof_id     UUID      NOT NULL REFERENCES inspection_roof(id) ON DELETE CASCADE,
    photo_id    UUID      REFERENCES documents(id),
    photo_url   TEXT,
    caption     TEXT,
    sort_order  INT       NOT NULL DEFAULT 0,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_inspection_roof_damage_roof ON inspection_roof_damage_spot(roof_id);
