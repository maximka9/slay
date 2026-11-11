import { ApiError, type Env, type SessionUser } from './types';
import { cookies } from './http';

export const SESSION_COOKIE = 'camca63_session';
export const OAUTH_COOKIE = 'camca63_oauth_state';
export const SESSION_SECONDS = 60 * 60 * 24 * 7;

export const now = () => new Date().toISOString();
export const randomToken = (bytes = 32) => {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...data)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

export async function hash(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export const secretHash = (value: string, secret: string) => hash(`${value}.${secret}`);

export async function getSession(request: Request, env: Env): Promise<SessionUser | null> {
  const raw = cookies(request)[SESSION_COOKIE];
  if (!raw) return null;
  const sessionHash = await secretHash(raw, env.SESSION_SECRET);
  const row = await env.DB.prepare(`
    SELECT s.id_hash, s.csrf_token, s.twitch_user_id, s.expires_at,
           u.login, u.display_name, u.avatar_url, u.twitch_created_at, u.first_seen_at
    FROM sessions s JOIN users u ON u.twitch_user_id = s.twitch_user_id
    WHERE s.id_hash = ? AND s.expires_at > ?
  `).bind(sessionHash, now()).first<Record<string, string>>();
  if (!row) return null;
  const timestamp = now();
  await env.DB.batch([
    env.DB.prepare('UPDATE sessions SET last_seen_at = ? WHERE id_hash = ?').bind(timestamp, sessionHash),
    env.DB.prepare('UPDATE users SET last_seen_at = ? WHERE twitch_user_id = ?').bind(timestamp, row.twitch_user_id),
  ]);
  return {
    sessionHash,
    csrfToken: row.csrf_token,
    twitchUserId: row.twitch_user_id,
    login: row.login,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    twitchCreatedAt: row.twitch_created_at,
    firstSeenAt: row.first_seen_at,
    isAdmin: row.twitch_user_id === env.ADMIN_TWITCH_USER_ID,
  };
}

export async function requireUser(request: Request, env: Env) {
  const user = await getSession(request, env);
  if (!user) throw new ApiError(401, 'Войдите через Twitch.', 'authentication_required');
  return user;
}

export async function requireAdmin(request: Request, env: Env) {
  const user = await requireUser(request, env);
  if (!user.isAdmin) throw new ApiError(403, 'Доступ разрешён только владельцу camca63.', 'admin_required');
  return user;
}

export function requireCsrf(request: Request, user: SessionUser) {
  const token = request.headers.get('x-csrf-token');
  if (!token || token !== user.csrfToken) throw new ApiError(403, 'Недействительный CSRF-токен.', 'csrf_failed');
}

export async function rateLimit(env: Env, actorHash: string, action: string, maximum: number) {
  const windowStart = Math.floor(Date.now() / 60_000);
  const result = await env.DB.prepare(`
    INSERT INTO rate_limits (actor_hash, action, window_start, request_count) VALUES (?, ?, ?, 1)
    ON CONFLICT(actor_hash, action, window_start) DO UPDATE SET request_count = request_count + 1
    RETURNING request_count
  `).bind(actorHash, action, windowStart).first<{ request_count: number }>();
  if ((result?.request_count ?? maximum + 1) > maximum) throw new ApiError(429, 'Слишком много запросов. Попробуйте через минуту.', 'rate_limited');
}
