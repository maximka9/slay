import type { Env } from './types';
import { votingAvailability } from './availability';

export async function setting(env: Env, key: string) {
  return (await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first<{ value: string }>())?.value ?? '';
}

export function setSetting(env: Env, key: string, value: string, timestamp: string) {
  return env.DB.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).bind(key, value, timestamp);
}

export async function publicNominations(env: Env) {
  const [settings, nominations, candidates] = await Promise.all([
    env.DB.prepare("SELECT key, value FROM settings WHERE key IN ('voting_status','chatter_free_input')").all<{ key: string; value: string }>(),
    env.DB.prepare('SELECT id, title, description, sort_order, enabled FROM nominations WHERE enabled = 1 ORDER BY sort_order').all(),
    env.DB.prepare('SELECT id, nomination_id, name, image_url, twitch_login, sort_order FROM candidates WHERE enabled = 1 ORDER BY nomination_id, sort_order').all(),
  ]);
  const values = Object.fromEntries(settings.results.map(row => [row.key, row.value]));
  const globalStatus = values.voting_status ?? 'preparation';
  const chatterFreeInput = values.chatter_free_input === '1';
  const mappedNominations = nominations.results.map((nomination: Record<string, unknown>) => {
    const nominationCandidates = candidates.results
      .filter((candidate: Record<string, unknown>) => candidate.nomination_id === nomination.id)
      .map((candidate: Record<string, unknown>) => ({
        id: candidate.id,
        name: candidate.name,
        imageUrl: candidate.image_url,
        twitchLogin: candidate.twitch_login,
        sortOrder: candidate.sort_order,
      }));
    const ready = nomination.id === 'custom-award'
      || nominationCandidates.length > 0
      || (nomination.id === 'chatter' && chatterFreeInput);

    return {
      id: nomination.id,
      title: nomination.title,
      description: nomination.description,
      sortOrder: nomination.sort_order,
      enabled: nomination.enabled === 1,
      ...votingAvailability({
        globalStatus,
        enabled: nomination.enabled === 1,
        ready,
        notReadyReason: 'В этой номинации пока нет доступных вариантов.',
      }),
      candidates: nominationCandidates,
    };
  });
  return {
    voting: { status: globalStatus, chatterFreeInput },
    nominations: mappedNominations,
  };
}

export async function markResultsDirty(env: Env, timestamp: string) {
  await setSetting(env, 'results_dirty', '1', timestamp).run();
}
