-- 000020_add_inspection_rooms.up.sql

CREATE TABLE inspection_room (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    inspection_id     UUID        NOT NULL REFERENCES inspection_v2(id) ON DELETE CASCADE,
    name              TEXT        NOT NULL DEFAULT 'Room',
    length_ft         NUMERIC(6,1),
    width_ft          NUMERIC(6,1),
    height_ft         NUMERIC(6,1),
    damaged_materials JSONB       NOT NULL DEFAULT '[]'::jsonb,
    notes             TEXT,
    sort_order        INT         NOT NULL DEFAULT 0,
    created_at        TIMESTAMP   NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_inspection_room_inspection ON inspection_room(inspection_id);

CREATE TABLE inspection_room_photo (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id     UUID        NOT NULL REFERENCES inspection_room(id) ON DELETE CASCADE,
    photo_id    UUID        REFERENCES documents(id),
    photo_url   TEXT,
    caption     TEXT,
    sort_order  INT         NOT NULL DEFAULT 0,
    created_at  TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_inspection_room_photo_room ON inspection_room_photo(room_id);
