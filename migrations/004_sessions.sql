-- 004_sessions.sql — Сессионный трекинг пользователей

CREATE TABLE IF NOT EXISTS analytics_sessions (
  id               BIGSERIAL PRIMARY KEY,
  tg_user_id       BIGINT,
  session_token    TEXT UNIQUE NOT NULL,
  started_at       TIMESTAMPTZ DEFAULT NOW(),
  ended_at         TIMESTAMPTZ,
  duration_seconds INT,
  screens_visited  INT DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_sessions_user    ON analytics_sessions(tg_user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_started ON analytics_sessions(started_at);
