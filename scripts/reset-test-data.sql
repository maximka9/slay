-- Сброс тестовых голосов и результатов перед стартом голосования.
-- ЗАПУСКАТЬ ТОЛЬКО ПОСЛЕ БЭКАПА:  npm run db:backup
-- Затем:  npx wrangler d1 execute camca63-awards-2026 --remote --file scripts/reset-test-data.sql
--
-- Что удаляется: все голоса и их история, предложения «Вашей номинации», снимки результатов,
-- ничьи, «без победителя», публикации.
-- Также удаляются ники «Чаттера» — их создают зрители при голосовании.
-- Что НЕ удаляется: пользователи, номинации, обычные кандидаты, настройки,
-- журнал действий (moderation_actions) — в него добавляется запись о сбросе.
-- Порядок: сначала зависимые таблицы, потом родительские (внешние ключи).

DELETE FROM vote_history;
DELETE FROM votes;
DELETE FROM custom_award_selection;
DELETE FROM custom_award_proposal_history;
DELETE FROM custom_award_proposals;
DELETE FROM result_publications;
DELETE FROM tie_resolutions;
DELETE FROM ceremony_exceptions;
DELETE FROM result_entries;
DELETE FROM results_snapshots;
DELETE FROM rate_limits;

-- Ники «Чаттера» создаются зрителями при голосовании — после удаления голосов они не нужны.
-- Строка стоит после удаления votes / vote_history / result_entries / tie_resolutions (внешние ключи).
DELETE FROM candidates WHERE nomination_id = 'chatter';

INSERT INTO settings (key, value, updated_at) VALUES
  ('current_snapshot_id', '', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('results_dirty', '0', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('custom_award_published', '0', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('voting_status', 'preparation', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;

UPDATE nominations SET voting_status = 'preparation' WHERE enabled = 1;

INSERT INTO moderation_actions (action, details, created_at, admin_twitch_user_id)
VALUES ('reset_test_data', '{"script":"scripts/reset-test-data.sql"}', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'system');
