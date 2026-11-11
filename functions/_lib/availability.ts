export type VotingAvailability = { canVote: boolean; unavailableReason: string | null };

export function votingAvailability(input: {
  now: string; globalStatus: string; globalStartsAt?: string | null; globalEndsAt?: string | null;
  nominationStatus: string; nominationStartsAt?: string | null; nominationEndsAt?: string | null; enabled: boolean;
}): VotingAvailability {
  if (!input.enabled) return { canVote: false, unavailableReason: 'Категория отключена.' };
  if (input.globalStatus !== 'open') return { canVote: false, unavailableReason: input.globalStatus === 'preparation' ? 'Голосование ещё не открыто.' : 'Голосование закрыто.' };
  if (input.globalStartsAt && input.globalStartsAt > input.now) return { canVote: false, unavailableReason: 'Голосование ещё не началось.' };
  if (input.globalEndsAt && input.globalEndsAt <= input.now) return { canVote: false, unavailableReason: 'Голосование завершено.' };
  if (input.nominationStatus !== 'open') return { canVote: false, unavailableReason: input.nominationStatus === 'preparation' ? 'Категория готовится к открытию.' : 'Категория закрыта.' };
  if (input.nominationStartsAt && input.nominationStartsAt > input.now) return { canVote: false, unavailableReason: 'Голосование в категории ещё не началось.' };
  if (input.nominationEndsAt && input.nominationEndsAt <= input.now) return { canVote: false, unavailableReason: 'Голосование в категории завершено.' };
  return { canVote: true, unavailableReason: null };
}
