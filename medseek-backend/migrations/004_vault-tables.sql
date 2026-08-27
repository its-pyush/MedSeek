-- Encrypted health record vault (personal-only)
-- Encryption logic implemented in Phase 4, schema created now.
-- encrypted_data uses bytea for server-managed encryption at rest.

CREATE TABLE IF NOT EXISTS health_records (
  id             SERIAL PRIMARY KEY,
  patient_id     INTEGER      NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  record_type    VARCHAR(20)  NOT NULL
                 CHECK (record_type IN ('condition', 'medication', 'allergy', 'report')),
  encrypted_data BYTEA        NOT NULL,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_health_records_patient ON health_records(patient_id);
CREATE INDEX idx_health_records_type    ON health_records(patient_id, record_type);
