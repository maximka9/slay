import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { awards } from '../../src/data/awards';
import { votingAvailability } from '../../functions/_lib/availability';

const root = resolve(import.meta.dirname, '../..');
const migration = readFileSync(resolve(root, 'migrations/0001_voting_platform.sql'), 'utf8');
const updateMigration = readFileSync(resolve(root, 'migrations/0002_update_dota_clips_and_fails.sql'), 'utf8');
const simplifyMigration = readFileSync(resolve(root, 'migrations/0003_simplify_voting_and_custom_award.sql'), 'utf8');
const publicationMigration = readFileSync(resolve(root, 'migrations/0004_result_publication_cycles.sql'), 'utf8');
const secondChgkMigration = readFileSync(resolve(root, 'migrations/0005_add_second_chgk.sql'), 'utf8');
const contentRefreshMigration = readFileSync(resolve(root, 'migrations/0006_reorder_and_rename_awards.sql'), 'utf8');
const failDescriptionMigration = readFileSync(resolve(root, 'migrations/0007_fix_fail_description.sql'), 'utf8');
const apiSource = readFileSync(resolve(root, 'functions/api/[[path]].ts'), 'utf8');

describe('voting platform invariants', () => {
  it('keeps one vote per Twitch user and nomination at the database boundary', () => {
    expect(migration).toContain('UNIQUE (nomination_id, twitch_user_id)');
    expect(migration).toContain("CHECK (status IN ('valid', 'excluded'))");
  });

  it('creates every required persistence area', () => {
    for (const table of ['users', 'nominations', 'candidates', 'votes', 'vote_history', 'moderation_actions', 'sessions', 'oauth_states', 'results_snapshots', 'result_entries', 'settings']) {
      expect(migration).toContain(`CREATE TABLE ${table}`);
    }
    for (const table of ['custom_award_proposals', 'custom_award_proposal_history', 'custom_award_selection']) {
      expect(simplifyMigration).toContain(`CREATE TABLE ${table}`);
    }
  });

  it('contains exactly nine active ceremony categories in the requested order', () => {
    expect(awards.categories.map(category => category.id)).toEqual([
      'indie-game', 'game', 'event', 'dota-clip', 'fail', 'community-drop', 'irl', 'chatter', 'custom-award',
    ]);
    expect(awards.categories.every(category => category.winnerId === null && (!('winner' in category) || category.winner === null))).toBe(true);
  });

  it('serves public results only from the current publication cycle', () => {
    expect(publicationMigration).toContain('CREATE TABLE result_publications');
    expect(publicationMigration).toContain("('custom_award_published', '0'");
    expect(apiSource).toContain('result_publications');
    expect(apiSource).toContain("setting(env, 'publication_cycle')");
    expect(apiSource).toContain("setting(env, 'custom_award_published')");
  });

  it('archives prior clip, rage, and meme rows without reinterpreting their votes', () => {
    expect(updateMigration).toContain('CREATE TABLE migration_reports');
    expect(updateMigration).toContain("WHERE id = 'clip'");
    expect(updateMigration).toContain("WHERE id = 'rage'");
    expect(updateMigration).not.toMatch(/UPDATE\s+votes/i);
    expect(simplifyMigration).toContain("WHERE id = 'meme'");
    expect(simplifyMigration).not.toMatch(/UPDATE\s+votes/i);
    expect(simplifyMigration).not.toMatch(/DELETE\s+FROM\s+votes/i);
  });

  it('adds exactly seven Dota clips and eight fails as new candidates', () => {
    expect((updateMigration.match(/\('dota-clip-\d'/g) ?? [])).toHaveLength(7);
    expect((updateMigration.match(/\('fail-\d'/g) ?? [])).toHaveLength(8);
    expect(updateMigration).toContain('CREATE TABLE ceremony_exceptions');
  });

  it('adds the second CHGK without changing the first candidate ID or its votes', () => {
    expect(secondChgkMigration).toContain("WHERE id = 'event-chgk'");
    expect(secondChgkMigration).toContain("'event-chgk-2'");
    expect(secondChgkMigration).not.toMatch(/UPDATE\s+votes/i);
    expect(secondChgkMigration).not.toMatch(/DELETE\s+FROM\s+votes/i);
    expect(secondChgkMigration).toContain("('results_dirty', '1'");
  });

  it('reorders and renames content in place without touching votes or snapshots', () => {
    expect(contentRefreshMigration).toContain("WHEN 'dota-clip' THEN 4");
    expect(contentRefreshMigration).toContain("WHEN 'irl' THEN 'IRL года'");
    expect(contentRefreshMigration).toContain("WHEN 'community-drop-7' THEN 'Без посадки авто нет'");
    expect(contentRefreshMigration).not.toMatch(/(?:UPDATE|DELETE\s+FROM)\s+votes/i);
    expect(contentRefreshMigration).not.toMatch(/(?:UPDATE|DELETE\s+FROM)\s+(?:results_snapshots|result_entries)/i);
    expect(contentRefreshMigration).toContain("('content_schema_version', '6'");
  });

  it('fixes only the fail description without invalidating results', () => {
    expect(failDescriptionMigration).toContain("WHERE id = 'fail'");
    expect(failDescriptionMigration).toContain('носки не так надел.');
    expect(failDescriptionMigration).not.toContain('results_dirty');
    expect(failDescriptionMigration).not.toMatch(/(?:UPDATE|DELETE\s+FROM)\s+(?:votes|results_snapshots|result_entries)/i);
  });

  it('uses only global status, enabled state, and readiness for availability', () => {
    const base = { globalStatus: 'open', enabled: true, ready: true };
    expect(votingAvailability(base)).toEqual({ canVote: true, unavailableReason: null });
    expect(votingAvailability({ ...base, globalStatus: 'closed' }).canVote).toBe(false);
    expect(votingAvailability({ ...base, enabled: false }).canVote).toBe(false);
    expect(votingAvailability({ ...base, ready: false }).canVote).toBe(false);
  });

  it('exposes one global status action and custom award moderation routes', () => {
    expect(apiSource).toContain("setSetting(env, 'voting_status'");
    expect(apiSource).not.toContain('payload.categoryAction');
    expect(apiSource).not.toContain("setting(env, 'voting_starts_at')");
    expect(apiSource).toContain("path === '/api/custom-award'");
    expect(apiSource).toContain("path === '/api/admin/custom-awards/select'");
    expect(apiSource).toContain('async function ceremonyReadiness');
    expect(apiSource).toContain("COUNT(*) AS count FROM moderation_actions");
    expect(apiSource).toContain("LIMIT ? OFFSET ?");
  });

  it('«Чаттер года»: только ввод ника и запрет голоса за себя на любом пути', () => {
    const dataSource = readFileSync(resolve(root, 'functions/_lib/data.ts'), 'utf8');
    const chatterMigration = readFileSync(resolve(root, 'migrations/0011_chatter_free_input_only.sql'), 'utf8');
    expect(apiSource).toContain("const chatterFreeInput = nominationId === 'chatter';");
    expect(apiSource).toContain("'twitch_login_required'");
    expect(apiSource).toContain("candidate.twitch_user_id === user.twitchUserId");
    expect(dataSource).toContain("nomination.id === 'chatter' ? []");
    expect(chatterMigration).toContain("exclusion_reason = 'Голос за себя'");
  });

  it('«Чаттер года»: не больше 2 вводов ника, лимит до запроса к Twitch, итоги без ников с 0 голосов', () => {
    const castVote = apiSource.slice(apiSource.indexOf('async function castVote('), apiSource.indexOf('async function chatterEntriesLeft('));
    expect(apiSource).toContain('const CHATTER_MAX_ENTRIES = 2;');
    expect(castVote).toContain("'chatter_entries_exhausted'");
    expect(castVote).toContain("'chatter_lookup'");
    expect(castVote.indexOf("'chatter_entries_exhausted'")).toBeLessThan(castVote.indexOf('resolveTwitchLogin('));
    expect(castVote.indexOf("'chatter_entries_exhausted'")).toBeLessThan(castVote.indexOf('ensureChatterCandidate('));
    expect(castVote).toContain('existing.candidateEnabled === 1');
    expect(apiSource).toContain("HAVING c.nomination_id <> 'chatter' OR COUNT(v.id) > 0");
    expect(apiSource).toContain("HAVING n.id <> 'chatter' OR COUNT(v.id) > 0");
    expect(apiSource).not.toContain('updateChatterFreeInput');
  });

  it('скрипты сброса и обезличивания учитывают внешние ключи', () => {
    const reset = readFileSync(resolve(root, 'scripts/reset-test-data.sql'), 'utf8');
    const anonymize = readFileSync(resolve(root, 'scripts/anonymize-after-awards.sql'), 'utf8');
    const activeReset = reset.split('\n').filter(line => !line.trim().startsWith('--')).join('\n');
    expect(activeReset).toContain("DELETE FROM candidates WHERE nomination_id = 'chatter';");
    expect(activeReset.indexOf("DELETE FROM candidates")).toBeGreaterThan(activeReset.indexOf('DELETE FROM result_entries;'));
    expect(anonymize.indexOf('DELETE FROM custom_award_proposals')).toBeLessThan(anonymize.indexOf('DELETE FROM users'));
    expect(anonymize).toContain('NOT IN (SELECT twitch_user_id FROM custom_award_selection)');
  });

  it('CSV экранирует формулы, вход ограничен 60 запросами в минуту', () => {
    expect(apiSource).toContain("text = `'${text}`");
    expect(apiSource).toContain("'oauth_login', 60");
    expect(apiSource).toContain("'oauth_callback', 60");
    expect(apiSource).toContain('safeReturnTo(url.searchParams.get(');
    expect(apiSource).toContain('safeReturnTo(stateRow.return_to)');
  });
});
