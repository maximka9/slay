import type { AwardsConfig, Category } from './awards';
export type Scene = { id: string; type: 'cover' | 'program' | 'nominees' | 'winner' | 'final'; categoryId?: string };
export function createScenes(config: AwardsConfig): Scene[] {
  return [
    { id: 'cover', type: 'cover' }, { id: 'program', type: 'program' },
    ...config.categories.flatMap((category): Scene[] => [
      { id: `${category.id}-0`, type: 'nominees', categoryId: category.id },
      { id: `${category.id}-winner`, type: 'winner', categoryId: category.id },
    ]),
    { id: 'final', type: 'final' },
  ];
}
export function validateConfig(config: AwardsConfig): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const category of config.categories) {
    if (!category.id || ids.has(category.id)) errors.push(`Повтор или пустой ID категории: ${category.id}`);
    ids.add(category.id);
    const nomineeIds = new Set<string>();
    const names = new Set<string>();
    for (const nominee of category.nominees) {
      if (!nominee.id || nomineeIds.has(nominee.id)) errors.push(`${category.title}: повтор или пустой ID участника`);
      nomineeIds.add(nominee.id);
      const name = nominee.name.trim().toLowerCase();
      if (name && names.has(name)) errors.push(`${category.title}: повтор имени ${nominee.name}`);
      if (name) names.add(name);
    }
    if (category.winner && (!category.winner.id.trim() || !category.winner.name.trim())) errors.push(`${category.title}: отдельный победитель должен иметь id и имя`);
    if (category.winnerId !== null && !category.nominees.some(n => n.id === category.winnerId && n.name.trim())) errors.push(`${category.title}: winnerId должен указывать на заполненного участника`);
    if (category.winner && category.winnerId !== null) errors.push(`${category.title}: используйте winner или winnerId, но не оба поля`);
  }
  return errors;
}
export function getWinner(category: Category) {
  if (category.winner?.id.trim() && category.winner.name.trim()) return category.winner;
  return category.nominees.find(n => n.id === category.winnerId && n.name.trim());
}
export function readReveals(value: string | null, config: AwardsConfig): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(value ?? '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(config.categories.flatMap(c => {
      const winner = getWinner(c);
      return winner && (parsed as Record<string, unknown>)[c.id] === winner.id ? [[c.id, winner.id]] : [];
    }));
  } catch { return {}; }
}
