-- CargoAlert D1 / SQLite Schema (Compatible with v2.x & v3.1 Dual-Sensor + Remote Recalibrate)
CREATE TABLE IF NOT EXISTS sessions (
  device_id TEXT NOT NULL,
  boot_id TEXT NOT NULL,
  generation INTEGER PRIMARY KEY AUTOINCREMENT,
  created_ms INTEGER NOT NULL,
  UNIQUE(device_id, boot_id)
);

CREATE TABLE IF NOT EXISTS devices (
  device_id TEXT PRIMARY KEY,
  active_gen INTEGER NOT NULL,
  boot_id TEXT NOT NULL,
  seq INTEGER NOT NULL DEFAULT -1,
  snapshot TEXT,
  received_ms INTEGER
);

CREATE TABLE IF NOT EXISTS reports (
  device_id TEXT NOT NULL,
  boot_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  received_ms INTEGER NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY (device_id, boot_id, seq)
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  boot_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  type TEXT NOT NULL,
  occurred_epoch_ms INTEGER,
  uptime_ms INTEGER NOT NULL,
  received_ms INTEGER NOT NULL,
  historical INTEGER NOT NULL DEFAULT 0,
  payload TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS outbox (
  event_id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  retry_key TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending',
  http INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_ms INTEGER NOT NULL DEFAULT 0,
  lease_ms INTEGER NOT NULL DEFAULT 0,
  accepted_ms INTEGER,
  detail TEXT
);

CREATE TABLE IF NOT EXISTS remote_commands (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  boot_id TEXT NOT NULL,
  session_gen INTEGER NOT NULL,
  requested_ms INTEGER NOT NULL,
  expires_ms INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'queued',
  event_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_reports_device_time ON reports(device_id, received_ms DESC);
CREATE INDEX IF NOT EXISTS idx_events_device_time ON events(device_id, received_ms DESC);
CREATE INDEX IF NOT EXISTS idx_outbox_due ON outbox(state, next_ms, lease_ms);
