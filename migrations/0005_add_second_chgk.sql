PRAGMA foreign_keys = ON;

-- Keep the stable ID and every existing vote for the first event.
UPDATE candidates
SET name = 'Что? Где? Когда? №1',
    image_url = '/assets/nominees/event/chgk.png'
WHERE id = 'event-chgk' AND nomination_id = 'event';

-- Move existing rows out of the unique sort-order range before inserting №2.
UPDATE candidates
SET sort_order = sort_order + 100
WHERE nomination_id = 'event' AND id <> 'event-chgk';

INSERT INTO candidates (id, nomination_id, name, image_url, sort_order)
VALUES ('event-chgk-2', 'event', 'Что? Где? Когда? №2', '/assets/nominees/event/chgk-2.png', 2);

UPDATE candidates
SET sort_order = CASE id
  WHEN 'event-chudo' THEN 3
  WHEN 'event-logika' THEN 4
  WHEN 'event-turnir-1' THEN 5
  WHEN 'event-turnir-2' THEN 6
  ELSE sort_order
END
WHERE nomination_id = 'event' AND id NOT IN ('event-chgk', 'event-chgk-2');

INSERT INTO settings (key, value, updated_at) VALUES
  ('content_schema_version', '5', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('results_dirty', '1', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
