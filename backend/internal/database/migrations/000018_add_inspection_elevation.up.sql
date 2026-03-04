CREATE TABLE inspection_elevation (
    id                UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    inspection_id     UUID    NOT NULL REFERENCES inspection_v2(id) ON DELETE CASCADE,
    side              TEXT    NOT NULL CHECK (side IN ('front','right','back','left')),
    photo_document_id UUID    REFERENCES documents(id),
    has_damage        BOOLEAN NOT NULL DEFAULT false,
    siding_type       TEXT    CHECK (siding_type IN ('vinyl','wood','fiber_cement','brick','stucco','other')),
    siding_replace_sf NUMERIC(8,2),
    siding_paint_sf   NUMERIC(8,2),
    gutter_lf         NUMERIC(8,2),
    windows_count     INT,
    doors_count       INT,
    notes             TEXT,
    created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (inspection_id, side)
);

CREATE INDEX idx_inspection_elevation_inspection ON inspection_elevation(inspection_id);
