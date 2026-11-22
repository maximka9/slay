-- Время модерации храним отдельно, updated_at = время последнего выбора зрителя.
ALTER TABLE votes ADD COLUMN moderated_at TEXT;
