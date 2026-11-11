import { ApiError, type Env } from './types';

type TwitchToken = { access_token: string; expires_in: number; refresh_token?: string; token_type: string };
export type TwitchUser = { id: string; login: string; display_name: string; profile_image_url: string; created_at: string };

function ensureTwitch(env: Env) {
  if (!env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET || !env.TWITCH_REDIRECT_URI) {
    throw new ApiError(503, 'Twitch OAuth ещё не настроен.', 'oauth_not_configured');
  }
}

async function tokenRequest(params: URLSearchParams, env: Env) {
  ensureTwitch(env);
  const response = await fetch('https://id.twitch.tv/oauth2/token', { method: 'POST', body: params });
  if (!response.ok) throw new ApiError(502, 'Twitch не подтвердил авторизацию.', 'twitch_token_failed');
  return response.json<TwitchToken>();
}

export async function exchangeCode(code: string, env: Env) {
  const token = await tokenRequest(new URLSearchParams({
    client_id: env.TWITCH_CLIENT_ID,
    client_secret: env.TWITCH_CLIENT_SECRET,
    code,
    grant_type: 'authorization_code',
    redirect_uri: env.TWITCH_REDIRECT_URI,
  }), env);
  const validation = await fetch('https://id.twitch.tv/oauth2/validate', { headers: { Authorization: `OAuth ${token.access_token}` } });
  if (!validation.ok) throw new ApiError(502, 'Twitch вернул недействительный токен.', 'twitch_validation_failed');
  const validated = await validation.json<{ client_id: string; user_id?: string }>();
  if (validated.client_id !== env.TWITCH_CLIENT_ID || !validated.user_id) throw new ApiError(502, 'Twitch не подтвердил пользователя.', 'twitch_identity_failed');
  const user = await fetchTwitchUser(token.access_token, env);
  if (user.id !== validated.user_id) throw new ApiError(502, 'Идентификатор Twitch не совпал.', 'twitch_identity_mismatch');
  return user;
}

async function fetchTwitchUser(accessToken: string, env: Env, login?: string) {
  const url = new URL('https://api.twitch.tv/helix/users');
  if (login) url.searchParams.set('login', login);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}`, 'Client-Id': env.TWITCH_CLIENT_ID } });
  if (!response.ok) throw new ApiError(502, 'Не удалось получить профиль Twitch.', 'twitch_profile_failed');
  const payload = await response.json<{ data: TwitchUser[] }>();
  if (!payload.data[0]) throw new ApiError(404, 'Twitch-пользователь не найден.', 'twitch_user_not_found');
  return payload.data[0];
}

export async function resolveTwitchLogin(login: string, env: Env) {
  const normalized = login.trim().replace(/^@/, '').toLowerCase();
  if (!/^[a-z0-9_]{4,25}$/.test(normalized)) throw new ApiError(400, 'Некорректный Twitch-ник.', 'invalid_twitch_login');
  const token = await tokenRequest(new URLSearchParams({
    client_id: env.TWITCH_CLIENT_ID,
    client_secret: env.TWITCH_CLIENT_SECRET,
    grant_type: 'client_credentials',
  }), env);
  return fetchTwitchUser(token.access_token, env, normalized);
}

export function authorizeUrl(state: string, env: Env) {
  ensureTwitch(env);
  const url = new URL('https://id.twitch.tv/oauth2/authorize');
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: env.TWITCH_CLIENT_ID,
    redirect_uri: env.TWITCH_REDIRECT_URI,
    scope: 'openid',
    state,
  }).toString();
  return url.toString();
}
