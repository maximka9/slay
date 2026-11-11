PRAGMA foreign_keys = ON;

-- Each transition back to preparation/open starts a new visibility generation.
-- Older rows remain as an audit trail but cannot expose a later voting cycle.
CREATE TABLE result_publications (
  snapshot_id TEXT NOT NULL REFERENCES results_snapshots(id) ON DELETE RESTRICT,
  nomination_id TEXT NOT NULL REFERENCES nominations(id) ON DELETE RESTRICT,
  publication_cycle INTEGER NOT NULL CHECK (publication_cycle >= 0),
  published_at TEXT NOT NULL,
  published_by TEXT NOT NULL,
  PRIMARY KEY (snapshot_id, nomination_id, publication_cycle)
);

CREATE INDEX result_publications_cycle_idx
ON result_publications(publication_cycle, snapshot_id);

INSERT INTO settings (key, value, updated_at) VALUES
  ('publication_cycle', '1', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('custom_award_published', '0', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('content_schema_version', '4', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;

-- Keep already published standard results visible until the administrator starts
-- another preparation/open cycle. The custom award deliberately starts hidden.
INSERT INTO result_publications
  (snapshot_id, nomination_id, publication_cycle, published_at, published_by)
SELECT e.snapshot_id, e.nomination_id, 1, s.created_at, s.created_by
FROM result_entries e
JOIN results_snapshots s ON s.id = e.snapshot_id
WHERE e.published = 1 AND e.nomination_id <> 'custom-award'
GROUP BY e.snapshot_id, e.nomination_id;
