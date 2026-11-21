-- GloveBox's saved data (src/storage/sqliteStorage.ts reads and writes it).
-- sqlx records each migration's checksum: never edit one that has shipped,
-- add the next file instead (src-tauri/src/migrations.rs lists them).

-- Settings and calibration profiles, as JSON values
CREATE TABLE kv (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

-- Lessons the performer recorded or imported (built-in lessons ship in code).
-- A removed lesson keeps its row with deleted_at set.
CREATE TABLE lessons (
  id TEXT PRIMARY KEY NOT NULL,
  version INTEGER NOT NULL,
  origin TEXT NOT NULL CHECK (origin IN ('recorded', 'imported')),
  name TEXT NOT NULL,
  tier INTEGER NOT NULL CHECK (tier BETWEEN 1 AND 5),
  def_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

-- Every finished practice session, append-only: progress, unlocks and
-- streaks are worked out from these (src/progression/derive.ts)
CREATE TABLE sessions (
  id TEXT PRIMARY KEY NOT NULL,
  lesson_id TEXT NOT NULL,
  lesson_version INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  day TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  tracker TEXT NOT NULL CHECK (tracker IN ('landmarks', 'leds')),
  tempo REAL NOT NULL,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'normal', 'hard')),
  accuracy REAL NOT NULL,
  grade TEXT NOT NULL CHECK (grade IN ('S', 'A', 'B', 'C', 'D')),
  stars INTEGER NOT NULL CHECK (stars BETWEEN 0 AND 3),
  max_combo INTEGER NOT NULL,
  mean_lag_ms REAL NOT NULL,
  per_finger_json TEXT NOT NULL
);

CREATE INDEX sessions_by_lesson ON sessions (lesson_id, started_at);
