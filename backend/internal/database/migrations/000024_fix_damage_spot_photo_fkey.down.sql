ALTER TABLE inspection_roof_damage_spot
    DROP CONSTRAINT inspection_roof_damage_spot_photo_id_fkey;

ALTER TABLE inspection_roof_damage_spot
    ADD CONSTRAINT inspection_roof_damage_spot_photo_id_fkey
    FOREIGN KEY (photo_id) REFERENCES documents(id);
