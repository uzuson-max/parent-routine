-- ============================================
-- 간섭이 DB 스키마
-- ============================================

CREATE TABLE journal_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  audio_url       TEXT NOT NULL,
  transcript      TEXT,

  excuses         TEXT[] DEFAULT '{}',
  intentions      TEXT[] DEFAULT '{}',
  contradictions  TEXT[] DEFAULT '{}',
  ai_callout      TEXT,

  call_status     TEXT DEFAULT 'pending',     -- pending | ringing | completed | no_answer | failed
  call_duration   INTEGER,
  call_sid        TEXT
);

CREATE INDEX idx_journal_user_created ON journal_entries(user_id, created_at DESC);

CREATE TABLE user_memory (
  user_id           UUID PRIMARY KEY REFERENCES users(id),
  recurring_excuses TEXT[] DEFAULT '{}',
  recurring_topics  TEXT[] DEFAULT '{}',
  pattern_summary   TEXT,
  entry_count       INTEGER DEFAULT 0,
  updated_at        TIMESTAMPTZ DEFAULT now()
);
