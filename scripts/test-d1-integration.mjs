import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const wrangler = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
const database = 'camca63-awards-2026';
const testUser = '__camca63_d1_integration__';

function execute(sql) {
  const output = execFileSync(process.execPath, [wrangler, 'd1', 'execute', database, '--local', '--json', '--command', sql], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'],
  });
  return JSON.parse(output);
}

const schema = execute(`
  SELECT id, sort_order FROM nominations WHERE enabled = 1 ORDER BY sort_order;
  SELECT id, enabled FROM nominations WHERE id = 'meme';
  SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'custom_award%';
  SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'result_publications';
`);

assert.deepEqual(schema[0].results.map(row => row.id), [
  'indie-game', 'game', 'event', 'irl', 'dota-clip', 'community-drop', 'fail', 'chatter', 'custom-award',
]);
assert.deepEqual(schema[0].results.map(row => row.sort_order), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
assert.equal(schema[1].results[0]?.enabled, 0);
assert.deepEqual(schema[2].results.map(row => row.name).sort(), [
  'custom_award_proposal_history', 'custom_award_proposals', 'custom_award_selection',
]);
assert.equal(schema[3].results[0]?.name, 'result_publications');

const publicationSettings = execute(`
  SELECT key, value FROM settings WHERE key IN ('publication_cycle', 'custom_award_published') ORDER BY key;
`)[0].results;
const originalPublicationCycle = publicationSettings.find(row => row.key === 'publication_cycle')?.value ?? '1';
const originalCustomPublished = publicationSettings.find(row => row.key === 'custom_award_published')?.value ?? '0';

execute(`
  DELETE FROM custom_award_selection WHERE twitch_user_id = '${testUser}';
  DELETE FROM custom_award_proposal_history WHERE twitch_user_id = '${testUser}';
  DELETE FROM custom_award_proposals WHERE twitch_user_id = '${testUser}';
  DELETE FROM votes WHERE twitch_user_id = '${testUser}';
  DELETE FROM users WHERE twitch_user_id = '${testUser}';
  INSERT INTO users (twitch_user_id, login, display_name, avatar_url, twitch_created_at, first_seen_at, last_seen_at)
  VALUES ('${testUser}', 'd1_test', 'D1 Test', '', '2020-01-01T00:00:00.000Z', '2026-11-11T00:00:00.000Z', '2026-11-11T00:00:00.000Z');
  INSERT INTO custom_award_proposals (twitch_user_id, award_title, recipient, status, created_at, updated_at)
  VALUES ('${testUser}', 'Первая награда', 'Первый получатель', 'valid', '2026-11-11T00:00:00.000Z', '2026-11-11T00:00:00.000Z');
  INSERT INTO votes (nomination_id, candidate_id, twitch_user_id, created_at, updated_at, status)
  VALUES ('game', 'game-1', '${testUser}', '2026-11-11T00:00:00.000Z', '2026-11-11T00:00:00.000Z', 'valid');
  INSERT INTO custom_award_proposal_history
    (twitch_user_id, previous_award_title, previous_recipient, new_award_title, new_recipient, changed_at)
  VALUES ('${testUser}', 'Первая награда', 'Первый получатель', 'Обновлённая награда', 'Новый получатель', '2026-11-11T00:01:00.000Z');
  UPDATE custom_award_proposals SET award_title = 'Обновлённая награда', recipient = 'Новый получатель', updated_at = '2026-11-11T00:01:00.000Z'
  WHERE twitch_user_id = '${testUser}';
`);

const lifecycle = execute(`
  SELECT award_title AS awardTitle, recipient, status FROM custom_award_proposals WHERE twitch_user_id = '${testUser}';
  SELECT COUNT(*) AS historyCount FROM custom_award_proposal_history WHERE twitch_user_id = '${testUser}';
`);
assert.deepEqual(lifecycle[0].results[0], { awardTitle: 'Обновлённая награда', recipient: 'Новый получатель', status: 'valid' });
assert.equal(lifecycle[1].results[0]?.historyCount, 1);

for (const status of ['preparation', 'open', 'closed']) {
  execute(`
    UPDATE settings SET value = '${status}' WHERE key = 'voting_status';
    UPDATE nominations SET voting_status = '${status}' WHERE enabled = 1;
  `);
  const state = execute(`
    SELECT value FROM settings WHERE key = 'voting_status';
    SELECT COUNT(*) AS mismatches FROM nominations WHERE enabled = 1 AND voting_status <> '${status}';
    SELECT COUNT(*) AS voteCount FROM votes WHERE twitch_user_id = '${testUser}' AND status = 'valid';
  `);
  assert.equal(state[0].results[0]?.value, status);
  assert.equal(state[1].results[0]?.mismatches, 0);
  assert.equal(state[2].results[0]?.voteCount, 1);
}

const testSnapshot = 'snapshot-__camca63_publication_integration__';
execute(`
  DELETE FROM result_publications WHERE snapshot_id = '${testSnapshot}';
  DELETE FROM result_entries WHERE snapshot_id = '${testSnapshot}';
  DELETE FROM results_snapshots WHERE id = '${testSnapshot}';
  INSERT INTO results_snapshots (id, created_at, revision, status, created_by)
  VALUES ('${testSnapshot}', '2026-11-11T00:02:00.000Z', (SELECT COALESCE(MAX(revision), 0) + 1 FROM results_snapshots), 'published', 'integration-test');
  INSERT INTO result_entries (snapshot_id, nomination_id, candidate_id, vote_count, rank, is_winner, is_tie, published)
  VALUES ('${testSnapshot}', 'game', 'game-1', 1, 1, 1, 0, 1);
  UPDATE settings SET value = '700', updated_at = '2026-11-11T00:02:00.000Z' WHERE key = 'publication_cycle';
  UPDATE settings SET value = '0', updated_at = '2026-11-11T00:02:00.000Z' WHERE key = 'custom_award_published';
  INSERT INTO result_publications (snapshot_id, nomination_id, publication_cycle, published_at, published_by)
  VALUES ('${testSnapshot}', 'game', 700, '2026-11-11T00:02:00.000Z', 'integration-test');
`);

let visibility = execute(`
  SELECT COUNT(*) AS visible FROM result_entries e JOIN result_publications p
    ON p.snapshot_id = e.snapshot_id AND p.nomination_id = e.nomination_id
    AND p.publication_cycle = (SELECT CAST(value AS INTEGER) FROM settings WHERE key = 'publication_cycle')
  WHERE e.snapshot_id = '${testSnapshot}';
`);
assert.equal(visibility[0].results[0]?.visible, 1);

execute(`
  UPDATE settings SET value = '701', updated_at = '2026-11-11T00:03:00.000Z' WHERE key = 'publication_cycle';
  UPDATE settings SET value = '0', updated_at = '2026-11-11T00:03:00.000Z' WHERE key = 'custom_award_published';
`);
visibility = execute(`
  SELECT COUNT(*) AS visible FROM result_entries e JOIN result_publications p
    ON p.snapshot_id = e.snapshot_id AND p.nomination_id = e.nomination_id
    AND p.publication_cycle = (SELECT CAST(value AS INTEGER) FROM settings WHERE key = 'publication_cycle')
  WHERE e.snapshot_id = '${testSnapshot}';
  SELECT COUNT(*) AS historical FROM result_publications WHERE snapshot_id = '${testSnapshot}' AND publication_cycle = 700;
`);
assert.equal(visibility[0].results[0]?.visible, 0);
assert.equal(visibility[1].results[0]?.historical, 1);

execute(`
  INSERT INTO result_publications (snapshot_id, nomination_id, publication_cycle, published_at, published_by)
  VALUES ('${testSnapshot}', 'game', 701, '2026-11-11T00:04:00.000Z', 'integration-test');
`);
let customVisibility = execute(`
  SELECT value FROM settings WHERE key = 'custom_award_published';
  SELECT COUNT(*) AS customRows FROM result_publications
    WHERE snapshot_id = '${testSnapshot}' AND nomination_id = 'custom-award' AND publication_cycle = 701;
`);
assert.equal(customVisibility[0].results[0]?.value, '0');
assert.equal(customVisibility[1].results[0]?.customRows, 0);

execute(`
  UPDATE settings SET value = '1', updated_at = '2026-11-11T00:05:00.000Z' WHERE key = 'custom_award_published';
  INSERT INTO result_publications (snapshot_id, nomination_id, publication_cycle, published_at, published_by)
  VALUES ('${testSnapshot}', 'custom-award', 701, '2026-11-11T00:05:00.000Z', 'integration-test');
`);
customVisibility = execute(`
  SELECT value FROM settings WHERE key = 'custom_award_published';
  SELECT COUNT(*) AS customRows FROM result_publications
    WHERE snapshot_id = '${testSnapshot}' AND nomination_id = 'custom-award' AND publication_cycle = 701;
`);
assert.equal(customVisibility[0].results[0]?.value, '1');
assert.equal(customVisibility[1].results[0]?.customRows, 1);

execute(`
  DELETE FROM result_publications WHERE snapshot_id = '${testSnapshot}';
  DELETE FROM result_entries WHERE snapshot_id = '${testSnapshot}';
  DELETE FROM results_snapshots WHERE id = '${testSnapshot}';
  UPDATE settings SET value = '${originalPublicationCycle}' WHERE key = 'publication_cycle';
  UPDATE settings SET value = '${originalCustomPublished}' WHERE key = 'custom_award_published';
  DELETE FROM custom_award_selection WHERE twitch_user_id = '${testUser}';
  DELETE FROM custom_award_proposal_history WHERE twitch_user_id = '${testUser}';
  DELETE FROM custom_award_proposals WHERE twitch_user_id = '${testUser}';
  DELETE FROM votes WHERE twitch_user_id = '${testUser}';
  DELETE FROM users WHERE twitch_user_id = '${testUser}';
`);

console.log('D1 integration: schema, status transitions, vote preservation, publication cycles and independent custom award disclosure verified.');
