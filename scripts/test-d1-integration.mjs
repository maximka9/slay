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
`);

assert.deepEqual(schema[0].results.map(row => row.id), [
  'indie-game', 'game', 'event', 'irl', 'dota-clip', 'community-drop', 'fail', 'chatter', 'custom-award',
]);
assert.deepEqual(schema[0].results.map(row => row.sort_order), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
assert.equal(schema[1].results[0]?.enabled, 0);
assert.deepEqual(schema[2].results.map(row => row.name).sort(), [
  'custom_award_proposal_history', 'custom_award_proposals', 'custom_award_selection',
]);

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

execute(`
  DELETE FROM custom_award_selection WHERE twitch_user_id = '${testUser}';
  DELETE FROM custom_award_proposal_history WHERE twitch_user_id = '${testUser}';
  DELETE FROM custom_award_proposals WHERE twitch_user_id = '${testUser}';
  DELETE FROM votes WHERE twitch_user_id = '${testUser}';
  DELETE FROM users WHERE twitch_user_id = '${testUser}';
`);

console.log('D1 integration: schema, category order, meme archive, proposal lifecycle, status transitions and vote preservation verified.');
