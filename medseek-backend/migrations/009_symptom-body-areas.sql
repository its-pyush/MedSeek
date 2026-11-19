-- Where on the body each symptom is felt or seen.
-- Values are area/part ids of the 3D body picker (data/kb/body_regions.json)
-- or one of the groups 'general', 'skin', 'mind'. Editorial data, filled from
-- data/kb/symptom_areas.json by `npm run kb:areas` (and by `npm run seed`).
-- Idempotent, safe to re-run.

ALTER TABLE symptoms ADD COLUMN IF NOT EXISTS body_areas TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_symptoms_body_areas ON symptoms USING gin (body_areas);
