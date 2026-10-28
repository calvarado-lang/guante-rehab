CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY,
    display_name VARCHAR(160) NOT NULL,
    patient_code VARCHAR(64) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS calibrations (
    id UUID PRIMARY KEY,
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    flexion_min JSONB NOT NULL,
    flexion_max JSONB NOT NULL,
    movement_range JSONB NOT NULL,
    emg_baseline DOUBLE PRECISION NOT NULL,
    emg_mvc DOUBLE PRECISION NOT NULL,
    sample_count INTEGER NOT NULL CHECK (sample_count >= 0),
    notes VARCHAR(1000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS calibrations_profile_created_idx
    ON calibrations (profile_id, created_at DESC);

CREATE TABLE IF NOT EXISTS routines (
    id UUID PRIMARY KEY,
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    name VARCHAR(160) NOT NULL,
    target_movement_range JSONB NOT NULL,
    mode SMALLINT NOT NULL CHECK (mode BETWEEN 0 AND 4),
    assist_level SMALLINT NOT NULL CHECK (assist_level BETWEEN 0 AND 100),
    repetitions SMALLINT NOT NULL CHECK (repetitions BETWEEN 1 AND 100),
    rest_seconds INTEGER NOT NULL CHECK (rest_seconds BETWEEN 0 AND 600),
    steps JSONB NOT NULL,
    status VARCHAR(16) NOT NULL CHECK (status IN ('proposed', 'approved', 'archived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS routines_profile_created_idx
    ON routines (profile_id, created_at DESC);

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

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS calibration_id UUID REFERENCES calibrations(id) ON DELETE SET NULL;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS routine_id UUID REFERENCES routines(id) ON DELETE SET NULL;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS exercise_name VARCHAR(160);

CREATE INDEX IF NOT EXISTS sessions_device_started_idx
    ON sessions (device_id, started_at DESC);

CREATE INDEX IF NOT EXISTS sessions_profile_started_idx
    ON sessions (profile_id, started_at DESC);
