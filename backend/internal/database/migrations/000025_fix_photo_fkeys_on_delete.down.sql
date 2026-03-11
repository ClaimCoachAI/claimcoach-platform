-- Revert ON DELETE SET NULL back to bare FK (no action)

ALTER TABLE inspection_roof DROP CONSTRAINT IF EXISTS inspection_roof_overview_photo_id_fkey;
ALTER TABLE inspection_roof ADD CONSTRAINT inspection_roof_overview_photo_id_fkey
    FOREIGN KEY (overview_photo_id) REFERENCES documents(id);

ALTER TABLE inspection_roof DROP CONSTRAINT IF EXISTS inspection_roof_slope_photo_id_fkey;
ALTER TABLE inspection_roof ADD CONSTRAINT inspection_roof_slope_photo_id_fkey
    FOREIGN KEY (slope_photo_id) REFERENCES documents(id);

ALTER TABLE inspection_roof DROP CONSTRAINT IF EXISTS inspection_roof_shingles_photo_id_fkey;
ALTER TABLE inspection_roof ADD CONSTRAINT inspection_roof_shingles_photo_id_fkey
    FOREIGN KEY (shingles_photo_id) REFERENCES documents(id);

ALTER TABLE inspection_roof DROP CONSTRAINT IF EXISTS inspection_roof_ridge_photo_id_fkey;
ALTER TABLE inspection_roof ADD CONSTRAINT inspection_roof_ridge_photo_id_fkey
    FOREIGN KEY (ridge_photo_id) REFERENCES documents(id);

ALTER TABLE inspection_elevation DROP CONSTRAINT IF EXISTS inspection_elevation_photo_document_id_fkey;
ALTER TABLE inspection_elevation ADD CONSTRAINT inspection_elevation_photo_document_id_fkey
    FOREIGN KEY (photo_document_id) REFERENCES documents(id);

ALTER TABLE inspection_room_photo DROP CONSTRAINT IF EXISTS inspection_room_photo_photo_id_fkey;
ALTER TABLE inspection_room_photo ADD CONSTRAINT inspection_room_photo_photo_id_fkey
    FOREIGN KEY (photo_id) REFERENCES documents(id);
