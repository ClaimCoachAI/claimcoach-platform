-- Fix: inspection_roof_damage_spot.photo_id FK needs ON DELETE SET NULL
-- so that deleting documents (during claim deletion) doesn't violate the constraint.
ALTER TABLE inspection_roof_damage_spot
    DROP CONSTRAINT inspection_roof_damage_spot_photo_id_fkey;

ALTER TABLE inspection_roof_damage_spot
    ADD CONSTRAINT inspection_roof_damage_spot_photo_id_fkey
    FOREIGN KEY (photo_id) REFERENCES documents(id) ON DELETE SET NULL;
