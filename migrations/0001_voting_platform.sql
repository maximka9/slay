PRAGMA foreign_keys = ON;

CREATE TABLE users (
  twitch_user_id TEXT PRIMARY KEY,
  login TEXT NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT NOT NULL DEFAULT '',
  twitch_created_at TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE TABLE nominations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  sort_order INTEGER NOT NULL UNIQUE,
  voting_status TEXT NOT NULL DEFAULT 'preparation' CHECK (voting_status IN ('preparation', 'open', 'closed')),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  starts_at TEXT,
  ends_at TEXT
);

CREATE TABLE candidates (
  id TEXT PRIMARY KEY,
  nomination_id TEXT NOT NULL REFERENCES nominations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  image_url TEXT NOT NULL DEFAULT '',
  twitch_user_id TEXT,
  twitch_login TEXT,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  sort_order INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (nomination_id, sort_order),
  UNIQUE (nomination_id, twitch_user_id),
  UNIQUE (nomination_id, twitch_login)
);

CREATE INDEX candidates_nomination_idx ON candidates(nomination_id, enabled, sort_order);

CREATE TABLE votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nomination_id TEXT NOT NULL REFERENCES nominations(id) ON DELETE RESTRICT,
  candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE RESTRICT,
  twitch_user_id TEXT NOT NULL REFERENCES users(twitch_user_id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'valid' CHECK (status IN ('valid', 'excluded')),
  exclusion_reason TEXT,
  exclusion_comment TEXT,
  UNIQUE (nomination_id, twitch_user_id)
);

CREATE INDEX votes_candidate_status_idx ON votes(candidate_id, status);
CREATE INDEX votes_user_idx ON votes(twitch_user_id, updated_at);

CREATE TABLE vote_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vote_id INTEGER NOT NULL REFERENCES votes(id) ON DELETE CASCADE,
  previous_candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE RESTRICT,
  new_candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE RESTRICT,
  changed_at TEXT NOT NULL
);

CREATE TABLE moderation_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_user_id TEXT REFERENCES users(twitch_user_id) ON DELETE SET NULL,
  target_vote_id INTEGER REFERENCES votes(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  reason TEXT,
  comment TEXT,
  details TEXT,
  created_at TEXT NOT NULL,
  admin_twitch_user_id TEXT NOT NULL
);

CREATE INDEX moderation_created_idx ON moderation_actions(created_at DESC);

CREATE TABLE sessions (
  id_hash TEXT PRIMARY KEY,
  twitch_user_id TEXT NOT NULL REFERENCES users(twitch_user_id) ON DELETE CASCADE,
  csrf_token TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX sessions_user_idx ON sessions(twitch_user_id, expires_at);

CREATE TABLE oauth_states (
  state_hash TEXT PRIMARY KEY,
  return_to TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE rate_limits (
  actor_hash TEXT NOT NULL,
  action TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  request_count INTEGER NOT NULL,
  PRIMARY KEY (actor_hash, action, window_start)
);

CREATE TABLE results_snapshots (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  revision INTEGER NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('final', 'published')),
  created_by TEXT NOT NULL,
  source_last_vote_at TEXT
);

CREATE TABLE result_entries (
  snapshot_id TEXT NOT NULL REFERENCES results_snapshots(id) ON DELETE CASCADE,
  nomination_id TEXT NOT NULL REFERENCES nominations(id) ON DELETE RESTRICT,
  candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE RESTRICT,
  vote_count INTEGER NOT NULL CHECK (vote_count >= 0),
  rank INTEGER NOT NULL CHECK (rank >= 1),
  is_winner INTEGER NOT NULL DEFAULT 0 CHECK (is_winner IN (0, 1)),
  is_tie INTEGER NOT NULL DEFAULT 0 CHECK (is_tie IN (0, 1)),
  published INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0, 1)),
  PRIMARY KEY (snapshot_id, nomination_id, candidate_id)
);

CREATE INDEX result_entries_public_idx ON result_entries(snapshot_id, published, nomination_id, rank);

CREATE TABLE tie_resolutions (
  snapshot_id TEXT NOT NULL REFERENCES results_snapshots(id) ON DELETE CASCADE,
  nomination_id TEXT NOT NULL REFERENCES nominations(id) ON DELETE RESTRICT,
  candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL,
  resolved_at TEXT NOT NULL,
  admin_twitch_user_id TEXT NOT NULL,
  PRIMARY KEY (snapshot_id, nomination_id)
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO settings (key, value, updated_at) VALUES
  ('voting_status', 'preparation', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('voting_starts_at', '', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('voting_ends_at', '', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('display_timezone', 'Europe/Moscow', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('current_snapshot_id', '', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('results_dirty', '0', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('chatter_free_input', '0', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

INSERT INTO nominations (id, title, description, sort_order) VALUES
  ('indie-game', 'Инди-игра года', 'Небольшие студии. Большие впечатления', 1),
  ('game', 'Игра года', 'Главное игровое впечатление 2026 года', 2),
  ('event', 'Ивент года', 'Событие, которое объединило зрителей', 3),
  ('irl', 'Лучший ИРЛ с друзьями', 'Встречи, поездки, готовка и самые непредсказуемые моменты за пределами игр', 4),
  ('clip', 'Клип года', 'Несколько секунд, которые хочется пересматривать', 5),
  ('community-drop', 'Завоз от комьюнити', 'Самые яркие моменты, подаренные комьюнити', 6),
  ('rage', 'Рейдж', 'Моменты, когда терпение закончилось', 7),
  ('meme', 'Мем года', 'Шутка, которая давно живёт своей жизнью', 8),
  ('chatter', 'Чаттер года', 'Самый запоминающийся участник комьюнити 2026 года', 9);

INSERT INTO candidates (id, nomination_id, name, image_url, sort_order) VALUES
  ('indie-1', 'indie-game', 'BOMBANANA!', '/assets/nominees/indie-game/BOMBANANA!.jpeg', 1),
  ('indie-2', 'indie-game', 'Fears to Fathom: Scratch Creek', '/assets/nominees/indie-game/Fears to Fathom - Scratch Creek.jpg', 2),
  ('indie-3', 'indie-game', 'meccha', '/assets/nominees/indie-game/meccha.jpeg', 3),
  ('indie-4', 'indie-game', 'No, I''m Not a Human', '/assets/nominees/indie-game/no im no human.jpeg', 4),
  ('indie-5', 'indie-game', 'PEAK', '/assets/nominees/indie-game/peak.jpeg', 5),
  ('indie-6', 'indie-game', 'The Operator', '/assets/nominees/indie-game/the-operator.png', 6),
  ('indie-7', 'indie-game', 'Who''s Lila?', '/assets/nominees/indie-game/whos lila.jpeg', 7),
  ('indie-8', 'indie-game', 'R.E.P.O.', '/assets/nominees/indie-game/repo.jpeg', 8),
  ('game-1', 'game', 'Heavy Rain', '/assets/nominees/game/heavyrain.webp', 1),
  ('game-2', 'game', 'Resident Evil 2', '/assets/nominees/game/re 2.jpg', 2),
  ('game-3', 'game', 'Resident Evil 4', '/assets/nominees/game/re 4.jpg', 3),
  ('game-4', 'game', 'Red Dead Redemption 2', '/assets/nominees/game/Red Dead Redemption 2.jpg', 4),
  ('game-5', 'game', 'The Last of Us Part I', '/assets/nominees/game/The Last of Us Part I.jpg', 5),
  ('game-6', 'game', 'The Witcher 3: Wild Hunt', '/assets/nominees/game/The Witcher 3 Wild Hunt Remastered.jpeg', 6),
  ('game-7', 'game', 'The Last of Us Part II', '/assets/nominees/game/The_last_of_us_2_cover.png', 7),
  ('game-8', 'game', 'Black Myth: Wukong', '/assets/nominees/game/wukong.jpg', 8),
  ('game-9', 'game', 'Resident Evil 7: Biohazard', '/assets/nominees/game/Арт_Resident_Evil_7_biohazard.jpg', 9),
  ('game-10', 'game', 'Clair Obscur: Expedition 33', '/assets/nominees/game/Clair Obscur Expedition 33.jpeg', 10),
  ('event-chgk', 'event', 'Что? Где? Когда?', '/assets/nominees/event/chgk.png', 1),
  ('event-chudo', 'event', 'Чудо-полес', '/assets/nominees/event/chudo.jpg', 2),
  ('event-logika', 'event', 'Где логика?', '/assets/nominees/event/logika.png', 3),
  ('event-turnir-1', 'event', 'Новогодний турнир', '/assets/nominees/event/turnir1.png', 4),
  ('event-turnir-2', 'event', 'The International 141', '/assets/nominees/event/turnir2.png', 5),
  ('irl-moscow', 'irl', 'Монстры на каникулах в Москве', '/assets/nominees/irl/monsters-moscow.jpg', 1),
  ('irl-part-2', 'irl', 'Монстры на каникулах — часть 2', '/assets/nominees/irl/monsters-part-2.jpg', 2),
  ('irl-chat-roulette', 'irl', 'Чат-рулетка', '/assets/generated-previews/irl/chat-roulette.jpg', 3),
  ('cooking-beef', 'irl', 'Говядина Веллингтон', '/assets/nominees/cooking/beef-wellington.jpg', 4),
  ('cooking-pizza', 'irl', 'Готовим пиццу', '/assets/generated-previews/cooking/pizza.jpg', 5),
  ('cooking-moscow', 'irl', 'Московский алкокукинг', '/assets/nominees/cooking/moscow-local-cooking.jpg', 6),
  ('community-drop-1', 'community-drop', 'Завоз №1', '/assets/generated-previews/community-drop/community-drop-1.jpg', 1),
  ('community-drop-2', 'community-drop', 'Завоз №2', '/assets/generated-previews/community-drop/community-drop-2.jpg', 2),
  ('community-drop-3', 'community-drop', 'Завоз №3', '/assets/generated-previews/community-drop/community-drop-3.jpg', 3),
  ('community-drop-4', 'community-drop', 'Завоз №4', '/assets/generated-previews/community-drop/community-drop-4.jpg', 4),
  ('community-drop-5', 'community-drop', 'Завоз №5', '/assets/generated-previews/community-drop/community-drop-5.jpg', 5),
  ('community-drop-6', 'community-drop', 'Завоз №6', '/assets/generated-previews/community-drop/community-drop-6.jpg', 6),
  ('community-drop-7', 'community-drop', 'Завоз №7', '/assets/generated-previews/community-drop/community-drop-7.jpg', 7),
  ('rage-1', 'rage', 'Рейдж №1', '/assets/generated-previews/rage/rage-1.jpg', 1),
  ('rage-2', 'rage', 'Рейдж №2', '/assets/generated-previews/rage/rage-2.jpg', 2);
