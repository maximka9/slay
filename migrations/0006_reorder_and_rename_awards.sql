PRAGMA foreign_keys = ON;

-- Move only the affected active rows through unused sort positions so the
-- unique sort_order constraint remains valid. Nomination IDs stay unchanged.
UPDATE nominations
SET sort_order = sort_order + 200
WHERE id IN ('irl', 'dota-clip', 'fail');

UPDATE nominations
SET sort_order = CASE id
  WHEN 'dota-clip' THEN 4
  WHEN 'fail' THEN 5
  WHEN 'irl' THEN 7
  ELSE sort_order
END
WHERE id IN ('irl', 'dota-clip', 'fail');

UPDATE nominations
SET title = CASE id
  WHEN 'irl' THEN 'IRL года'
  ELSE title
END,
description = CASE id
  WHEN 'indie-game' THEN 'Игра на один стрим, но зато какой!'
  WHEN 'game' THEN 'Игра, подарившая больше всех эмоций, геймплей которой можно распечатать покадрово и повесить на стену'
  WHEN 'event' THEN 'Ну самса вообще ивент-менеджер никакой, даже презентацию сделать не может!'
  WHEN 'dota-clip' THEN 'Куда же без DOTA 2 - 70% стримов проводились в этой игре'
  WHEN 'fail' THEN 'Классика - тп на т3, не попал по кнопке, носки не та надел.'
  WHEN 'community-drop' THEN 'Я говорил, что у меня самая сильная аудитория по ауре?'
  WHEN 'irl' THEN 'Ваши любимые алкостримы и кукинги'
  WHEN 'chatter' THEN 'Самый крутой гей на районе'
  ELSE description
END
WHERE id IN ('indie-game', 'game', 'event', 'dota-clip', 'fail', 'community-drop', 'irl', 'chatter');

UPDATE candidates
SET name = CASE id
  WHEN 'dota-clip-1' THEN 'Вчера моя мне возразить решила...'
  WHEN 'dota-clip-2' THEN 'Веселая ферма'
  WHEN 'dota-clip-3' THEN 'Выбирай одну шмотку'
  WHEN 'dota-clip-4' THEN 'Настучал'
  WHEN 'dota-clip-5' THEN 'Бесконечная битва'
  WHEN 'dota-clip-6' THEN 'Добрый стример'
  WHEN 'dota-clip-7' THEN 'Записки психиатра'
  ELSE name
END
WHERE nomination_id = 'dota-clip';

UPDATE candidates
SET name = CASE id
  WHEN 'fail-1' THEN 'Золотые купола'
  WHEN 'fail-2' THEN 'Победный вейв'
  WHEN 'fail-3' THEN 'В себя поверил?'
  WHEN 'fail-4' THEN 'АААААРБУУУУУУЗ'
  WHEN 'fail-5' THEN '1000 игр на лансере'
  WHEN 'fail-6' THEN 'Опа'
  WHEN 'fail-7' THEN 'Отвлекся'
  WHEN 'fail-8' THEN 'Прикинь я проиграл...'
  ELSE name
END
WHERE nomination_id = 'fail';

UPDATE candidates
SET name = CASE id
  WHEN 'community-drop-1' THEN 'Ангельский голос'
  WHEN 'community-drop-2' THEN 'Как я эту игру зае*алась играть'
  WHEN 'community-drop-3' THEN 'Интересный донат'
  WHEN 'community-drop-4' THEN 'Ему нравится'
  WHEN 'community-drop-5' THEN 'Найс тайминг'
  WHEN 'community-drop-6' THEN 'Самарские авиалинии'
  WHEN 'community-drop-7' THEN 'Без посадки авто нет'
  ELSE name
END
WHERE nomination_id = 'community-drop';

INSERT INTO settings (key, value, updated_at) VALUES
  ('content_schema_version', '6', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('results_dirty', '1', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
