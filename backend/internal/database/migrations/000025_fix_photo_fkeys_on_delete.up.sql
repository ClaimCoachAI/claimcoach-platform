-- Fix: all inspection photo FK columns that reference documents(id) need ON DELETE SET NULL
-- so that deleting a claim (which cascades to documents) doesn't violate these constraints.

-- inspection_roof: 4 photo slot columns
ALTER TABLE inspection_roof DROP CONSTRAINT IF EXISTS inspection_roof_overview_photo_id_fkey;
ALTER TABLE inspection_roof ADD CONSTRAINT inspection_roof_overview_photo_id_fkey
    FOREIGN KEY (overview_photo_id) REFERENCES documents(id) ON DELETE SET NULL;

ALTER TABLE inspection_roof DROP CONSTRAINT IF EXISTS inspection_roof_slope_photo_id_fkey;
ALTER TABLE inspection_roof ADD CONSTRAINT inspection_roof_slope_photo_id_fkey
    FOREIGN KEY (slope_photo_id) REFERENCES documents(id) ON DELETE SET NULL;

ALTER TABLE inspection_roof DROP CONSTRAINT IF EXISTS inspection_roof_shingles_photo_id_fkey;
ALTER TABLE inspection_roof ADD CONSTRAINT inspection_roof_shingles_photo_id_fkey
    FOREIGN KEY (shingles_photo_id) REFERENCES documents(id) ON DELETE SET NULL;

ALTER TABLE inspection_roof DROP CONSTRAINT IF EXISTS inspection_roof_ridge_photo_id_fkey;
ALTER TABLE inspection_roof ADD CONSTRAINT inspection_roof_ridge_photo_id_fkey
    FOREIGN KEY (ridge_photo_id) REFERENCES documents(id) ON DELETE SET NULL;

-- inspection_elevation: photo_document_id
ALTER TABLE inspection_elevation DROP CONSTRAINT IF EXISTS inspection_elevation_photo_document_id_fkey;
ALTER TABLE inspection_elevation ADD CONSTRAINT inspection_elevation_photo_document_id_fkey
    FOREIGN KEY (photo_document_id) REFERENCES documents(id) ON DELETE SET NULL;

-- inspection_room_photo: photo_id
ALTER TABLE inspection_room_photo DROP CONSTRAINT IF EXISTS inspection_room_photo_photo_id_fkey;
ALTER TABLE inspection_room_photo ADD CONSTRAINT inspection_room_photo_photo_id_fkey
    FOREIGN KEY (photo_id) REFERENCES documents(id) ON DELETE SET NULL;
