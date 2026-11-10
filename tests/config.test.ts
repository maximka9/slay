import { describe, expect, it } from 'vitest';
import { awards } from '../src/data/awards';
import { createScenes, getWinner, readReveals, validateConfig } from '../src/data/scenes';
describe('Сценарий и конфигурация', () => {
  it('содержит 19 сцен, восемь категорий и актуальные игры', () => {
    expect(createScenes(awards).map(s => s.id)).toEqual(['cover', 'program', 'chatter-0', 'chatter-winner', 'indie-game-0', 'indie-game-winner', 'game-0', 'game-winner', 'event-0', 'event-winner', 'alkostream-0', 'alkostream-winner', 'cooking-0', 'cooking-winner', 'clip-0', 'clip-winner', 'meme-0', 'meme-winner', 'final']);
    expect(awards.categories.map(c => c.id)).toEqual(['chatter', 'indie-game', 'game', 'event', 'alkostream', 'cooking', 'clip', 'meme']);
    expect(awards.categories[0]).toMatchObject({ title: 'Чаттер года', kind: 'chatter', nominees: [], winner: null, winnerId: null });
    expect(validateConfig(awards)).toEqual([]);
    expect(awards.ceremonyPublished).toBe(false);
    expect(awards.categories.every(c => c.winnerId === null)).toBe(true);
    expect(awards.categories[1].nominees.map(n => n.name)).toEqual(['BOMBANANA!', 'Fears to Fathom - Scratch Creek', 'Meccha Chameleon', "No, I'm not a Human", 'PEAK', 'The Operator', "Who's Lila?", 'R.E.P.O.']);
    expect(awards.categories[1].nominees.every(n => n.media?.src.startsWith('/assets/nominees/indie-game/'))).toBe(true);
    expect(awards.categories[2].nominees.map(n => n.name)).toEqual(['Heavy Rain', 'Resident Evil 2', 'Resident Evil 4', 'Red Dead Redemption 2', 'The Last of Us Part I', 'The Witcher 3: Wild Hunt', 'The Last of Us Part II', 'Black Myth: Wukong', 'Resident Evil 7: Biohazard', 'Clair Obscur: Expedition 33']);
    expect(awards.categories[2].nominees.every(n => n.media?.src.startsWith('/assets/nominees/game/'))).toBe(true);
    expect(awards.categories.slice(3).every(c => c.nominees.length === 4 && c.nominees.every(n => n.name === ''))).toBe(true);
    expect(JSON.stringify(awards)).not.toMatch(/sadpchelka|moderator|vip/i);
  });
  it('отклоняет дубли, несуществующего и незаполненного победителя', () => {
    const config = structuredClone(awards);
    config.categories[1].nominees.push({ ...config.categories[1].nominees[0] });
    config.categories[1].winnerId = 'missing';
    config.categories[0].winner = { id: '', name: '' };
    config.categories.push(structuredClone(config.categories[1]));
    expect(validateConfig(config).length).toBeGreaterThanOrEqual(5);
  });
  it('раскрытия принадлежат текущему winnerId, повреждённое хранилище безопасно', () => {
    const config = structuredClone(awards);
    config.categories[0].winner = { id: 'chatter-winner', name: 'test_chatter' };
    expect(getWinner(config.categories[0])?.name).toBe('test_chatter');
    expect(readReveals('{bad', config)).toEqual({});
    expect(readReveals('null', config)).toEqual({});
    expect(readReveals('{"chatter":"someone-else"}', config)).toEqual({});
    expect(readReveals('{"chatter":"chatter-winner"}', config)).toEqual({ chatter: 'chatter-winner' });
  });
});
