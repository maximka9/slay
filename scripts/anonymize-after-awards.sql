-- Обезличивание после церемонии.
-- Запускать только после проверенного бэкапа (npm run db:backup) и финальной публикации итогов:
--   npx wrangler d1 execute camca63-awards-2026 --remote --file scripts/anonymize-after-awards.sql
--
-- Сохраняются: номинации, кандидаты, снимки и опубликованные итоги (results_snapshots / result_entries),
-- выбранная «Ваша номинация» и логин её автора (он и так показан публично как «Предложил: @login»).
-- Удаляются: голоса и их история, сессии, все остальные предложения «Вашей номинации» и пользователи.
-- Порядок важен: сначала зависимые таблицы, потом users (внешние ключи ON DELETE RESTRICT).

DELETE FROM sessions;
DELETE FROM oauth_states;
DELETE FROM rate_limits;

-- В details хранятся Twitch ID и тексты предложений — тоже стираем.
UPDATE moderation_actions
SET target_user_id = NULL, target_vote_id = NULL, reason = NULL, comment = NULL, details = NULL;

DELETE FROM vote_history;
DELETE FROM votes;

DELETE FROM custom_award_proposal_history;
DELETE FROM custom_award_proposals
WHERE twitch_user_id NOT IN (SELECT twitch_user_id FROM custom_award_selection);

DELETE FROM users
WHERE twitch_user_id NOT IN (SELECT twitch_user_id FROM custom_award_selection);

-- У автора выбранной награды оставляем только логин и отображаемое имя.
UPDATE users
SET avatar_url = '', twitch_created_at = '', first_seen_at = '', last_seen_at = '';
