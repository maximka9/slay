import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { awards } from '../../src/data/awards';
import { votingAvailability } from '../../functions/_lib/availability';
import { utcToZonedInput, zonedInputToUtc } from '../../src/lib/timezone';

const root = resolve(import.meta.dirname, '../..');
const migration = readFileSync(resolve(root, 'migrations/0001_voting_platform.sql'), 'utf8');
const updateMigration = readFileSync(resolve(root, 'migrations/0002_update_dota_clips_and_fails.sql'), 'utf8');
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
  });

  it('contains no winner in the public ceremony configuration', () => {
    expect(awards.categories).toHaveLength(9);
    expect(awards.categories.every(category => category.winnerId === null && (!('winner' in category) || category.winner === null))).toBe(true);
  });

  it('serves public results only from rows marked as published', () => {
    expect(apiSource).toContain('e.published = 1');
    expect(apiSource).toContain("await requireAdmin(request, env)");
  });

  it('archives prior clip and rage rows without moving or reinterpreting their votes', () => {
    expect(updateMigration).toContain('CREATE TABLE migration_reports');
    expect(updateMigration).toContain('old_clip_votes');
    expect(updateMigration).toContain('old_rage_votes');
    expect(updateMigration).toContain("WHERE id = 'clip'");
    expect(updateMigration).toContain("WHERE id = 'rage'");
    expect(updateMigration).not.toMatch(/UPDATE\s+votes/i);
    expect(updateMigration).not.toMatch(/DELETE\s+FROM\s+votes/i);
  });

  it('adds exactly seven Dota clips and eight fails as new candidates', () => {
    expect((updateMigration.match(/\('dota-clip-\d'/g) ?? [])).toHaveLength(7);
    expect((updateMigration.match(/\('fail-\d'/g) ?? [])).toHaveLength(8);
    expect(updateMigration).toContain('CREATE TABLE ceremony_exceptions');
  });

  it('uses one server-side availability rule for global and category schedules', () => {
    const base = {
      now: '2026-11-11T12:00:00.000Z', globalStatus: 'open', globalStartsAt: null, globalEndsAt: null,
      nominationStatus: 'open', nominationStartsAt: null, nominationEndsAt: null, enabled: true,
    };
    expect(votingAvailability(base)).toEqual({ canVote: true, unavailableReason: null });
    expect(votingAvailability({ ...base, globalStatus: 'closed' }).canVote).toBe(false);
    expect(votingAvailability({ ...base, nominationStatus: 'closed' }).unavailableReason).toBe('Категория закрыта.');
    expect(votingAvailability({ ...base, globalStartsAt: '2026-11-11T12:00:01.000Z' }).canVote).toBe(false);
    expect(votingAvailability({ ...base, nominationEndsAt: base.now }).canVote).toBe(false);
  });

  it('keeps global reopening separate from category state and gates the ceremony', () => {
    expect(apiSource).toContain("payload.categoryAction === 'open_all'");
    expect(apiSource).toContain("payload.categoryAction === 'close_all'");
    expect(apiSource).toContain('async function ceremonyReadiness');
    expect(apiSource).toContain("path === '/api/admin/results/no-winner'");
  });

  it('converts the admin schedule through the selected IANA timezone', () => {
    expect(utcToZonedInput('2026-11-11T12:30:00.000Z', 'Europe/Samara')).toBe('2026-11-11T16:30');
    expect(zonedInputToUtc('2026-11-11T16:30', 'Europe/Samara')).toBe('2026-11-11T12:30:00.000Z');
  });
});
