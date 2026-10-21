CREATE TABLE IF NOT EXISTS sessions (
    id BIGSERIAL PRIMARY KEY,
    device_id VARCHAR(128) NOT NULL,
    started_at BIGINT NOT NULL,
    ended_at BIGINT NOT NULL,
    duration_ms BIGINT NOT NULL CHECK (duration_ms >= 0),
    mode SMALLINT NOT NULL CHECK (mode BETWEEN 0 AND 4),
    assist_level SMALLINT NOT NULL CHECK (assist_level BETWEEN 0 AND 100),
    stats JSONB NOT NULL,
    samples JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sessions_device_started_idx
    ON sessions (device_id, started_at DESC);
