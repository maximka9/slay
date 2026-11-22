-- 8-й номинант «DOTA 2 — Клип года»: «Судьба керри в 2026» (исходник: дота/рейдж 3.mp4)
INSERT INTO candidates (id, nomination_id, name, image_url, sort_order) VALUES
  ('dota-clip-8', 'dota-clip', 'Судьба керри в 2026', '/assets/generated-previews/dota-clip/dota-clip-08.jpg', 8)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  image_url = excluded.image_url,
  sort_order = excluded.sort_order;

INSERT INTO settings (key, value, updated_at) VALUES
  ('content_schema_version', '8', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('results_dirty', '1', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
