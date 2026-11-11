import { describe, expect, it } from 'vitest';
import { awards } from '../src/data/awards';
import { createScenes, getWinner, readReveals, validateConfig } from '../src/data/scenes';
describe('Сценарий и конфигурация', () => {
  it('содержит 21 сцену, девять категорий в порядке церемонии и все медиаматериалы', () => {
    expect(createScenes(awards).map(s => s.id)).toEqual(['cover', 'program', 'indie-game-0', 'indie-game-winner', 'game-0', 'game-winner', 'event-0', 'event-winner', 'dota-clip-0', 'dota-clip-winner', 'fail-0', 'fail-winner', 'community-drop-0', 'community-drop-winner', 'irl-0', 'irl-winner', 'chatter-0', 'chatter-winner', 'custom-award-0', 'custom-award-winner', 'final']);
    expect(awards.categories.map(c => c.id)).toEqual(['indie-game', 'game', 'event', 'dota-clip', 'fail', 'community-drop', 'irl', 'chatter', 'custom-award']);
    expect(awards.categories[7]).toMatchObject({ title: 'Чаттер года', kind: 'chatter', nominees: [], winner: null, winnerId: null });
    expect(awards.categories[8]).toMatchObject({ title: 'Ваша номинация', kind: 'custom', nominees: [], winner: null, winnerId: null });
    expect(validateConfig(awards)).toEqual([]);
    expect(awards.ceremonyPublished).toBe(false);
    expect(awards.categories.every(c => c.winnerId === null)).toBe(true);
    expect(awards.categories[0].nominees.map(n => n.name)).toEqual(['BOMBANANA!', 'Fears to Fathom: Scratch Creek', 'meccha', "No, I'm Not a Human", 'PEAK', 'The Operator', "Who's Lila?", 'R.E.P.O.']);
    expect(awards.categories[0].nominees.every(n => n.media?.src.startsWith('/assets/nominees/indie-game/'))).toBe(true);
    expect(awards.categories[1].nominees.map(n => n.name)).toEqual(['Heavy Rain', 'Resident Evil 2', 'Resident Evil 4', 'Red Dead Redemption 2', 'The Last of Us Part I', 'The Witcher 3: Wild Hunt', 'The Last of Us Part II', 'Black Myth: Wukong', 'Resident Evil 7: Biohazard', 'Clair Obscur: Expedition 33']);
    expect(awards.categories[1].nominees.every(n => n.media?.src.startsWith('/assets/nominees/game/'))).toBe(true);
    expect(awards.categories[2].nominees.map(n => n.name)).toContain('The International 141');
    expect(awards.categories[2].nominees.map(n => n.name)).toContain('Чудо-полес');
    expect(awards.categories[3]).toMatchObject({ title: 'DOTA 2 — Клип года', intro: 'Куда же без DOTA 2 - 70% стримов проводились в этой игре' });
    expect(awards.categories[3].nominees.map(n => n.name)).toEqual(['Вчера моя мне возразить решила...', 'Веселая ферма', 'Выбирай одну шмотку', 'Настучал', 'Бесконечная битва', 'Добрый стример', 'Записки психиатра']);
    expect(awards.categories[4].nominees.map(n => n.name)).toEqual(['Золотые купола', 'Победный вейв', 'В себя поверил?', 'АААААРБУУУУУУЗ', '1000 игр на лансере', 'Опа', 'Отвлекся', 'Прикинь я проиграл...']);
    expect(awards.categories[5].nominees).toHaveLength(7);
    expect(awards.categories[5].nominees.map(n => n.name)).toEqual(['Ангельский голос', 'Как я эту игру зае*алась играть', 'Интересный донат', 'Ему нравится', 'Найс тайминг', 'Самарские авиалинии', 'Без посадки авто нет']);
    expect(awards.categories[6]).toMatchObject({ title: 'IRL года', intro: 'Ваши любимые алкостримы и кукинги' });
    expect(awards.categories[6].nominees.map(n => n.name)).toEqual(['Монстры на каникулах в Москве', 'Монстры на каникулах — часть 2', 'Чат-рулетка', 'Говядина Веллингтон', 'Готовим пиццу', 'Московский алкокукинг']);
    expect(awards.categories.some(category => category.id === 'meme')).toBe(false);
    expect(awards.categories.flatMap(c => c.nominees.flatMap(n => n.videos ?? []))).toHaveLength(60);
    expect(awards.categories.flatMap(c => c.nominees.flatMap(n => n.media ? [n.media] : []))).toHaveLength(52);
    expect(new Set(awards.categories.flatMap(c => c.nominees.flatMap(n => n.videos?.map(item => item.src) ?? []))).size).toBe(60);
    expect(awards.categories.find(category => category.id === 'event')?.nominees.map(item => [item.id, item.name, item.videos?.length ?? 0])).toEqual([
      ['event-chgk', 'Что? Где? Когда? №1', 1],
      ['event-chgk-2', 'Что? Где? Когда? №2', 0],
      ['event-chudo', 'Чудо-полес', 0],
      ['event-logika', 'Где логика?', 2],
      ['event-turnir-1', 'Новогодний турнир', 2],
      ['event-turnir-2', 'The International 141', 3],
    ]);
    expect(JSON.stringify(awards)).not.toMatch(/sadpchelka|moderator|vip|Алкострим года/i);
  });
  it('отклоняет дубли, несуществующего и незаполненного победителя', () => {
    const config = structuredClone(awards);
    config.categories[0].nominees.push({ ...config.categories[0].nominees[0] });
    config.categories[0].winnerId = 'missing';
    config.categories[7].winner = { id: '', name: '' };
    config.categories.push(structuredClone(config.categories[0]));
    expect(validateConfig(config).length).toBeGreaterThanOrEqual(5);
  });
  it('раскрытия принадлежат текущему winnerId, повреждённое хранилище безопасно', () => {
    const config = structuredClone(awards);
    config.categories[7].winner = { id: 'chatter-winner', name: 'test_chatter' };
    expect(getWinner(config.categories[7])?.name).toBe('test_chatter');
    expect(readReveals('{bad', config)).toEqual({});
    expect(readReveals('null', config)).toEqual({});
    expect(readReveals('{"chatter":"someone-else"}', config)).toEqual({});
    expect(readReveals('{"chatter":"chatter-winner"}', config)).toEqual({ chatter: 'chatter-winner' });
  });
});
