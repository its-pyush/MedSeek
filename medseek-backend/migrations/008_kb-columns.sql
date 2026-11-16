-- Knowledge base v1 columns.
-- The search tables are now seeded from data/kb/medseek_kb.json (see scripts/seed.ts).
-- Every statement is idempotent so the file is safe to re-run.

-- How often a condition is seen in the general population. Model-estimated;
-- used as a ranking prior so common conditions outrank rare ones on vague symptoms.
ALTER TABLE diseases ADD COLUMN IF NOT EXISTS prevalence VARCHAR(20) NOT NULL DEFAULT 'uncommon'
  CHECK (prevalence IN ('very_common', 'common', 'uncommon', 'rare'));

-- 'male' / 'female' only when the condition occurs exclusively in that sex.
ALTER TABLE diseases ADD COLUMN IF NOT EXISTS sex VARCHAR(10) NOT NULL DEFAULT 'any'
  CHECK (sex IN ('any', 'male', 'female'));

ALTER TABLE diseases ADD COLUMN IF NOT EXISTS aliases JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE diseases ADD COLUMN IF NOT EXISTS source_url TEXT;

-- Inverse disease frequency of each symptom: ln(1 + N / diseases_with_symptom).
ALTER TABLE symptoms ADD COLUMN IF NOT EXISTS idf REAL NOT NULL DEFAULT 1.0;

-- True when the symptom is distinctive of the disease rather than shared by many.
ALTER TABLE disease_symptoms ADD COLUMN IF NOT EXISTS is_key BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE disease_symptoms DROP CONSTRAINT IF EXISTS disease_symptoms_weight_source_check;
ALTER TABLE disease_symptoms ADD CONSTRAINT disease_symptoms_weight_source_check
  CHECK (weight_source IN ('sf_idf', 'classifier', 'kb_v1'));

CREATE INDEX IF NOT EXISTS idx_symptom_synonyms_symptom ON symptom_synonyms(symptom_id);
