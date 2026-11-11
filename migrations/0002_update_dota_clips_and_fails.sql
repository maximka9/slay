PRAGMA foreign_keys = ON;

-- The old semantic categories remain archived so existing votes and snapshots keep
-- their original meaning. The public replacement categories use new stable IDs.
CREATE TABLE migration_reports (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  old_clip_votes INTEGER NOT NULL,
  old_rage_votes INTEGER NOT NULL,
  details TEXT NOT NULL
);

INSERT INTO migration_reports (id, created_at, old_clip_votes, old_rage_votes, details)
SELECT '0002-dota-fail', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  COALESCE(SUM(CASE WHEN nomination_id = 'clip' THEN 1 ELSE 0 END), 0),
  COALESCE(SUM(CASE WHEN nomination_id = 'rage' THEN 1 ELSE 0 END), 0),
  'Old votes were archived in their original categories and were not transferred to the new nominations.'
FROM votes;

UPDATE nominations
SET title = 'Архив номинации 05', description = 'Исторические записи до обновления состава',
    sort_order = 105, enabled = 0, voting_status = 'closed'
WHERE id = 'clip';

UPDATE nominations
SET title = 'Архив номинации 07', description = 'Исторические записи до обновления состава',
    sort_order = 107, enabled = 0, voting_status = 'closed'
WHERE id = 'rage';

-- Historical Rage candidates reuse the new preview paths without changing IDs or votes.
UPDATE candidates SET image_url = '/assets/generated-previews/dota-clip/dota-clip-06.jpg' WHERE id = 'rage-1';
UPDATE candidates SET image_url = '/assets/generated-previews/dota-clip/dota-clip-07.jpg' WHERE id = 'rage-2';

INSERT INTO nominations (id, title, description, sort_order, voting_status, enabled) VALUES
  ('dota-clip', 'DOTA 2 — Клип года', 'Лучшие моменты Dota 2: невероятные мувы, неожиданные развязки и эпизоды, которые хочется пересматривать', 5, 'preparation', 1),
  ('fail', 'Фейл года', 'Моменты, когда всё пошло не по плану. Самые нелепые ошибки, неожиданные провалы и ситуации, которые невозможно забыть', 7, 'preparation', 1);

INSERT INTO candidates (id, nomination_id, name, image_url, sort_order) VALUES
  ('dota-clip-1', 'dota-clip', 'Dota 2 — клип №1', '/assets/generated-previews/dota-clip/dota-clip-01.jpg', 1),
  ('dota-clip-2', 'dota-clip', 'Dota 2 — клип №2', '/assets/generated-previews/dota-clip/dota-clip-02.jpg', 2),
  ('dota-clip-3', 'dota-clip', 'Dota 2 — клип №3', '/assets/generated-previews/dota-clip/dota-clip-03.jpg', 3),
  ('dota-clip-4', 'dota-clip', 'Dota 2 — клип №4', '/assets/generated-previews/dota-clip/dota-clip-04.jpg', 4),
  ('dota-clip-5', 'dota-clip', 'Dota 2 — клип №5', '/assets/generated-previews/dota-clip/dota-clip-05.jpg', 5),
  ('dota-clip-6', 'dota-clip', 'Dota 2 — клип №6', '/assets/generated-previews/dota-clip/dota-clip-06.jpg', 6),
  ('dota-clip-7', 'dota-clip', 'Dota 2 — клип №7', '/assets/generated-previews/dota-clip/dota-clip-07.jpg', 7),
  ('fail-1', 'fail', 'Фейл №1', '/assets/generated-previews/fail/fail-01.jpg', 1),
  ('fail-2', 'fail', 'Фейл №2', '/assets/generated-previews/fail/fail-02.jpg', 2),
  ('fail-3', 'fail', 'Фейл №3', '/assets/generated-previews/fail/fail-03.jpg', 3),
  ('fail-4', 'fail', 'Фейл №4', '/assets/generated-previews/fail/fail-04.jpg', 4),
  ('fail-5', 'fail', 'Фейл №5', '/assets/generated-previews/fail/fail-05.jpg', 5),
  ('fail-6', 'fail', 'Фейл №6', '/assets/generated-previews/fail/fail-06.jpg', 6),
  ('fail-7', 'fail', 'Фейл №7', '/assets/generated-previews/fail/fail-07.jpg', 7),
  ('fail-8', 'fail', 'Фейл №8', '/assets/generated-previews/fail/fail-08.jpg', 8);

CREATE TABLE ceremony_exceptions (
  snapshot_id TEXT NOT NULL REFERENCES results_snapshots(id) ON DELETE CASCADE,
  nomination_id TEXT NOT NULL REFERENCES nominations(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('no_winner')),
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  admin_twitch_user_id TEXT NOT NULL,
  PRIMARY KEY (snapshot_id, nomination_id)
);

INSERT INTO settings (key, value, updated_at) VALUES
  ('content_schema_version', '2', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;

INSERT INTO settings (key, value, updated_at) VALUES
  ('results_dirty', '1', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
