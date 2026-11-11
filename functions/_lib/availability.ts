export type VotingAvailability = { canVote: boolean; unavailableReason: string | null };

export function votingAvailability(input: {
  globalStatus: string;
  enabled: boolean;
  ready: boolean;
  notReadyReason?: string | null;
}): VotingAvailability {
  if (!input.enabled) return { canVote: false, unavailableReason: 'Номинация отключена.' };
  if (input.globalStatus !== 'open') {
    return {
      canVote: false,
      unavailableReason: input.globalStatus === 'preparation'
        ? 'Голосование ещё не открыто.'
        : 'Голосование закрыто.',
    };
  }
  if (!input.ready) {
    return { canVote: false, unavailableReason: input.notReadyReason ?? 'Номинация ещё не готова к голосованию.' };
  }
  return { canVote: true, unavailableReason: null };
}
