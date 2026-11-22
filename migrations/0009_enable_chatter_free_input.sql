-- Включает свободный ввод Twitch-ника в номинации «Чаттер года».
-- Выключить можно кнопкой в админке.
INSERT INTO settings (key, value, updated_at) VALUES
  ('chatter_free_input', '1', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('content_schema_version', '9', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
