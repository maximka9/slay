export const CUSTOM_AWARD_ID = 'custom-award';

export type PublicationPlan = {
  standardNominationIds: string[];
  publishCustomAward: boolean;
  explicitSelection: boolean;
};

export function publicationPlan(requestedIds: string[] | undefined, availableStandardIds: string[]): PublicationPlan {
  const uniqueRequested = [...new Set((requestedIds ?? []).filter(Boolean))];
  const explicitSelection = uniqueRequested.length > 0;
  return {
    standardNominationIds: explicitSelection
      ? uniqueRequested.filter(id => id !== CUSTOM_AWARD_ID)
      : [...availableStandardIds],
    publishCustomAward: explicitSelection && uniqueRequested.includes(CUSTOM_AWARD_ID),
    explicitSelection,
  };
}

export function canExposePublicResults(votingStatus: string, resultsDirty: boolean) {
  return votingStatus === 'closed' && !resultsDirty;
}
