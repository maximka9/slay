import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { canExposePublicResults, publicationPlan } from '../../functions/_lib/publication';

describe('result publication secrecy', () => {
  it('hides previously published results when voting is reopened or returned to preparation', () => {
    expect(canExposePublicResults('closed', false)).toBe(true);
    expect(canExposePublicResults('open', false)).toBe(false);
    expect(canExposePublicResults('preparation', false)).toBe(false);
    expect(canExposePublicResults('closed', true)).toBe(false);
  });

  it('publishes the custom award only when the administrator names it explicitly', () => {
    const standardIds = ['game', 'event'];
    expect(publicationPlan(undefined, standardIds)).toEqual({
      standardNominationIds: standardIds,
      publishCustomAward: false,
      explicitSelection: false,
    });
    expect(publicationPlan(['game'], standardIds)).toMatchObject({
      standardNominationIds: ['game'], publishCustomAward: false,
    });
    expect(publicationPlan(['custom-award'], standardIds)).toMatchObject({
      standardNominationIds: [], publishCustomAward: true, explicitSelection: true,
    });
  });
});

describe('publication cycle across reopening (ТЗ 4.1, 4.2)', () => {
  const apiSource = readFileSync(resolve(import.meta.dirname, '../../functions/api/[[path]].ts'), 'utf8');
  const section = (name: string) => {
    const start = apiSource.indexOf(`async function ${name}(`);
    const next = apiSource.indexOf('\nasync function ', start + 10);
    return apiSource.slice(start, next === -1 ? undefined : next);
  };

  it('keeps results hidden through the whole close → publish → reopen → close sequence', () => {
    // закрыто и зафиксировано → можно показывать
    expect(canExposePublicResults('closed', false)).toBe(true);
    // открыли снова → скрыто
    expect(canExposePublicResults('open', false)).toBe(false);
    // закрыли, но после новых голосов снимок устарел → скрыто до новой фиксации
    expect(canExposePublicResults('closed', true)).toBe(false);
  });

  it('starts a new private publication cycle when voting is reopened', () => {
    const update = section('updateVotingStatus');
    expect(update).toContain("payload.status === 'open' || payload.status === 'preparation'");
    expect(update).toContain("setSetting(env, 'publication_cycle'");
    expect(update).toContain("setSetting(env, 'custom_award_published', '0'");
  });

  it('serves public results only from publications of the current cycle', () => {
    const publicResults = section('publicResults');
    expect(publicResults).toContain('p.publication_cycle = ?');
    expect(publicResults).toContain('AND nomination_id = ? AND publication_cycle = ?');
  });

  it('unpublishes the custom award when a new selection or snapshot is made', () => {
    expect(section('selectCustomAward')).toContain("setSetting(env, 'custom_award_published', '0'");
    expect(section('finalizeResults')).toContain("setSetting(env, 'custom_award_published', '0'");
  });

  it('never publishes the custom award implicitly and ignores duplicates', () => {
    expect(publicationPlan(['game', 'game', ''], ['game', 'event'])).toEqual({
      standardNominationIds: ['game'], publishCustomAward: false, explicitSelection: true,
    });
    expect(publicationPlan(['custom-award', 'game'], ['game'])).toMatchObject({
      standardNominationIds: ['game'], publishCustomAward: true,
    });
    expect(publicationPlan([], ['game']).publishCustomAward).toBe(false);
  });
});
