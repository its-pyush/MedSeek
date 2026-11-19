-- Confirmed cases reported by users ("A doctor diagnosed me with this"),
-- counted per area and date. Feeds the local boost in search ranking.
--
-- Privacy: a row holds no patient id and no coordinates. The area is a grid
-- cell of 0.5 degrees (about 55 km); cell_lat / cell_lon are the cell's
-- south-west corner in half-degrees (19.0 N -> 38). reporter_hash is a keyed
-- hash of patient + condition, used only so one person counts once per
-- condition per month.
--
-- The condition is stored by name, not id: `npm run seed` replaces the
-- diseases table and renumbers ids.
-- Idempotent, safe to re-run.

CREATE TABLE IF NOT EXISTS case_reports (
  id            BIGSERIAL PRIMARY KEY,
  disease_name  VARCHAR(255) NOT NULL,
  cell_lat      SMALLINT     NOT NULL CHECK (cell_lat BETWEEN -180 AND 179),
  cell_lon      SMALLINT     NOT NULL CHECK (cell_lon BETWEEN -360 AND 359),
  reported_on   DATE         NOT NULL DEFAULT CURRENT_DATE,
  report_month  DATE         NOT NULL DEFAULT date_trunc('month', CURRENT_DATE)::date,
  source        VARCHAR(10)  NOT NULL DEFAULT 'user' CHECK (source IN ('user', 'sample')),
  reporter_hash VARCHAR(64)  NOT NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (reporter_hash, disease_name, report_month)
);

CREATE INDEX IF NOT EXISTS idx_case_reports_area
  ON case_reports (cell_lat, cell_lon, disease_name, reported_on);
