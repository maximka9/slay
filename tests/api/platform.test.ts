import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { awards } from '../../src/data/awards';

const root = resolve(import.meta.dirname, '../..');
const migration = readFileSync(resolve(root, 'migrations/0001_voting_platform.sql'), 'utf8');
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
});
