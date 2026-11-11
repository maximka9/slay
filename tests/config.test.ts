import { describe, expect, it } from 'vitest';
import { awards } from '../src/data/awards';
import { createScenes, getWinner, readReveals, validateConfig } from '../src/data/scenes';
describe('Сценарий и конфигурация', () => {
  it('содержит 21 сцену, девять категорий в порядке церемонии и все медиаматериалы', () => {
    expect(createScenes(awards).map(s => s.id)).toEqual(['cover', 'program', 'indie-game-0', 'indie-game-winner', 'game-0', 'game-winner', 'event-0', 'event-winner', 'irl-0', 'irl-winner', 'dota-clip-0', 'dota-clip-winner', 'community-drop-0', 'community-drop-winner', 'fail-0', 'fail-winner', 'meme-0', 'meme-winner', 'chatter-0', 'chatter-winner', 'final']);
    expect(awards.categories.map(c => c.id)).toEqual(['indie-game', 'game', 'event', 'irl', 'dota-clip', 'community-drop', 'fail', 'meme', 'chatter']);
    expect(awards.categories[8]).toMatchObject({ title: 'Чаттер года', kind: 'chatter', nominees: [], winner: null, winnerId: null });
    expect(validateConfig(awards)).toEqual([]);
    expect(awards.ceremonyPublished).toBe(false);
    expect(awards.categories.every(c => c.winnerId === null)).toBe(true);
    expect(awards.categories[0].nominees.map(n => n.name)).toEqual(['BOMBANANA!', 'Fears to Fathom: Scratch Creek', 'meccha', "No, I'm Not a Human", 'PEAK', 'The Operator', "Who's Lila?", 'R.E.P.O.']);
    expect(awards.categories[0].nominees.every(n => n.media?.src.startsWith('/assets/nominees/indie-game/'))).toBe(true);
    expect(awards.categories[1].nominees.map(n => n.name)).toEqual(['Heavy Rain', 'Resident Evil 2', 'Resident Evil 4', 'Red Dead Redemption 2', 'The Last of Us Part I', 'The Witcher 3: Wild Hunt', 'The Last of Us Part II', 'Black Myth: Wukong', 'Resident Evil 7: Biohazard', 'Clair Obscur: Expedition 33']);
    expect(awards.categories[1].nominees.every(n => n.media?.src.startsWith('/assets/nominees/game/'))).toBe(true);
    expect(awards.categories[2].nominees.map(n => n.name)).toContain('The International 141');
    expect(awards.categories[2].nominees.map(n => n.name)).toContain('Чудо-полес');
    expect(awards.categories[3]).toMatchObject({ title: 'Лучший ИРЛ с друзьями' });
    expect(awards.categories[3].nominees.map(n => n.name)).toEqual(['Монстры на каникулах в Москве', 'Монстры на каникулах — часть 2', 'Чат-рулетка', 'Говядина Веллингтон', 'Готовим пиццу', 'Московский алкокукинг']);
    expect(awards.categories[4]).toMatchObject({ title: 'DOTA 2 — Клип года' });
    expect(awards.categories[4].nominees).toHaveLength(7);
    expect(awards.categories[5].nominees).toHaveLength(7);
    expect(awards.categories[6]).toMatchObject({ title: 'Фейл года' });
    expect(awards.categories[6].nominees).toHaveLength(8);
    expect(awards.categories[7].title).toBe('Мем года');
    expect(awards.categories.flatMap(c => c.nominees.flatMap(n => n.videos ?? []))).toHaveLength(60);
    expect(awards.categories.flatMap(c => c.nominees.flatMap(n => n.media ? [n.media] : []))).toHaveLength(51);
    expect(new Set(awards.categories.flatMap(c => c.nominees.flatMap(n => n.videos?.map(item => item.src) ?? []))).size).toBe(60);
    expect(JSON.stringify(awards)).not.toMatch(/sadpchelka|moderator|vip|Алкострим года/i);
  });
  it('отклоняет дубли, несуществующего и незаполненного победителя', () => {
    const config = structuredClone(awards);
    config.categories[0].nominees.push({ ...config.categories[0].nominees[0] });
    config.categories[0].winnerId = 'missing';
    config.categories[8].winner = { id: '', name: '' };
    config.categories.push(structuredClone(config.categories[0]));
    expect(validateConfig(config).length).toBeGreaterThanOrEqual(5);
  });
  it('раскрытия принадлежат текущему winnerId, повреждённое хранилище безопасно', () => {
    const config = structuredClone(awards);
    config.categories[8].winner = { id: 'chatter-winner', name: 'test_chatter' };
    expect(getWinner(config.categories[8])?.name).toBe('test_chatter');
    expect(readReveals('{bad', config)).toEqual({});
    expect(readReveals('null', config)).toEqual({});
    expect(readReveals('{"chatter":"someone-else"}', config)).toEqual({});
    expect(readReveals('{"chatter":"chatter-winner"}', config)).toEqual({ chatter: 'chatter-winner' });
  });
});
