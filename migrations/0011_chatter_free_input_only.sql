-- «Чаттер года»: только свободный ввод ника, голосовать за себя нельзя.
-- Уже поданные голоса за самого себя исключаются с причиной «Голос за себя».
UPDATE votes
SET status = 'excluded',
    exclusion_reason = 'Голос за себя',
    exclusion_comment = 'Автоматически: миграция 0011',
    moderated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE status = 'valid'
  AND EXISTS (
    SELECT 1 FROM candidates c
    WHERE c.id = votes.candidate_id
      AND c.twitch_user_id IS NOT NULL
      AND c.twitch_user_id = votes.twitch_user_id
  );

-- Если что-то исключили — результаты нужно пересчитать.
UPDATE settings
SET value = '1', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE key = 'results_dirty'
  AND EXISTS (SELECT 1 FROM votes WHERE exclusion_comment = 'Автоматически: миграция 0011');

INSERT INTO settings (key, value, updated_at) VALUES
  ('chatter_free_input', '1', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
