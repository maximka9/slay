export type AuthUser = {
  twitchUserId: string; login: string; displayName: string; avatarUrl: string;
  twitchCreatedAt: string; firstSeenAt: string;
};
export type MeResponse = { authenticated: boolean; isAdmin: boolean; csrfToken?: string; user: AuthUser | null };
export type VotingCandidate = { id: string; name: string; imageUrl: string; twitchLogin?: string | null; sortOrder: number };
export type VotingNomination = {
  id: string; title: string; description: string; sortOrder: number; votingStatus: 'preparation' | 'open' | 'closed';
  enabled: boolean; startsAt?: string | null; endsAt?: string | null; candidates: VotingCandidate[];
};
export type VotingData = {
  voting: { status: 'preparation' | 'open' | 'closed'; startsAt: string | null; endsAt: string | null; timezone: string; chatterFreeInput: boolean };
  nominations: VotingNomination[];
};
export type MyVote = { nominationId: string; candidateId: string; candidateName: string; updatedAt: string; status: 'valid' | 'excluded' };

export class ApiClientError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: 'same-origin', ...init, headers: { Accept: 'application/json', ...(init?.headers ?? {}) } });
  const type = response.headers.get('content-type') ?? '';
  const payload = type.includes('application/json') ? await response.json() as Record<string, unknown> : null;
  if (!response.ok) throw new ApiClientError(response.status, String(payload?.error ?? 'request_failed'), String(payload?.message ?? `Ошибка HTTP ${response.status}`));
  if (!payload) throw new ApiClientError(response.status, 'invalid_response', 'Сервер вернул некорректный ответ.');
  return payload as T;
}

export function mutation<T>(path: string, method: 'POST' | 'PUT' | 'PATCH', csrfToken: string, data: unknown) {
  return api<T>(path, { method, headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, body: JSON.stringify(data) });
}
