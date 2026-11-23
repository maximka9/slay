import { describe, expect, it } from 'vitest';
import { votesLabel } from '../src/lib/plural';

describe('votesLabel', () => {
  it.each([
    [0, '0 голосов'], [1, '1 голос'], [2, '2 голоса'], [5, '5 голосов'], [11, '11 голосов'],
    [12, '12 голосов'], [21, '21 голос'], [22, '22 голоса'], [25, '25 голосов'], [111, '111 голосов'],
  ])('%i → %s', (count, expected) => {
    expect(votesLabel(count)).toBe(expected);
  });
});
