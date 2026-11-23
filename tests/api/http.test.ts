import { describe, expect, it } from 'vitest';
import { parseCookieHeader, safeDecode, safeReturnTo } from '../../functions/_lib/url';

describe('safeReturnTo', () => {
  it.each([
    ['/vote', '/vote'],
    ['/', '/'],
    ['/admin', '/admin'],
    ['/present?rehearsal=1', '/present?rehearsal=1'],
    ['/vote#vote-chatter', '/vote#vote-chatter'],
    [null, '/vote'],
    ['', '/vote'],
    ['https://evil.com', '/vote'],
    ['//evil.com', '/vote'],
    ['/\\evil.com', '/vote'],
    ['/%5Cevil.com', '/vote'],
    ['/\tevil', '/vote'],
    ['/\n/evil.com', '/vote'],
    ['/unknown-page', '/vote'],
    ['javascript:alert(1)', '/vote'],
  ])('%s → %s', (input, expected) => {
    expect(safeReturnTo(input as string | null)).toBe(expected);
  });
});

describe('parseCookieHeader', () => {
  it('пропускает битую cookie без исключения', () => {
    expect(parseCookieHeader('a=%E0; b=ok')).toEqual({ b: 'ok' });
  });
  it('декодирует обычные значения', () => {
    expect(parseCookieHeader('camca63_session=abc%2Fdef; flag')).toEqual({ camca63_session: 'abc/def', flag: '' });
  });
});

describe('safeDecode', () => {
  it('возвращает null для битого процента', () => {
    expect(safeDecode('%E0')).toBeNull();
    expect(safeDecode('game%2D1')).toBe('game-1');
  });
});
