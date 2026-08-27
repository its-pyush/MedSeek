-- Patient authentication and profile tables
-- Auth logic implemented in Phase 2, schema created now to avoid future migration conflicts.

CREATE TABLE IF NOT EXISTS patients (
  id            SERIAL PRIMARY KEY,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_patients_email ON patients(email);

-- Extended patient profile — feeds into search filters and AI context
CREATE TABLE IF NOT EXISTS patient_profiles (
  id                  SERIAL PRIMARY KEY,
  patient_id          INTEGER NOT NULL UNIQUE REFERENCES patients(id) ON DELETE CASCADE,
  age                 INTEGER,
  sex                 VARCHAR(20),
  pregnancy_status    BOOLEAN DEFAULT false,
  existing_conditions JSONB   DEFAULT '[]'::jsonb
);
