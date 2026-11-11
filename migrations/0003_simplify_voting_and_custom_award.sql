PRAGMA foreign_keys = ON;

-- Preserve all historic meme votes and candidates under a disabled archive row.
UPDATE nominations
SET title = 'Архив номинации 08',
    description = 'Исторические записи номинации «Мем года»',
    sort_order = 108,
    enabled = 0,
    voting_status = 'closed',
    starts_at = NULL,
    ends_at = NULL
WHERE id = 'meme';

UPDATE nominations
SET sort_order = 8, starts_at = NULL, ends_at = NULL
WHERE id = 'chatter';

INSERT INTO nominations (id, title, description, sort_order, voting_status, enabled, starts_at, ends_at)
VALUES (
  'custom-award',
  'Ваша номинация',
  'Твой шанс придумать собственную награду. Предложи номинацию и того, кто заслуживает её получить',
  9,
  COALESCE((SELECT value FROM settings WHERE key = 'voting_status'), 'preparation'),
  1,
  NULL,
  NULL
);

-- Legacy per-category status remains synchronized for backwards compatibility,
-- while application availability is now based only on the global status.
UPDATE nominations
SET voting_status = COALESCE((SELECT value FROM settings WHERE key = 'voting_status'), 'preparation'),
    starts_at = NULL,
    ends_at = NULL
WHERE enabled = 1;

UPDATE settings SET value = '', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE key IN ('voting_starts_at', 'voting_ends_at');

CREATE TABLE custom_award_proposals (
  twitch_user_id TEXT PRIMARY KEY REFERENCES users(twitch_user_id) ON DELETE RESTRICT,
  award_title TEXT NOT NULL CHECK (length(award_title) BETWEEN 1 AND 80),
  recipient TEXT NOT NULL CHECK (length(recipient) BETWEEN 1 AND 120),
  status TEXT NOT NULL DEFAULT 'valid' CHECK (status IN ('valid', 'excluded')),
  exclusion_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  moderated_at TEXT,
  moderated_by TEXT
);

CREATE INDEX custom_award_proposals_status_idx
ON custom_award_proposals(status, updated_at DESC);

CREATE TABLE custom_award_proposal_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  twitch_user_id TEXT NOT NULL REFERENCES users(twitch_user_id) ON DELETE RESTRICT,
  previous_award_title TEXT NOT NULL,
  previous_recipient TEXT NOT NULL,
  new_award_title TEXT NOT NULL,
  new_recipient TEXT NOT NULL,
  changed_at TEXT NOT NULL
);

CREATE TABLE custom_award_selection (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  twitch_user_id TEXT NOT NULL REFERENCES custom_award_proposals(twitch_user_id) ON DELETE RESTRICT,
  award_title TEXT NOT NULL CHECK (length(award_title) BETWEEN 1 AND 80),
  recipient TEXT NOT NULL CHECK (length(recipient) BETWEEN 1 AND 120),
  selected_at TEXT NOT NULL,
  selected_by TEXT NOT NULL
);

INSERT INTO settings (key, value, updated_at) VALUES
  ('content_schema_version', '3', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('results_dirty', '1', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
