export type Media = { src: string; alt?: string; type?: 'image' | 'video'; poster?: string };
export type VideoAsset = { src: string; label: string };
export type Nominee = {
  id: string;
  name: string;
  media?: Media;
  videos?: VideoAsset[];
  description?: string;
  clipUrl?: string;
  awardTitle?: string;
  authorLogin?: string;
};
export type Category = {
  id: string; title: string; intro: string;
  kind: 'chatter' | 'custom' | 'poster' | 'frame' | 'clip';
  icon: 'message' | 'sparkles' | 'gamepad' | 'zap' | 'glass' | 'chef' | 'play' | 'smile' | 'package' | 'flame';
  nominees: Nominee[];
  winnerId: string | null;
  /** Для категорий без списка кандидатов, например «Чаттер года». */
  winner?: Nominee | null;
  votes?: Record<string, number>;
};
export type AwardsConfig = {
  year: number; channel: string; ceremonyPublished: boolean;
  categories: Category[];
};

const mediaBase = (import.meta.env?.VITE_MEDIA_BASE_URL ?? '').replace(/\/$/, '');
const video = (src: string, label: string): VideoAsset => ({ src: mediaBase ? `${mediaBase}${src}` : src, label });

// Единственный источник контента. Все победители намеренно не заданы.
export const awards: AwardsConfig = {
  year: 2026,
  channel: 'camca63',
  ceremonyPublished: false,
  categories: [
    {
      id: 'indie-game', title: 'Инди-игра года', icon: 'sparkles', kind: 'poster',
      intro: 'Небольшие студии. Большие впечатления',
      nominees: [
        { id: 'indie-1', name: 'BOMBANANA!', media: { src: '/assets/nominees/indie-game/BOMBANANA!.jpeg', alt: 'Обложка BOMBANANA!' } },
        { id: 'indie-2', name: 'Fears to Fathom: Scratch Creek', media: { src: '/assets/nominees/indie-game/Fears to Fathom - Scratch Creek.jpg', alt: 'Обложка Fears to Fathom: Scratch Creek' } },
        { id: 'indie-3', name: 'meccha', media: { src: '/assets/nominees/indie-game/meccha.jpeg', alt: 'Обложка meccha' } },
        {
          id: 'indie-4', name: "No, I'm Not a Human", media: { src: '/assets/nominees/indie-game/no im no human.jpeg', alt: "Обложка No, I'm Not a Human" },
          videos: [video('/assets/nominees/indie-game/videos/no-human-1.mp4', 'No, I’m Not a Human — видео 1'), video('/assets/nominees/indie-game/videos/no-human-2.mp4', 'No, I’m Not a Human — видео 2'), video('/assets/nominees/indie-game/videos/no-human-3.mp4', 'No, I’m Not a Human — видео 3')],
        },
        { id: 'indie-5', name: 'PEAK', media: { src: '/assets/nominees/indie-game/peak.jpeg', alt: 'Обложка PEAK' } },
        { id: 'indie-6', name: 'The Operator', media: { src: '/assets/nominees/indie-game/the-operator.png', alt: 'Обложка The Operator' } },
        {
          id: 'indie-7', name: "Who's Lila?", media: { src: '/assets/nominees/indie-game/whos lila.jpeg', alt: "Обложка Who's Lila?" },
          videos: [video('/assets/nominees/indie-game/videos/whos-lila-1.mp4', 'Who’s Lila?')],
        },
        { id: 'indie-8', name: 'R.E.P.O.', media: { src: '/assets/nominees/indie-game/repo.jpeg', alt: 'Обложка R.E.P.O.' } },
      ],
      winnerId: null,
    },
    {
      id: 'game', title: 'Игра года', icon: 'gamepad', kind: 'poster',
      intro: 'Главное игровое впечатление 2026 года',
      nominees: [
        { id: 'game-1', name: 'Heavy Rain', media: { src: '/assets/nominees/game/heavyrain.webp', alt: 'Обложка Heavy Rain' } },
        {
          id: 'game-2', name: 'Resident Evil 2', media: { src: '/assets/nominees/game/re 2.jpg', alt: 'Обложка Resident Evil 2' },
          videos: [video('/assets/nominees/game/videos/re2-1.mp4', 'Resident Evil 2 — видео 1'), video('/assets/nominees/game/videos/re2-2.mp4', 'Resident Evil 2 — видео 2'), video('/assets/nominees/game/videos/re2-3.mp4', 'Resident Evil 2 — видео 3')],
        },
        {
          id: 'game-3', name: 'Resident Evil 4', media: { src: '/assets/nominees/game/re 4.jpg', alt: 'Обложка Resident Evil 4' },
          videos: [video('/assets/nominees/game/videos/re4-1.mp4', 'Resident Evil 4 — видео 1'), video('/assets/nominees/game/videos/re4-2.mp4', 'Resident Evil 4 — видео 2')],
        },
        {
          id: 'game-4', name: 'Red Dead Redemption 2', media: { src: '/assets/nominees/game/Red Dead Redemption 2.jpg', alt: 'Обложка Red Dead Redemption 2' },
          videos: [1, 2, 3, 4].map(i => video(`/assets/nominees/game/videos/rdr-${i}.mp4`, `Red Dead Redemption 2 — видео ${i}`)),
        },
        {
          id: 'game-5', name: 'The Last of Us Part I', media: { src: '/assets/nominees/game/The Last of Us Part I.jpg', alt: 'Обложка The Last of Us Part I' },
          videos: [video('/assets/nominees/game/videos/tlou1-1.mp4', 'The Last of Us Part I — видео 1'), video('/assets/nominees/game/videos/tlou1-2.mp4', 'The Last of Us Part I — видео 2')],
        },
        {
          id: 'game-6', name: 'The Witcher 3: Wild Hunt', media: { src: '/assets/nominees/game/The Witcher 3 Wild Hunt Remastered.jpeg', alt: 'Обложка The Witcher 3: Wild Hunt' },
          videos: [video('/assets/nominees/game/videos/witcher3-1.mp4', 'The Witcher 3: Wild Hunt')],
        },
        { id: 'game-7', name: 'The Last of Us Part II', media: { src: '/assets/nominees/game/The_last_of_us_2_cover.png', alt: 'Обложка The Last of Us Part II' } },
        { id: 'game-8', name: 'Black Myth: Wukong', media: { src: '/assets/nominees/game/wukong.jpg', alt: 'Обложка Black Myth: Wukong' } },
        { id: 'game-9', name: 'Resident Evil 7: Biohazard', media: { src: '/assets/nominees/game/Арт_Resident_Evil_7_biohazard.jpg', alt: 'Обложка Resident Evil 7: Biohazard' } },
        {
          id: 'game-10', name: 'Clair Obscur: Expedition 33', media: { src: '/assets/nominees/game/Clair Obscur Expedition 33.jpeg', alt: 'Обложка Clair Obscur: Expedition 33' },
          videos: [video('/assets/nominees/game/videos/clair-obscur-1.mp4', 'Clair Obscur: Expedition 33')],
        },
      ],
      winnerId: null,
    },
    {
      id: 'event', title: 'Ивент года', icon: 'zap', kind: 'frame', intro: 'Событие, которое объединило зрителей',
      nominees: [
        { id: 'event-chgk', name: 'Что? Где? Когда? №1', media: { src: '/assets/nominees/event/chgk.png', alt: 'Превью ивента Что? Где? Когда? №1' }, videos: [video('/assets/nominees/event/videos/chgk-1.mp4', 'Что? Где? Когда? №1')] },
        { id: 'event-chgk-2', name: 'Что? Где? Когда? №2', media: { src: '/assets/nominees/event/chgk-2.png', alt: 'Превью ивента Что? Где? Когда? №2' } },
        { id: 'event-chudo', name: 'Чудо-полес', media: { src: '/assets/nominees/event/chudo.jpg', alt: 'Превью ивента Чудо-полес' } },
        { id: 'event-logika', name: 'Где логика?', media: { src: '/assets/nominees/event/logika.png', alt: 'Превью ивента Где логика?' }, videos: [video('/assets/nominees/event/videos/logika-1.mp4', 'Где логика? — видео 1'), video('/assets/nominees/event/videos/logika-2.mp4', 'Где логика? — видео 2')] },
        { id: 'event-turnir-1', name: 'Новогодний турнир', media: { src: '/assets/nominees/event/turnir1.png', alt: 'Превью Новогоднего турнира' }, videos: [video('/assets/nominees/event/videos/turnir1-1.mp4', 'Новогодний турнир — видео 1'), video('/assets/nominees/event/videos/turnir1-2.mp4', 'Новогодний турнир — видео 2')] },
        { id: 'event-turnir-2', name: 'The International 141', media: { src: '/assets/nominees/event/turnir2.png', alt: 'Превью The International 141' }, videos: [1, 2, 3].map(i => video(`/assets/nominees/event/videos/turnir2-${i}.mp4`, `The International 141 — видео ${i}`)) },
      ],
      winnerId: null,
    },
    {
      id: 'irl', title: 'Лучший ИРЛ с друзьями', icon: 'glass', kind: 'frame',
      intro: 'Встречи, поездки, готовка и самые непредсказуемые моменты за пределами игр. Всё, что происходило, когда друзья собирались вместе',
      nominees: [
        { id: 'irl-moscow', name: 'Монстры на каникулах в Москве', media: { src: '/assets/nominees/irl/monsters-moscow.jpg', alt: 'Превью Монстры на каникулах в Москве' }, videos: [1, 2, 3].map(i => video(`/assets/nominees/irl/videos/monsters-moscow-${i}.mp4`, `Монстры на каникулах в Москве — видео ${i}`)) },
        { id: 'irl-part-2', name: 'Монстры на каникулах — часть 2', media: { src: '/assets/nominees/irl/monsters-part-2.jpg', alt: 'Превью Монстры на каникулах — часть 2' }, videos: [1, 2, 3].map(i => video(`/assets/nominees/irl/videos/monsters-part-2-${i}.mp4`, `Монстры на каникулах — часть 2, видео ${i}`)) },
        { id: 'irl-chat-roulette', name: 'Чат-рулетка', media: { src: '/assets/generated-previews/irl/chat-roulette.jpg', alt: 'Кадр из Чат-рулетки' }, videos: [video('/assets/nominees/irl/videos/chat-roulette-1.mp4', 'Чат-рулетка — видео 1'), video('/assets/nominees/irl/videos/chat-roulette-2.mp4', 'Чат-рулетка — видео 2')] },
        { id: 'cooking-beef', name: 'Говядина Веллингтон', media: { src: '/assets/nominees/cooking/beef-wellington.jpg', alt: 'Превью Говядина Веллингтон' }, videos: [video('/assets/nominees/cooking/videos/beef-wellington-1.mp4', 'Говядина Веллингтон')] },
        { id: 'cooking-pizza', name: 'Готовим пиццу', media: { src: '/assets/generated-previews/cooking/pizza.jpg', alt: 'Кадр из стрима Готовим пиццу' }, videos: [video('/assets/nominees/cooking/videos/pizza-1.mp4', 'Готовим пиццу — видео 1'), video('/assets/nominees/cooking/videos/pizza-2.mp4', 'Готовим пиццу — видео 2')] },
        { id: 'cooking-moscow', name: 'Московский алкокукинг', media: { src: '/assets/nominees/cooking/moscow-local-cooking.jpg', alt: 'Превью Московский алкокукинг' }, videos: [video('/assets/nominees/cooking/videos/moscow-local-cooking-1.mp4', 'Московский алкокукинг — видео 1'), video('/assets/nominees/cooking/videos/moscow-local-cooking-2.mp4', 'Московский алкокукинг — видео 2')] },
      ],
      winnerId: null,
    },
    {
      id: 'dota-clip', title: 'DOTA 2 — Клип года', icon: 'play', kind: 'clip',
      intro: 'Лучшие моменты Dota 2: невероятные мувы, неожиданные развязки и эпизоды, которые хочется пересматривать',
      nominees: Array.from({ length: 7 }, (_, i) => ({
        id: `dota-clip-${i + 1}`, name: `Dota 2 — клип №${i + 1}`,
        media: { src: `/assets/generated-previews/dota-clip/dota-clip-${String(i + 1).padStart(2, '0')}.jpg`, alt: `Кадр из Dota 2 — клип №${i + 1}` },
        videos: [video(`/assets/nominees/dota-clip/videos/dota-clip-${String(i + 1).padStart(2, '0')}.mp4`, `Dota 2 — клип №${i + 1}`)],
      })),
      winnerId: null,
    },
    {
      id: 'community-drop', title: 'Завоз от комьюнити', icon: 'package', kind: 'frame',
      intro: 'Когда зрители становились главными героями эфира. Самые яркие моменты, подаренные комьюнити',
      nominees: Array.from({ length: 7 }, (_, i) => ({
        id: `community-drop-${i + 1}`, name: `Завоз №${i + 1}`,
        media: { src: `/assets/generated-previews/community-drop/community-drop-${i + 1}.jpg`, alt: `Кадр из ролика Завоз №${i + 1}` },
        videos: [video(`/assets/nominees/community-drop/videos/community-drop-${i + 1}.mp4`, `Завоз №${i + 1}`)],
      })),
      winnerId: null,
    },
    {
      id: 'fail', title: 'Фейл года', icon: 'flame', kind: 'frame',
      intro: 'Моменты, когда всё пошло не по плану. Самые нелепые ошибки, неожиданные провалы и ситуации, которые невозможно забыть',
      nominees: Array.from({ length: 8 }, (_, i) => ({
        id: `fail-${i + 1}`, name: `Фейл №${i + 1}`,
        media: { src: `/assets/generated-previews/fail/fail-${String(i + 1).padStart(2, '0')}.jpg`, alt: `Кадр из ролика Фейл №${i + 1}` },
        videos: [video(`/assets/nominees/fail/videos/fail-${String(i + 1).padStart(2, '0')}.mp4`, `Фейл №${i + 1}`)],
      })),
      winnerId: null,
    },
    {
      id: 'chatter', title: 'Чаттер года', icon: 'message', kind: 'chatter',
      intro: 'Тот, без кого чат уже невозможно представить. Самый запоминающийся участник комьюнити 2026 года',
      nominees: [], winnerId: null, winner: null,
    },
    {
      id: 'custom-award', title: 'Ваша номинация', icon: 'sparkles', kind: 'custom',
      intro: 'Твой шанс придумать собственную награду. Предложи номинацию и того, кто заслуживает её получить',
      nominees: [], winnerId: null, winner: null,
    },
  ],
};
