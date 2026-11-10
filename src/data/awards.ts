export type Media = { src: string; alt?: string; type?: 'image' | 'video'; poster?: string };
export type Nominee = { id: string; name: string; media?: Media; description?: string; clipUrl?: string };
export type Category = {
  id: string; title: string; intro: string;
  kind: 'chatter' | 'poster' | 'frame' | 'clip' | 'meme';
  icon: 'message' | 'sparkles' | 'gamepad' | 'zap' | 'glass' | 'chef' | 'play' | 'smile';
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

const slots = (prefix: string): Nominee[] => Array.from({ length: 4 }, (_, i) => ({ id: `${prefix}-${i + 1}`, name: '' }));

// Единственный источник контента. Все победители намеренно не заданы.
export const awards: AwardsConfig = {
  year: 2026,
  channel: 'camca63',
  ceremonyPublished: false,
  categories: [
    {
      id: 'chatter', title: 'Чаттер года', icon: 'message', kind: 'chatter',
      intro: 'Тот, без кого чат уже невозможно представить. Самый запоминающийся участник комьюнити 2026 года',
      nominees: [],
      winnerId: null,
      winner: null,
    },
    {
      id: 'indie-game', title: 'Инди-игра года', icon: 'sparkles', kind: 'poster',
      intro: 'Небольшие студии. Большие впечатления',
      nominees: [
        { id: 'indie-1', name: 'BOMBANANA!', media: { src: '/assets/nominees/indie-game/BOMBANANA!.jpeg', alt: 'Обложка BOMBANANA!' } },
        { id: 'indie-2', name: 'Fears to Fathom - Scratch Creek', media: { src: '/assets/nominees/indie-game/Fears to Fathom - Scratch Creek.jpg', alt: 'Обложка Fears to Fathom - Scratch Creek' } },
        { id: 'indie-3', name: 'Meccha Chameleon', media: { src: '/assets/nominees/indie-game/meccha.jpeg', alt: 'Обложка Meccha Chameleon' } },
        { id: 'indie-4', name: "No, I'm not a Human", media: { src: '/assets/nominees/indie-game/no im no human.jpeg', alt: "Обложка No, I'm not a Human" } },
        { id: 'indie-5', name: 'PEAK', media: { src: '/assets/nominees/indie-game/peak.jpeg', alt: 'Обложка PEAK' } },
        { id: 'indie-6', name: 'The Operator', media: { src: '/assets/nominees/indie-game/the-operator.png', alt: 'Обложка The Operator' } },
        { id: 'indie-7', name: "Who's Lila?", media: { src: '/assets/nominees/indie-game/whos lila.jpeg', alt: "Обложка Who's Lila?" } },
        { id: 'indie-8', name: 'R.E.P.O.', media: { src: '/assets/nominees/indie-game/repo.jpeg', alt: 'Обложка R.E.P.O.' } },
      ],
      winnerId: null,
    },
    {
      id: 'game', title: 'Игра года', icon: 'gamepad', kind: 'poster',
      intro: 'Главное игровое впечатление 2026 года',
      nominees: [
        { id: 'game-1', name: 'Heavy Rain', media: { src: '/assets/nominees/game/heavyrain.webp', alt: 'Обложка Heavy Rain' } },
        { id: 'game-2', name: 'Resident Evil 2', media: { src: '/assets/nominees/game/re 2.jpg', alt: 'Обложка Resident Evil 2' } },
        { id: 'game-3', name: 'Resident Evil 4', media: { src: '/assets/nominees/game/re 4.jpg', alt: 'Обложка Resident Evil 4' } },
        { id: 'game-4', name: 'Red Dead Redemption 2', media: { src: '/assets/nominees/game/Red Dead Redemption 2.jpg', alt: 'Обложка Red Dead Redemption 2' } },
        { id: 'game-5', name: 'The Last of Us Part I', media: { src: '/assets/nominees/game/The Last of Us Part I.jpg', alt: 'Обложка The Last of Us Part I' } },
        { id: 'game-6', name: 'The Witcher 3: Wild Hunt', media: { src: '/assets/nominees/game/The Witcher 3 Wild Hunt Remastered.jpeg', alt: 'Обложка The Witcher 3: Wild Hunt' } },
        { id: 'game-7', name: 'The Last of Us Part II', media: { src: '/assets/nominees/game/The_last_of_us_2_cover.png', alt: 'Обложка The Last of Us Part II' } },
        { id: 'game-8', name: 'Black Myth: Wukong', media: { src: '/assets/nominees/game/wukong.jpg', alt: 'Обложка Black Myth: Wukong' } },
        { id: 'game-9', name: 'Resident Evil 7: Biohazard', media: { src: '/assets/nominees/game/Арт_Resident_Evil_7_biohazard.jpg', alt: 'Обложка Resident Evil 7: Biohazard' } },
        { id: 'game-10', name: 'Clair Obscur: Expedition 33', media: { src: '/assets/nominees/game/Clair Obscur Expedition 33.jpeg', alt: 'Обложка Clair Obscur: Expedition 33' } },
      ],
      winnerId: null,
    },
    { id: 'event', title: 'Ивент года', icon: 'zap', kind: 'frame', intro: 'Событие, которое объединило зрителей', nominees: slots('event'), winnerId: null },
    { id: 'alkostream', title: 'Алкострим года', icon: 'glass', kind: 'frame', intro: 'Самый непредсказуемый эфир этого года', nominees: slots('alkostream'), winnerId: null },
    { id: 'cooking', title: 'Кукинг года', icon: 'chef', kind: 'frame', intro: 'Когда готовка превратилась в шоу', nominees: slots('cooking'), winnerId: null },
    { id: 'clip', title: 'Клип года', icon: 'play', kind: 'clip', intro: 'Несколько секунд, которые хочется пересматривать', nominees: slots('clip'), winnerId: null },
    { id: 'meme', title: 'Мем года', icon: 'smile', kind: 'meme', intro: 'Шутка, которая давно живёт своей жизнью', nominees: slots('meme'), winnerId: null },
  ],
};
