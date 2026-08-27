-- Search engine tables (public, no auth required)
-- These power the disease/symptom search engine — the public top-of-funnel.

-- Diseases: canonical disease list, tagged with ICD-11 codes where available
CREATE TABLE IF NOT EXISTS diseases (
  id            SERIAL PRIMARY KEY,
  icd11_code    VARCHAR(20),
  name          VARCHAR(255) NOT NULL,
  description   TEXT,
  urgency_level VARCHAR(20) DEFAULT 'low'
                CHECK (urgency_level IN ('low', 'moderate', 'high', 'emergency')),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Full-text search index on disease name
CREATE INDEX idx_diseases_name_trgm ON diseases USING gin (name gin_trgm_ops);
CREATE INDEX idx_diseases_name_fts  ON diseases USING gin (to_tsvector('english', name));

-- Symptoms: canonical symptom entries
CREATE TABLE IF NOT EXISTS symptoms (
  id        SERIAL PRIMARY KEY,
  name      VARCHAR(255) NOT NULL UNIQUE,
  canonical BOOLEAN      NOT NULL DEFAULT true
);

CREATE INDEX idx_symptoms_name_trgm ON symptoms USING gin (name gin_trgm_ops);

-- Symptom synonyms: maps lay-language terms to canonical symptoms
-- e.g. "tummy ache" → symptom "abdominal_pain"
CREATE TABLE IF NOT EXISTS symptom_synonyms (
  id           SERIAL PRIMARY KEY,
  symptom_id   INTEGER NOT NULL REFERENCES symptoms(id) ON DELETE CASCADE,
  synonym_text VARCHAR(255) NOT NULL
);

CREATE INDEX idx_synonym_text_trgm ON symptom_synonyms USING gin (synonym_text gin_trgm_ops);

-- Disease-symptom mapping with versioned weights
-- weight_source tracks how the weight was computed (sf_idf for V1, classifier later)
-- computed_at lets you re-run weight generation without schema changes
CREATE TABLE IF NOT EXISTS disease_symptoms (
  disease_id    INTEGER NOT NULL REFERENCES diseases(id) ON DELETE CASCADE,
  symptom_id    INTEGER NOT NULL REFERENCES symptoms(id) ON DELETE CASCADE,
  weight        REAL    NOT NULL DEFAULT 0.0,
  weight_source VARCHAR(20) NOT NULL DEFAULT 'sf_idf'
                CHECK (weight_source IN ('sf_idf', 'classifier')),
  computed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (disease_id, symptom_id)
);

CREATE INDEX idx_disease_symptoms_symptom ON disease_symptoms(symptom_id);
