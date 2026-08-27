-- Audit log — records every data access attempt (success or failure)
-- Implemented in Phase 5, schema created now.

CREATE TABLE IF NOT EXISTS access_log (
  id           SERIAL PRIMARY KEY,
  patient_id   INTEGER      NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  action       VARCHAR(50)  NOT NULL,
  target_table VARCHAR(50),
  target_id    INTEGER,
  success      BOOLEAN      NOT NULL DEFAULT true,
  timestamp    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_access_log_patient   ON access_log(patient_id);
CREATE INDEX idx_access_log_timestamp ON access_log(patient_id, timestamp DESC);
