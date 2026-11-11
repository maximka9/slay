import { describe, expect, it } from 'vitest';
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
