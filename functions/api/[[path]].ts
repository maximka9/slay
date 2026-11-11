import { ApiError, type ApiContext, type Env } from '../_lib/types';
import { apiError, body, cookie, cookies, integer, json, redirect } from '../_lib/http';
import { OAUTH_COOKIE, SESSION_COOKIE, SESSION_SECONDS, getSession, now, randomToken, rateLimit, requireAdmin, requireCsrf, requireUser, secretHash } from '../_lib/security';
import { authorizeUrl, exchangeCode, resolveTwitchLogin } from '../_lib/twitch';
import { publicNominations, setSetting, setting } from '../_lib/data';

type JsonObject = Record<string, unknown>;

export const onRequest: PagesFunction<Env> = async context => {
  try { return await route(context as ApiContext); }
  catch (error) { return apiError(error); }
};

async function route(context: ApiContext): Promise<Response> {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = request.method.toUpperCase();
  if (method === 'OPTIONS') return new Response(null, { status: 204, headers: { Allow: 'GET, POST, PUT, PATCH, OPTIONS' } });

  if (method === 'GET' && path === '/api/auth/login') return login(request, env, url);
  if (method === 'GET' && path === '/api/auth/callback') return callback(request, env, url);
  if (method === 'POST' && path === '/api/auth/logout') return logout(request, env);
  if (method === 'GET' && path === '/api/me') return me(request, env);
  if (method === 'GET' && path === '/api/nominations') return json(await publicNominations(env));
  if (method === 'GET' && path === '/api/my-votes') return myVotes(request, env);
  if (method === 'PUT' && path.startsWith('/api/votes/')) return castVote(request, env, decodeURIComponent(path.slice('/api/votes/'.length)));
  if (method === 'GET' && path === '/api/results') return publicResults(env);

  if (path.startsWith('/api/admin/')) {
    if (method === 'GET' && path === '/api/admin/overview') return adminOverview(request, env);
    if (method === 'GET' && path === '/api/admin/votes') return adminVotes(request, env, url);
    if (method === 'GET' && path === '/api/admin/candidates') return adminCandidates(request, env);
    if (method === 'GET' && path === '/api/admin/actions') return adminActions(request, env, url);
    if (method === 'GET' && path === '/api/admin/results') return adminResults(request, env);
    if (method === 'GET' && path === '/api/admin/ceremony') return ceremonyResults(request, env);
    if (method === 'GET' && path === '/api/admin/export') return exportCsv(request, env, url);
    if (method === 'PATCH' && path.startsWith('/api/admin/nominations/')) return updateNomination(request, env, decodeURIComponent(path.slice('/api/admin/nominations/'.length)));
    if (method === 'POST' && path === '/api/admin/candidates') return createCandidate(request, env);
    if (method === 'PATCH' && path.startsWith('/api/admin/candidates/')) return updateCandidate(request, env, decodeURIComponent(path.slice('/api/admin/candidates/'.length)));
    if (method === 'POST' && path === '/api/admin/voting/status') return updateVotingStatus(request, env);
    if (method === 'POST' && path === '/api/admin/results/finalize') return finalizeResults(request, env);
    if (method === 'POST' && path === '/api/admin/results/resolve-tie') return resolveTie(request, env);
    if (method === 'POST' && path === '/api/admin/results/publish') return publishResults(request, env);
    const voteAction = path.match(/^\/api\/admin\/votes\/(\d+)\/(exclude|restore)$/);
    if (method === 'POST' && voteAction) return moderateVote(request, env, Number(voteAction[1]), voteAction[2] as 'exclude' | 'restore');
    const userAction = path.match(/^\/api\/admin\/users\/([^/]+)\/(exclude|restore)$/);
    if (method === 'POST' && userAction) return moderateUser(request, env, decodeURIComponent(userAction[1]), userAction[2] as 'exclude' | 'restore');
  }

  throw new ApiError(404, 'API-маршрут не найден.', 'not_found');
}

async function login(request: Request, env: Env, url: URL) {
  const state = randomToken();
  const stateHash = await secretHash(state, env.SESSION_SECRET);
  const returnToValue = url.searchParams.get('returnTo') || '/vote';
  const returnTo = returnToValue.startsWith('/') && !returnToValue.startsWith('//') ? returnToValue : '/vote';
  const timestamp = now();
  const expires = new Date(Date.now() + 10 * 60_000).toISOString();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM oauth_states WHERE expires_at <= ?').bind(timestamp),
    env.DB.prepare('INSERT INTO oauth_states (state_hash, return_to, created_at, expires_at) VALUES (?, ?, ?, ?)').bind(stateHash, returnTo, timestamp, expires),
  ]);
  return redirect(authorizeUrl(state, env), { 'Set-Cookie': cookie(OAUTH_COOKIE, state, request, 600) });
}

async function callback(request: Request, env: Env, url: URL) {
  const state = url.searchParams.get('state') ?? '';
  const expected = cookies(request)[OAUTH_COOKIE] ?? '';
  if (!state || !expected || state !== expected) throw new ApiError(400, 'OAuth state не совпал.', 'oauth_state_failed');
  const stateHash = await secretHash(state, env.SESSION_SECRET);
  const stateRow = await env.DB.prepare('SELECT return_to, expires_at FROM oauth_states WHERE state_hash = ?').bind(stateHash).first<{ return_to: string; expires_at: string }>();
  await env.DB.prepare('DELETE FROM oauth_states WHERE state_hash = ?').bind(stateHash).run();
  if (!stateRow || stateRow.expires_at <= now()) throw new ApiError(400, 'OAuth state истёк или уже использован.', 'oauth_state_expired');
  if (url.searchParams.get('error')) return redirect(`${stateRow.return_to}?auth=cancelled`, { 'Set-Cookie': cookie(OAUTH_COOKIE, '', request, 0) });
  const code = url.searchParams.get('code');
  if (!code) throw new ApiError(400, 'Twitch не вернул код авторизации.', 'oauth_code_missing');
  const twitch = await exchangeCode(code, env);
  const timestamp = now();
  await env.DB.prepare(`
    INSERT INTO users (twitch_user_id, login, display_name, avatar_url, twitch_created_at, first_seen_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(twitch_user_id) DO UPDATE SET login = excluded.login, display_name = excluded.display_name,
      avatar_url = excluded.avatar_url, twitch_created_at = excluded.twitch_created_at, last_seen_at = excluded.last_seen_at
  `).bind(twitch.id, twitch.login, twitch.display_name, twitch.profile_image_url, twitch.created_at, timestamp, timestamp).run();
  const session = randomToken();
  const sessionHash = await secretHash(session, env.SESSION_SECRET);
  const csrf = randomToken(24);
  const expires = new Date(Date.now() + SESSION_SECONDS * 1000).toISOString();
  await env.DB.prepare('INSERT INTO sessions (id_hash, twitch_user_id, csrf_token, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(sessionHash, twitch.id, csrf, timestamp, timestamp, expires).run();
  return redirect(`${stateRow.return_to}${stateRow.return_to.includes('?') ? '&' : '?'}auth=ok`, {}, [
    cookie(SESSION_COOKIE, session, request, SESSION_SECONDS), cookie(OAUTH_COOKIE, '', request, 0),
  ]);
}

async function logout(request: Request, env: Env) {
  const user = await requireUser(request, env);
  requireCsrf(request, user);
  await env.DB.prepare('DELETE FROM sessions WHERE id_hash = ?').bind(user.sessionHash).run();
  return json({ ok: true }, 200, { 'Set-Cookie': cookie(SESSION_COOKIE, '', request, 0) });
}

async function me(request: Request, env: Env) {
  const user = await getSession(request, env);
  if (!user) return json({ authenticated: false, user: null, isAdmin: false });
  return json({ authenticated: true, isAdmin: user.isAdmin, csrfToken: user.csrfToken, user: {
    twitchUserId: user.twitchUserId, login: user.login, displayName: user.displayName, avatarUrl: user.avatarUrl,
    twitchCreatedAt: user.twitchCreatedAt, firstSeenAt: user.firstSeenAt,
  } });
}

async function myVotes(request: Request, env: Env) {
  const user = await requireUser(request, env);
  const result = await env.DB.prepare(`
    SELECT v.nomination_id AS nominationId, v.candidate_id AS candidateId, v.updated_at AS updatedAt, v.status,
           c.name AS candidateName
    FROM votes v JOIN candidates c ON c.id = v.candidate_id
    WHERE v.twitch_user_id = ? ORDER BY v.nomination_id
  `).bind(user.twitchUserId).all();
  return json({ votes: result.results });
}

async function castVote(request: Request, env: Env, nominationId: string) {
  const user = await requireUser(request, env);
  requireCsrf(request, user);
  await rateLimit(env, user.sessionHash, 'vote', 20);
  const payload = await body<{ candidateId?: string; twitchLogin?: string }>(request);
  const [globalStatus, globalStartsAt, globalEndsAt] = await Promise.all([
    setting(env, 'voting_status'), setting(env, 'voting_starts_at'), setting(env, 'voting_ends_at'),
  ]);
  if (globalStatus !== 'open') throw new ApiError(409, 'Голосование сейчас закрыто.', 'voting_closed');
  const nomination = await env.DB.prepare('SELECT id, voting_status, enabled, starts_at, ends_at FROM nominations WHERE id = ?').bind(nominationId).first<Record<string, string | number | null>>();
  if (!nomination || nomination.enabled !== 1) throw new ApiError(404, 'Номинация не найдена.', 'nomination_not_found');
  if (nomination.voting_status !== 'open') throw new ApiError(409, 'Эта номинация закрыта.', 'nomination_closed');
  const timestamp = now();
  if (globalStartsAt && globalStartsAt > timestamp) throw new ApiError(409, 'Голосование ещё не началось.', 'voting_not_started');
  if (globalEndsAt && globalEndsAt <= timestamp) throw new ApiError(409, 'Голосование завершено.', 'voting_closed');
  if (nomination.starts_at && String(nomination.starts_at) > timestamp) throw new ApiError(409, 'Голосование в номинации ещё не началось.', 'nomination_not_started');
  if (nomination.ends_at && String(nomination.ends_at) <= timestamp) throw new ApiError(409, 'Голосование в номинации завершено.', 'nomination_closed');
  let candidateId = payload.candidateId?.trim() ?? '';
  if (!candidateId && nominationId === 'chatter' && payload.twitchLogin && await setting(env, 'chatter_free_input') === '1') {
    const twitch = await resolveTwitchLogin(payload.twitchLogin, env);
    candidateId = `chatter-${twitch.id}`;
    const order = (await env.DB.prepare("SELECT COALESCE(MAX(sort_order), 0) + 1 AS nextOrder FROM candidates WHERE nomination_id = 'chatter'").first<{ nextOrder: number }>())?.nextOrder ?? 1;
    await env.DB.prepare(`
      INSERT INTO candidates (id, nomination_id, name, image_url, twitch_user_id, twitch_login, enabled, sort_order)
      VALUES (?, 'chatter', ?, ?, ?, ?, 1, ?)
      ON CONFLICT(nomination_id, twitch_user_id) DO UPDATE SET name = excluded.name, image_url = excluded.image_url, twitch_login = excluded.twitch_login
    `).bind(candidateId, twitch.display_name, twitch.profile_image_url, twitch.id, twitch.login, order).run();
  }
  if (!candidateId) throw new ApiError(400, 'Выберите номинанта.', 'candidate_required');
  const candidate = await env.DB.prepare('SELECT id FROM candidates WHERE id = ? AND nomination_id = ? AND enabled = 1').bind(candidateId, nominationId).first();
  if (!candidate) throw new ApiError(400, 'Номинант не относится к выбранной категории.', 'invalid_candidate');
  const current = await env.DB.prepare('SELECT id, candidate_id, status FROM votes WHERE nomination_id = ? AND twitch_user_id = ?').bind(nominationId, user.twitchUserId).first<{ id: number; candidate_id: string; status: string }>();
  if (current?.candidate_id === candidateId) return json({ ok: true, unchanged: true, vote: { nominationId, candidateId, status: current.status } });
  const statements = [];
  if (current) statements.push(env.DB.prepare('INSERT INTO vote_history (vote_id, previous_candidate_id, new_candidate_id, changed_at) VALUES (?, ?, ?, ?)').bind(current.id, current.candidate_id, candidateId, timestamp));
  statements.push(env.DB.prepare(`
    INSERT INTO votes (nomination_id, candidate_id, twitch_user_id, created_at, updated_at, status)
    VALUES (?, ?, ?, ?, ?, 'valid')
    ON CONFLICT(nomination_id, twitch_user_id) DO UPDATE SET candidate_id = excluded.candidate_id, updated_at = excluded.updated_at
  `).bind(nominationId, candidateId, user.twitchUserId, timestamp, timestamp));
  statements.push(setSetting(env, 'results_dirty', '1', timestamp));
  await env.DB.batch(statements);
  const saved = await env.DB.prepare('SELECT status FROM votes WHERE nomination_id = ? AND twitch_user_id = ?').bind(nominationId, user.twitchUserId).first<{ status: string }>();
  return json({ ok: true, unchanged: false, vote: { nominationId, candidateId, status: saved?.status ?? 'valid' } });
}

async function adminOverview(request: Request, env: Env) {
  await requireAdmin(request, env);
  const [counts, nominations, lastVote, settings, recent] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(DISTINCT twitch_user_id) AS users,
      SUM(CASE WHEN status = 'valid' THEN 1 ELSE 0 END) AS validVotes,
      SUM(CASE WHEN status = 'excluded' THEN 1 ELSE 0 END) AS excludedVotes FROM votes`).first(),
    env.DB.prepare(`SELECT n.id, n.title, n.voting_status AS votingStatus, COUNT(v.id) AS votes,
      SUM(CASE WHEN v.status = 'valid' THEN 1 ELSE 0 END) AS validVotes
      FROM nominations n LEFT JOIN votes v ON v.nomination_id = n.id GROUP BY n.id ORDER BY n.sort_order`).all(),
    env.DB.prepare('SELECT MAX(updated_at) AS lastVoteAt FROM votes').first(),
    env.DB.prepare('SELECT key, value FROM settings').all<{ key: string; value: string }>(),
    env.DB.prepare("SELECT COUNT(DISTINCT twitch_user_id) AS recentUsers FROM votes WHERE updated_at >= datetime('now', '-1 day')").first(),
  ]);
  return json({ counts, nominations: nominations.results, lastVote, recent, settings: Object.fromEntries(settings.results.map(row => [row.key, row.value])) });
}

async function adminVotes(request: Request, env: Env, url: URL) {
  await requireAdmin(request, env);
  const clauses: string[] = [];
  const bindings: unknown[] = [];
  const search = url.searchParams.get('search')?.trim();
  if (search) { clauses.push('(u.login LIKE ? OR u.display_name LIKE ? OR u.twitch_user_id = ?)'); bindings.push(`%${search}%`, `%${search}%`, search); }
  const status = url.searchParams.get('status');
  if (status === 'valid' || status === 'excluded') { clauses.push('v.status = ?'); bindings.push(status); }
  const nomination = url.searchParams.get('nomination');
  if (nomination) { clauses.push('v.nomination_id = ?'); bindings.push(nomination); }
  if (url.searchParams.get('newAccounts') === '1') clauses.push("u.twitch_created_at >= datetime('now', '-90 day')");
  const sort = url.searchParams.get('sort') === 'account' ? 'u.twitch_created_at DESC' : url.searchParams.get('sort') === 'first' ? 'u.first_seen_at DESC' : 'v.updated_at DESC';
  const limit = integer(url.searchParams.get('limit'), 200, 1, 500);
  const query = `SELECT v.id, v.nomination_id AS nominationId, n.title AS nominationTitle, v.candidate_id AS candidateId,
    c.name AS candidateName, v.twitch_user_id AS twitchUserId, u.login, u.display_name AS displayName,
    u.avatar_url AS avatarUrl, u.twitch_created_at AS twitchCreatedAt, u.first_seen_at AS firstSeenAt,
    v.created_at AS createdAt, v.updated_at AS updatedAt, v.status, v.exclusion_reason AS exclusionReason,
    v.exclusion_comment AS exclusionComment FROM votes v
    JOIN users u ON u.twitch_user_id = v.twitch_user_id JOIN nominations n ON n.id = v.nomination_id
    JOIN candidates c ON c.id = v.candidate_id ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''} ORDER BY ${sort} LIMIT ?`;
  bindings.push(limit);
  return json({ votes: (await env.DB.prepare(query).bind(...bindings).all()).results });
}

async function adminCandidates(request: Request, env: Env) {
  await requireAdmin(request, env);
  const result = await env.DB.prepare(`SELECT c.id, c.nomination_id AS nominationId, n.title AS nominationTitle,
    c.name, c.image_url AS imageUrl, c.twitch_user_id AS twitchUserId, c.twitch_login AS twitchLogin,
    c.enabled, c.sort_order AS sortOrder FROM candidates c JOIN nominations n ON n.id = c.nomination_id
    ORDER BY n.sort_order, c.sort_order`).all();
  return json({ candidates: result.results });
}

async function adminActions(request: Request, env: Env, url: URL) {
  await requireAdmin(request, env);
  const limit = integer(url.searchParams.get('limit'), 100, 1, 500);
  const result = await env.DB.prepare('SELECT * FROM moderation_actions ORDER BY created_at DESC LIMIT ?').bind(limit).all();
  return json({ actions: result.results });
}

async function moderateVote(request: Request, env: Env, voteId: number, action: 'exclude' | 'restore') {
  const admin = await requireAdmin(request, env); requireCsrf(request, admin); await rateLimit(env, admin.sessionHash, 'moderation', 120);
  const payload = await body<{ reason?: string; comment?: string }>(request);
  const vote = await env.DB.prepare('SELECT twitch_user_id, status FROM votes WHERE id = ?').bind(voteId).first<{ twitch_user_id: string; status: string }>();
  if (!vote) throw new ApiError(404, 'Голос не найден.', 'vote_not_found');
  const status = action === 'exclude' ? 'excluded' : 'valid';
  const timestamp = now();
  await env.DB.batch([
    env.DB.prepare('UPDATE votes SET status = ?, exclusion_reason = ?, exclusion_comment = ?, updated_at = ? WHERE id = ?').bind(status, action === 'exclude' ? payload.reason || 'Другая причина' : null, action === 'exclude' ? payload.comment || null : null, timestamp, voteId),
    env.DB.prepare('INSERT INTO moderation_actions (target_user_id, target_vote_id, action, reason, comment, created_at, admin_twitch_user_id) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(vote.twitch_user_id, voteId, action, payload.reason || null, payload.comment || null, timestamp, admin.twitchUserId),
    setSetting(env, 'results_dirty', '1', timestamp),
  ]);
  return json({ ok: true, status });
}

async function moderateUser(request: Request, env: Env, twitchUserId: string, action: 'exclude' | 'restore') {
  const admin = await requireAdmin(request, env); requireCsrf(request, admin); await rateLimit(env, admin.sessionHash, 'moderation', 120);
  const payload = await body<{ reason?: string; comment?: string }>(request);
  const exists = await env.DB.prepare('SELECT twitch_user_id FROM users WHERE twitch_user_id = ?').bind(twitchUserId).first();
  if (!exists) throw new ApiError(404, 'Пользователь не найден.', 'user_not_found');
  const status = action === 'exclude' ? 'excluded' : 'valid';
  const timestamp = now();
  await env.DB.batch([
    env.DB.prepare('UPDATE votes SET status = ?, exclusion_reason = ?, exclusion_comment = ?, updated_at = ? WHERE twitch_user_id = ?').bind(status, action === 'exclude' ? payload.reason || 'Другая причина' : null, action === 'exclude' ? payload.comment || null : null, timestamp, twitchUserId),
    env.DB.prepare('INSERT INTO moderation_actions (target_user_id, action, reason, comment, created_at, admin_twitch_user_id) VALUES (?, ?, ?, ?, ?, ?)').bind(twitchUserId, `${action}_all`, payload.reason || null, payload.comment || null, timestamp, admin.twitchUserId),
    setSetting(env, 'results_dirty', '1', timestamp),
  ]);
  return json({ ok: true, status });
}

async function updateVotingStatus(request: Request, env: Env) {
  const admin = await requireAdmin(request, env); requireCsrf(request, admin);
  const payload = await body<{ status?: string; startsAt?: string | null; endsAt?: string | null; timezone?: string; chatterFreeInput?: boolean }>(request);
  if (!['preparation', 'open', 'closed'].includes(payload.status ?? '')) throw new ApiError(400, 'Некорректный статус.', 'invalid_status');
  if (payload.startsAt && Number.isNaN(Date.parse(payload.startsAt))) throw new ApiError(400, 'Некорректная дата начала.', 'invalid_start_date');
  if (payload.endsAt && Number.isNaN(Date.parse(payload.endsAt))) throw new ApiError(400, 'Некорректная дата окончания.', 'invalid_end_date');
  if (payload.startsAt && payload.endsAt && payload.startsAt >= payload.endsAt) throw new ApiError(400, 'Дата окончания должна быть позже даты начала.', 'invalid_date_range');
  const timestamp = now();
  const statements = [setSetting(env, 'voting_status', payload.status!, timestamp)];
  if (payload.startsAt !== undefined) statements.push(setSetting(env, 'voting_starts_at', payload.startsAt ?? '', timestamp));
  if (payload.endsAt !== undefined) statements.push(setSetting(env, 'voting_ends_at', payload.endsAt ?? '', timestamp));
  if (payload.timezone) statements.push(setSetting(env, 'display_timezone', payload.timezone, timestamp));
  if (payload.chatterFreeInput !== undefined) statements.push(setSetting(env, 'chatter_free_input', payload.chatterFreeInput ? '1' : '0', timestamp));
  if (payload.status === 'open') statements.push(env.DB.prepare("UPDATE nominations SET voting_status = 'open' WHERE enabled = 1 AND voting_status = 'preparation'"));
  if (payload.status === 'closed') statements.push(env.DB.prepare("UPDATE nominations SET voting_status = 'closed' WHERE enabled = 1"));
  statements.push(env.DB.prepare('INSERT INTO moderation_actions (action, details, created_at, admin_twitch_user_id) VALUES (?, ?, ?, ?)').bind(`voting_${payload.status}`, JSON.stringify(payload), timestamp, admin.twitchUserId));
  await env.DB.batch(statements);
  return json({ ok: true, status: payload.status });
}

async function updateNomination(request: Request, env: Env, id: string) {
  const admin = await requireAdmin(request, env); requireCsrf(request, admin);
  const payload = await body<{ votingStatus?: string; enabled?: boolean; startsAt?: string | null; endsAt?: string | null }>(request);
  if (payload.votingStatus && !['preparation', 'open', 'closed'].includes(payload.votingStatus)) throw new ApiError(400, 'Некорректный статус номинации.', 'invalid_status');
  const existing = await env.DB.prepare('SELECT * FROM nominations WHERE id = ?').bind(id).first<Record<string, unknown>>();
  if (!existing) throw new ApiError(404, 'Номинация не найдена.', 'nomination_not_found');
  const timestamp = now();
  await env.DB.batch([
    env.DB.prepare('UPDATE nominations SET voting_status = ?, enabled = ?, starts_at = ?, ends_at = ? WHERE id = ?').bind(payload.votingStatus ?? existing.voting_status, payload.enabled === undefined ? existing.enabled : payload.enabled ? 1 : 0, payload.startsAt === undefined ? existing.starts_at : payload.startsAt, payload.endsAt === undefined ? existing.ends_at : payload.endsAt, id),
    env.DB.prepare('INSERT INTO moderation_actions (action, details, created_at, admin_twitch_user_id) VALUES (?, ?, ?, ?)').bind('nomination_update', JSON.stringify({ id, ...payload }), timestamp, admin.twitchUserId),
    setSetting(env, 'results_dirty', '1', timestamp),
  ]);
  return json({ ok: true });
}

async function createCandidate(request: Request, env: Env) {
  const admin = await requireAdmin(request, env); requireCsrf(request, admin);
  const payload = await body<{ nominationId?: string; name?: string; imageUrl?: string; twitchLogin?: string }>(request);
  const nominationId = payload.nominationId?.trim() ?? '';
  if (!await env.DB.prepare('SELECT id FROM nominations WHERE id = ?').bind(nominationId).first()) throw new ApiError(404, 'Номинация не найдена.', 'nomination_not_found');
  let name = payload.name?.trim() ?? '', imageUrl = payload.imageUrl?.trim() ?? '', twitchId: string | null = null, twitchLogin: string | null = null;
  if (payload.twitchLogin) {
    const twitch = await resolveTwitchLogin(payload.twitchLogin, env);
    name = twitch.display_name; imageUrl = twitch.profile_image_url; twitchId = twitch.id; twitchLogin = twitch.login;
  }
  if (!name) throw new ApiError(400, 'Укажите имя кандидата.', 'candidate_name_required');
  const order = (await env.DB.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS nextOrder FROM candidates WHERE nomination_id = ?').bind(nominationId).first<{ nextOrder: number }>())?.nextOrder ?? 1;
  const id = twitchId ? `${nominationId}-${twitchId}` : `${nominationId}-${randomToken(9)}`;
  const timestamp = now();
  try {
    await env.DB.batch([
      env.DB.prepare('INSERT INTO candidates (id, nomination_id, name, image_url, twitch_user_id, twitch_login, enabled, sort_order) VALUES (?, ?, ?, ?, ?, ?, 1, ?)').bind(id, nominationId, name, imageUrl, twitchId, twitchLogin, order),
      env.DB.prepare('INSERT INTO moderation_actions (action, details, created_at, admin_twitch_user_id) VALUES (?, ?, ?, ?)').bind('candidate_create', JSON.stringify({ id, nominationId, name, twitchId }), timestamp, admin.twitchUserId),
      setSetting(env, 'results_dirty', '1', timestamp),
    ]);
  } catch { throw new ApiError(409, 'Такой кандидат уже существует.', 'candidate_duplicate'); }
  return json({ ok: true, candidate: { id, nominationId, name, imageUrl, twitchUserId: twitchId, twitchLogin, sortOrder: order } }, 201);
}

async function updateCandidate(request: Request, env: Env, id: string) {
  const admin = await requireAdmin(request, env); requireCsrf(request, admin);
  const payload = await body<{ name?: string; imageUrl?: string; enabled?: boolean }>(request);
  const current = await env.DB.prepare('SELECT * FROM candidates WHERE id = ?').bind(id).first<Record<string, unknown>>();
  if (!current) throw new ApiError(404, 'Кандидат не найден.', 'candidate_not_found');
  const timestamp = now();
  await env.DB.batch([
    env.DB.prepare('UPDATE candidates SET name = ?, image_url = ?, enabled = ? WHERE id = ?').bind(payload.name?.trim() || current.name, payload.imageUrl === undefined ? current.image_url : payload.imageUrl.trim(), payload.enabled === undefined ? current.enabled : payload.enabled ? 1 : 0, id),
    env.DB.prepare('INSERT INTO moderation_actions (action, details, created_at, admin_twitch_user_id) VALUES (?, ?, ?, ?)').bind('candidate_update', JSON.stringify({ id, ...payload }), timestamp, admin.twitchUserId),
    setSetting(env, 'results_dirty', '1', timestamp),
  ]);
  return json({ ok: true });
}

async function finalizeResults(request: Request, env: Env) {
  const admin = await requireAdmin(request, env); requireCsrf(request, admin);
  if (await setting(env, 'voting_status') !== 'closed') throw new ApiError(409, 'Сначала закройте голосование.', 'voting_must_be_closed');
  const revision = ((await env.DB.prepare('SELECT COALESCE(MAX(revision), 0) AS revision FROM results_snapshots').first<{ revision: number }>())?.revision ?? 0) + 1;
  const snapshotId = `snapshot-${randomToken(12)}`;
  const timestamp = now();
  const lastVote = (await env.DB.prepare('SELECT MAX(updated_at) AS value FROM votes').first<{ value: string | null }>())?.value ?? null;
  await env.DB.batch([
    env.DB.prepare("INSERT INTO results_snapshots (id, created_at, revision, status, created_by, source_last_vote_at) VALUES (?, ?, ?, 'final', ?, ?)").bind(snapshotId, timestamp, revision, admin.twitchUserId, lastVote),
    env.DB.prepare(`
      INSERT INTO result_entries (snapshot_id, nomination_id, candidate_id, vote_count, rank, is_winner, is_tie, published)
      WITH counts AS (
        SELECT c.nomination_id, c.id AS candidate_id, COUNT(v.id) AS vote_count
        FROM candidates c LEFT JOIN votes v ON v.candidate_id = c.id AND v.status = 'valid'
        WHERE c.enabled = 1 GROUP BY c.nomination_id, c.id
      ), ranked AS (
        SELECT *, DENSE_RANK() OVER (PARTITION BY nomination_id ORDER BY vote_count DESC) AS position FROM counts
      ), leaders AS (
        SELECT nomination_id, SUM(CASE WHEN position = 1 AND vote_count > 0 THEN 1 ELSE 0 END) AS leader_count FROM ranked GROUP BY nomination_id
      )
      SELECT ?, r.nomination_id, r.candidate_id, r.vote_count, r.position,
        CASE WHEN r.position = 1 AND r.vote_count > 0 AND l.leader_count = 1 THEN 1 ELSE 0 END,
        CASE WHEN r.position = 1 AND r.vote_count > 0 AND l.leader_count > 1 THEN 1 ELSE 0 END, 0
      FROM ranked r JOIN leaders l ON l.nomination_id = r.nomination_id
    `).bind(snapshotId),
    setSetting(env, 'current_snapshot_id', snapshotId, timestamp),
    setSetting(env, 'results_dirty', '0', timestamp),
    env.DB.prepare('INSERT INTO moderation_actions (action, details, created_at, admin_twitch_user_id) VALUES (?, ?, ?, ?)').bind('results_finalize', JSON.stringify({ snapshotId, revision }), timestamp, admin.twitchUserId),
  ]);
  return json({ ok: true, snapshotId, revision, results: await snapshotResults(env, snapshotId) });
}

async function resolveTie(request: Request, env: Env) {
  const admin = await requireAdmin(request, env); requireCsrf(request, admin);
  const payload = await body<{ nominationId?: string; candidateId?: string; reason?: string }>(request);
  if (!payload.nominationId || !payload.candidateId || !payload.reason?.trim()) throw new ApiError(400, 'Укажите номинацию, победителя и основание.', 'tie_resolution_incomplete');
  const snapshotId = await setting(env, 'current_snapshot_id');
  const entry = await env.DB.prepare('SELECT is_tie FROM result_entries WHERE snapshot_id = ? AND nomination_id = ? AND candidate_id = ?').bind(snapshotId, payload.nominationId, payload.candidateId).first<{ is_tie: number }>();
  if (!entry?.is_tie) throw new ApiError(409, 'Выбранный кандидат не участвует в текущей ничьей.', 'not_a_tie_candidate');
  const timestamp = now();
  await env.DB.batch([
    env.DB.prepare('UPDATE result_entries SET is_winner = 0, is_tie = 0 WHERE snapshot_id = ? AND nomination_id = ?').bind(snapshotId, payload.nominationId),
    env.DB.prepare('UPDATE result_entries SET is_winner = 1 WHERE snapshot_id = ? AND nomination_id = ? AND candidate_id = ?').bind(snapshotId, payload.nominationId, payload.candidateId),
    env.DB.prepare(`INSERT INTO tie_resolutions (snapshot_id, nomination_id, candidate_id, reason, resolved_at, admin_twitch_user_id)
      VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(snapshot_id, nomination_id) DO UPDATE SET candidate_id = excluded.candidate_id, reason = excluded.reason, resolved_at = excluded.resolved_at, admin_twitch_user_id = excluded.admin_twitch_user_id`)
      .bind(snapshotId, payload.nominationId, payload.candidateId, payload.reason.trim(), timestamp, admin.twitchUserId),
    env.DB.prepare('INSERT INTO moderation_actions (action, details, created_at, admin_twitch_user_id) VALUES (?, ?, ?, ?)').bind('tie_resolve', JSON.stringify(payload), timestamp, admin.twitchUserId),
  ]);
  return json({ ok: true });
}

async function publishResults(request: Request, env: Env) {
  const admin = await requireAdmin(request, env); requireCsrf(request, admin);
  if (await setting(env, 'voting_status') !== 'closed') throw new ApiError(409, 'Публикация доступна после закрытия голосования.', 'voting_must_be_closed');
  if (await setting(env, 'results_dirty') === '1') throw new ApiError(409, 'Голоса изменились. Повторно зафиксируйте результаты.', 'results_dirty');
  const snapshotId = await setting(env, 'current_snapshot_id');
  if (!snapshotId) throw new ApiError(409, 'Сначала зафиксируйте результаты.', 'results_not_finalized');
  const ties = await env.DB.prepare('SELECT COUNT(*) AS count FROM result_entries WHERE snapshot_id = ? AND is_tie = 1').bind(snapshotId).first<{ count: number }>();
  if ((ties?.count ?? 0) > 0) throw new ApiError(409, 'Сначала разрешите все ничьи.', 'unresolved_ties');
  const payload = await body<{ nominationIds?: string[] }>(request);
  const ids = [...new Set((payload.nominationIds ?? []).filter(Boolean))];
  const timestamp = now();
  const statements = ids.length
    ? ids.map(id => env.DB.prepare('UPDATE result_entries SET published = 1 WHERE snapshot_id = ? AND nomination_id = ?').bind(snapshotId, id))
    : [env.DB.prepare('UPDATE result_entries SET published = 1 WHERE snapshot_id = ?').bind(snapshotId)];
  statements.push(env.DB.prepare("UPDATE results_snapshots SET status = 'published' WHERE id = ?").bind(snapshotId));
  statements.push(env.DB.prepare('INSERT INTO moderation_actions (action, details, created_at, admin_twitch_user_id) VALUES (?, ?, ?, ?)').bind('results_publish', JSON.stringify({ snapshotId, nominationIds: ids }), timestamp, admin.twitchUserId));
  await env.DB.batch(statements);
  return json({ ok: true, snapshotId, publishedNominationIds: ids });
}

async function snapshotResults(env: Env, snapshotId: string) {
  const rows = await env.DB.prepare(`SELECT e.nomination_id AS nominationId, n.title AS nominationTitle, e.candidate_id AS candidateId,
    c.name AS candidateName, c.image_url AS imageUrl, e.vote_count AS voteCount, e.rank, e.is_winner AS isWinner,
    e.is_tie AS isTie, e.published FROM result_entries e JOIN nominations n ON n.id = e.nomination_id
    JOIN candidates c ON c.id = e.candidate_id WHERE e.snapshot_id = ? ORDER BY n.sort_order, e.rank, c.sort_order`).bind(snapshotId).all();
  return rows.results;
}

async function adminResults(request: Request, env: Env) {
  await requireAdmin(request, env);
  const snapshotId = await setting(env, 'current_snapshot_id');
  const snapshot = snapshotId ? await env.DB.prepare('SELECT * FROM results_snapshots WHERE id = ?').bind(snapshotId).first() : null;
  const live = await env.DB.prepare(`SELECT n.id AS nominationId, n.title AS nominationTitle, c.id AS candidateId,
    c.name AS candidateName, c.image_url AS imageUrl, COUNT(v.id) AS voteCount,
    COUNT(v.id) * 100.0 / NULLIF(SUM(COUNT(v.id)) OVER (PARTITION BY n.id), 0) AS percent
    FROM nominations n JOIN candidates c ON c.nomination_id = n.id AND c.enabled = 1
    LEFT JOIN votes v ON v.candidate_id = c.id AND v.status = 'valid'
    WHERE n.enabled = 1 GROUP BY n.id, c.id ORDER BY n.sort_order, voteCount DESC, c.sort_order`).all();
  return json({ snapshot, dirty: await setting(env, 'results_dirty') === '1', entries: snapshotId ? await snapshotResults(env, snapshotId) : [], liveEntries: live.results });
}

async function ceremonyResults(request: Request, env: Env) {
  await requireAdmin(request, env);
  const snapshotId = await setting(env, 'current_snapshot_id');
  if (!snapshotId || await setting(env, 'results_dirty') === '1') return json({ ready: false, winners: [] });
  const result = await env.DB.prepare(`SELECT e.nomination_id AS nominationId, e.candidate_id AS candidateId,
    c.name, c.image_url AS imageUrl FROM result_entries e JOIN candidates c ON c.id = e.candidate_id
    WHERE e.snapshot_id = ? AND e.is_winner = 1 ORDER BY e.nomination_id`).bind(snapshotId).all();
  return json({ ready: true, snapshotId, winners: result.results });
}

async function publicResults(env: Env) {
  const snapshotId = await setting(env, 'current_snapshot_id');
  if (!snapshotId) return json({ published: false, nominations: [] });
  const rows = await env.DB.prepare(`SELECT e.nomination_id AS nominationId, n.title AS nominationTitle, n.description,
    e.candidate_id AS candidateId, c.name AS candidateName, c.image_url AS imageUrl,
    e.vote_count AS voteCount, e.rank, e.is_winner AS isWinner
    FROM result_entries e JOIN nominations n ON n.id = e.nomination_id JOIN candidates c ON c.id = e.candidate_id
    WHERE e.snapshot_id = ? AND e.published = 1 ORDER BY n.sort_order, e.rank, c.sort_order`).bind(snapshotId).all<Record<string, unknown>>();
  const nominations = [...new Set(rows.results.map(row => String(row.nominationId)))].map(id => {
    const entries = rows.results.filter(row => row.nominationId === id);
    const total = entries.reduce((sum, row) => sum + Number(row.voteCount), 0);
    return { id, title: entries[0].nominationTitle, description: entries[0].description, totalVotes: total, entries: entries.map(row => ({
      candidateId: row.candidateId, name: row.candidateName, imageUrl: row.imageUrl, votes: row.voteCount,
      percent: total ? Math.round(Number(row.voteCount) / total * 10_000) / 100 : 0, rank: row.rank, isWinner: row.isWinner === 1,
    })) };
  });
  return json({ published: nominations.length > 0, nominations });
}

function csvCell(value: unknown) { return `"${String(value ?? '').replace(/"/g, '""')}"`; }

async function exportCsv(request: Request, env: Env, url: URL) {
  await requireAdmin(request, env);
  const kind = url.searchParams.get('kind') ?? 'valid';
  let headers: string[], rows: unknown[][];
  if (kind === 'results') {
    const snapshotId = await setting(env, 'current_snapshot_id');
    const result = snapshotId ? await snapshotResults(env, snapshotId) as Record<string, unknown>[] : [];
    headers = ['Номинация', 'Кандидат', 'Голоса', 'Место', 'Победитель', 'Ничья', 'Опубликовано'];
    rows = result.map(row => [row.nominationTitle, row.candidateName, row.voteCount, row.rank, row.isWinner, row.isTie, row.published]);
  } else {
    const status = kind === 'excluded' ? 'excluded' : 'valid';
    const nomination = url.searchParams.get('nomination');
    const query = `SELECT n.title, c.name, u.login, u.twitch_user_id, u.twitch_created_at, v.created_at, v.updated_at, v.status
      FROM votes v JOIN nominations n ON n.id = v.nomination_id JOIN candidates c ON c.id = v.candidate_id JOIN users u ON u.twitch_user_id = v.twitch_user_id
      WHERE v.status = ? ${nomination ? 'AND v.nomination_id = ?' : ''} ORDER BY n.sort_order, v.updated_at`;
    const result = nomination ? await env.DB.prepare(query).bind(status, nomination).all<Record<string, unknown>>() : await env.DB.prepare(query).bind(status).all<Record<string, unknown>>();
    headers = ['Номинация', 'Кандидат', 'Twitch login', 'Twitch ID', 'Аккаунт создан', 'Первый голос', 'Изменён', 'Статус'];
    rows = result.results.map(row => [row.title, row.name, row.login, row.twitch_user_id, row.twitch_created_at, row.created_at, row.updated_at, row.status]);
  }
  const csv = '\uFEFF' + [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
  return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="camca63-${kind}.csv"`, 'Cache-Control': 'no-store' } });
}
