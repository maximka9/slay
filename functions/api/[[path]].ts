import { ApiError, type ApiContext, type Env } from '../_lib/types';
import { apiError, body, cookie, cookies, integer, json, redirect } from '../_lib/http';
import { OAUTH_COOKIE, SESSION_COOKIE, SESSION_SECONDS, getSession, now, randomToken, rateLimit, requireAdmin, requireCsrf, requireUser, secretHash } from '../_lib/security';
import { authorizeUrl, exchangeCode, resolveTwitchLogin } from '../_lib/twitch';
import { publicNominations, setSetting, setting } from '../_lib/data';
import { votingAvailability } from '../_lib/availability';
import { CUSTOM_AWARD_ID, canExposePublicResults, publicationPlan } from '../_lib/publication';

type JsonObject = Record<string, unknown>;

async function oauthActorHash(request: Request, env: Env) {
  const networkSignal = request.headers.get('CF-Connecting-IP') ?? request.headers.get('x-forwarded-for') ?? 'local';
  return secretHash(`oauth:${networkSignal}`, env.SESSION_SECRET);
}

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
  if (method === 'GET' && path === '/api/my-custom-award') return myCustomAward(request, env);
  if (method === 'PUT' && path === '/api/custom-award') return saveCustomAward(request, env);
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
    if (method === 'GET' && path === '/api/admin/custom-awards') return adminCustomAwards(request, env, url);
    if (method === 'POST' && path === '/api/admin/custom-awards/select') return selectCustomAward(request, env);
    const customAwardAction = path.match(/^\/api\/admin\/custom-awards\/([^/]+)$/);
    if (method === 'PATCH' && customAwardAction) return moderateCustomAward(request, env, decodeURIComponent(customAwardAction[1]));
    if (method === 'PATCH' && path.startsWith('/api/admin/nominations/')) return updateNomination(request, env, decodeURIComponent(path.slice('/api/admin/nominations/'.length)));
    if (method === 'POST' && path === '/api/admin/candidates') return createCandidate(request, env);
    if (method === 'PATCH' && path.startsWith('/api/admin/candidates/')) return updateCandidate(request, env, decodeURIComponent(path.slice('/api/admin/candidates/'.length)));
    if (method === 'POST' && path === '/api/admin/voting/status') return updateVotingStatus(request, env);
    if (method === 'POST' && path === '/api/admin/results/finalize') return finalizeResults(request, env);
    if (method === 'POST' && path === '/api/admin/results/resolve-tie') return resolveTie(request, env);
    if (method === 'POST' && path === '/api/admin/results/no-winner') return markNoWinner(request, env);
    if (method === 'POST' && path === '/api/admin/results/publish') return publishResults(request, env);
    const voteAction = path.match(/^\/api\/admin\/votes\/(\d+)\/(exclude|restore)$/);
    if (method === 'POST' && voteAction) return moderateVote(request, env, Number(voteAction[1]), voteAction[2] as 'exclude' | 'restore');
    const userAction = path.match(/^\/api\/admin\/users\/([^/]+)\/(exclude|restore)$/);
    if (method === 'POST' && userAction) return moderateUser(request, env, decodeURIComponent(userAction[1]), userAction[2] as 'exclude' | 'restore');
  }

  throw new ApiError(404, 'API-маршрут не найден.', 'not_found');
}

async function login(request: Request, env: Env, url: URL) {
  await rateLimit(env, await oauthActorHash(request, env), 'oauth_login', 10);
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
  await rateLimit(env, await oauthActorHash(request, env), 'oauth_callback', 20);
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

function customAwardText(value: unknown, field: string, maxLength: number) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new ApiError(400, `Заполните поле «${field}».`, 'custom_award_field_required');
  if ([...text].length > maxLength) throw new ApiError(400, `Поле «${field}» длиннее ${maxLength} символов.`, 'custom_award_field_too_long');
  if (/\p{Cc}/u.test(text)) throw new ApiError(400, `Поле «${field}» содержит недопустимые символы.`, 'custom_award_invalid_characters');
  return text;
}

async function myCustomAward(request: Request, env: Env) {
  const user = await requireUser(request, env);
  const proposal = await env.DB.prepare(`SELECT award_title AS awardTitle, recipient, status, updated_at AS updatedAt
    FROM custom_award_proposals WHERE twitch_user_id = ?`).bind(user.twitchUserId).first();
  return json({ proposal: proposal ?? null });
}

async function saveCustomAward(request: Request, env: Env) {
  const user = await requireUser(request, env);
  requireCsrf(request, user);
  await rateLimit(env, await secretHash(`custom-award:${user.twitchUserId}`, env.SESSION_SECRET), 'custom_award', 20);
  if (await setting(env, 'voting_status') !== 'open') throw new ApiError(409, 'Предложения принимаются только во время открытого голосования.', 'voting_unavailable');
  const nomination = await env.DB.prepare("SELECT enabled FROM nominations WHERE id = 'custom-award'").first<{ enabled: number }>();
  if (nomination?.enabled !== 1) throw new ApiError(409, 'Номинация отключена.', 'voting_unavailable');
  const payload = await body<{ awardTitle?: string; recipient?: string }>(request);
  const awardTitle = customAwardText(payload.awardTitle, 'Название награды', 80);
  const recipient = customAwardText(payload.recipient, 'Кому вручить', 120);
  const current = await env.DB.prepare(`SELECT award_title, recipient FROM custom_award_proposals
    WHERE twitch_user_id = ?`).bind(user.twitchUserId).first<{ award_title: string; recipient: string }>();
  if (current?.award_title === awardTitle && current.recipient === recipient) {
    return json({ ok: true, unchanged: true, proposal: { awardTitle, recipient } });
  }
  const timestamp = now();
  const statements = [];
  if (current) statements.push(env.DB.prepare(`INSERT INTO custom_award_proposal_history
    (twitch_user_id, previous_award_title, previous_recipient, new_award_title, new_recipient, changed_at)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(user.twitchUserId, current.award_title, current.recipient, awardTitle, recipient, timestamp));
  statements.push(env.DB.prepare(`INSERT INTO custom_award_proposals
    (twitch_user_id, award_title, recipient, status, created_at, updated_at)
    VALUES (?, ?, ?, 'valid', ?, ?)
    ON CONFLICT(twitch_user_id) DO UPDATE SET award_title = excluded.award_title,
      recipient = excluded.recipient, updated_at = excluded.updated_at`)
    .bind(user.twitchUserId, awardTitle, recipient, timestamp, timestamp));
  statements.push(setSetting(env, 'results_dirty', '1', timestamp));
  await env.DB.batch(statements);
  return json({ ok: true, unchanged: false, proposal: { awardTitle, recipient } });
}

async function castVote(request: Request, env: Env, nominationId: string) {
  const user = await requireUser(request, env);
  requireCsrf(request, user);
  await rateLimit(env, await secretHash(`twitch:${user.twitchUserId}`, env.SESSION_SECRET), 'vote', 20);
  if (nominationId === 'custom-award') throw new ApiError(400, 'Используйте форму собственной номинации.', 'invalid_vote_type');
  const payload = await body<{ candidateId?: string; twitchLogin?: string }>(request);
  const globalStatus = await setting(env, 'voting_status');
  const nomination = await env.DB.prepare('SELECT id, enabled FROM nominations WHERE id = ?').bind(nominationId).first<Record<string, string | number | null>>();
  if (!nomination) throw new ApiError(404, 'Номинация не найдена.', 'nomination_not_found');
  const chatterFreeInput = nominationId === 'chatter' && await setting(env, 'chatter_free_input') === '1';
  const availableCandidates = (await env.DB.prepare('SELECT COUNT(*) AS count FROM candidates WHERE nomination_id = ? AND enabled = 1').bind(nominationId).first<{ count: number }>())?.count ?? 0;
  const availability = votingAvailability({
    globalStatus,
    enabled: nomination.enabled === 1,
    ready: availableCandidates > 0 || chatterFreeInput,
    notReadyReason: 'В этой номинации пока нет доступных вариантов.',
  });
  if (!availability.canVote) throw new ApiError(409, availability.unavailableReason ?? 'Голосование недоступно.', 'voting_unavailable');
  let candidateId = payload.candidateId?.trim() ?? '';
  if (!candidateId && nominationId === 'chatter' && payload.twitchLogin && chatterFreeInput) {
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
  const timestamp = now();
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
    env.DB.prepare(`SELECT n.id, n.title, COUNT(v.id) AS votes,
      SUM(CASE WHEN v.status = 'valid' THEN 1 ELSE 0 END) AS validVotes
      FROM nominations n LEFT JOIN votes v ON v.nomination_id = n.id WHERE n.enabled = 1 GROUP BY n.id ORDER BY n.sort_order`).all(),
    env.DB.prepare('SELECT MAX(updated_at) AS lastVoteAt FROM votes').first(),
    env.DB.prepare("SELECT key, value FROM settings WHERE key = 'voting_status'").all<{ key: string; value: string }>(),
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
  const limit = integer(url.searchParams.get('limit'), 100, 1, 200);
  const page = integer(url.searchParams.get('page'), 1, 1, 100_000);
  const from = `FROM votes v JOIN users u ON u.twitch_user_id = v.twitch_user_id
    JOIN nominations n ON n.id = v.nomination_id JOIN candidates c ON c.id = v.candidate_id
    ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}`;
  const total = await env.DB.prepare(`SELECT COUNT(*) AS count ${from}`).bind(...bindings).first<{ count: number }>();
  const query = `SELECT v.id, v.nomination_id AS nominationId, n.title AS nominationTitle, v.candidate_id AS candidateId,
    c.name AS candidateName, v.twitch_user_id AS twitchUserId, u.login, u.display_name AS displayName,
    u.avatar_url AS avatarUrl, u.twitch_created_at AS twitchCreatedAt, u.first_seen_at AS firstSeenAt,
    v.created_at AS createdAt, v.updated_at AS updatedAt, v.status, v.exclusion_reason AS exclusionReason,
    v.exclusion_comment AS exclusionComment ${from} ORDER BY ${sort} LIMIT ? OFFSET ?`;
  const result = await env.DB.prepare(query).bind(...bindings, limit, (page - 1) * limit).all();
  return json({ votes: result.results, pagination: { page, limit, total: total?.count ?? 0, pages: Math.max(1, Math.ceil((total?.count ?? 0) / limit)) } });
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
  const limit = integer(url.searchParams.get('limit'), 25, 1, 50);
  const page = integer(url.searchParams.get('page'), 1, 1, 100_000);
  const total = await env.DB.prepare('SELECT COUNT(*) AS count FROM moderation_actions').first<{ count: number }>();
  const result = await env.DB.prepare(`SELECT a.*, admin.login AS adminLogin, admin.display_name AS adminDisplayName
    FROM moderation_actions a LEFT JOIN users admin ON admin.twitch_user_id = a.admin_twitch_user_id
    ORDER BY a.created_at DESC, a.id DESC LIMIT ? OFFSET ?`).bind(limit, (page - 1) * limit).all();
  return json({
    actions: result.results,
    pagination: { page, limit, total: total?.count ?? 0, pages: Math.max(1, Math.ceil((total?.count ?? 0) / limit)) },
  });
}

async function adminCustomAwards(request: Request, env: Env, url: URL) {
  await requireAdmin(request, env);
  const limit = integer(url.searchParams.get('limit'), 100, 1, 200);
  const page = integer(url.searchParams.get('page'), 1, 1, 100_000);
  const status = url.searchParams.get('status');
  const statusClause = status === 'valid' || status === 'excluded' ? 'WHERE p.status = ?' : '';
  const bindings = statusClause ? [status] : [];
  const total = await env.DB.prepare(`SELECT COUNT(*) AS count FROM custom_award_proposals p ${statusClause}`)
    .bind(...bindings).first<{ count: number }>();
  const proposals = await env.DB.prepare(`SELECT p.twitch_user_id AS twitchUserId, u.login, u.display_name AS displayName,
    u.avatar_url AS avatarUrl, p.award_title AS awardTitle, p.recipient, p.status,
    p.exclusion_reason AS exclusionReason, p.created_at AS createdAt, p.updated_at AS updatedAt,
    CASE WHEN s.twitch_user_id = p.twitch_user_id THEN 1 ELSE 0 END AS selected,
    s.award_title AS selectedAwardTitle, s.recipient AS selectedRecipient
    FROM custom_award_proposals p JOIN users u ON u.twitch_user_id = p.twitch_user_id
    LEFT JOIN custom_award_selection s ON s.id = 1 ${statusClause}
    ORDER BY p.updated_at DESC LIMIT ? OFFSET ?`).bind(...bindings, limit, (page - 1) * limit).all();
  return json({
    proposals: proposals.results,
    customAwardPublished: await setting(env, 'custom_award_published') === '1',
    pagination: { page, limit, total: total?.count ?? 0, pages: Math.max(1, Math.ceil((total?.count ?? 0) / limit)) },
  });
}

async function moderateCustomAward(request: Request, env: Env, twitchUserId: string) {
  const admin = await requireAdmin(request, env); requireCsrf(request, admin);
  const payload = await body<{ status?: 'valid' | 'excluded'; reason?: string }>(request);
  if (payload.status !== 'valid' && payload.status !== 'excluded') throw new ApiError(400, 'Некорректный статус.', 'invalid_status');
  const proposal = await env.DB.prepare('SELECT twitch_user_id FROM custom_award_proposals WHERE twitch_user_id = ?').bind(twitchUserId).first();
  if (!proposal) throw new ApiError(404, 'Предложение не найдено.', 'custom_award_not_found');
  const timestamp = now();
  await env.DB.batch([
    env.DB.prepare(`UPDATE custom_award_proposals SET status = ?, exclusion_reason = ?, moderated_at = ?, moderated_by = ?
      WHERE twitch_user_id = ?`).bind(payload.status, payload.status === 'excluded' ? payload.reason?.trim() || 'Исключено модератором' : null, timestamp, admin.twitchUserId, twitchUserId),
    env.DB.prepare('INSERT INTO moderation_actions (target_user_id, action, reason, created_at, admin_twitch_user_id) VALUES (?, ?, ?, ?, ?)')
      .bind(twitchUserId, `custom_award_${payload.status}`, payload.reason?.trim() || null, timestamp, admin.twitchUserId),
    setSetting(env, 'results_dirty', '1', timestamp),
  ]);
  return json({ ok: true, status: payload.status });
}

async function selectCustomAward(request: Request, env: Env) {
  const admin = await requireAdmin(request, env); requireCsrf(request, admin);
  const payload = await body<{ twitchUserId?: string; awardTitle?: string; recipient?: string }>(request);
  const twitchUserId = payload.twitchUserId?.trim() ?? '';
  const proposal = await env.DB.prepare(`SELECT award_title, recipient FROM custom_award_proposals
    WHERE twitch_user_id = ? AND status = 'valid'`).bind(twitchUserId).first<{ award_title: string; recipient: string }>();
  if (!proposal) throw new ApiError(404, 'Допустимое предложение не найдено.', 'custom_award_not_found');
  const awardTitle = customAwardText(payload.awardTitle ?? proposal.award_title, 'Название награды', 80);
  const recipient = customAwardText(payload.recipient ?? proposal.recipient, 'Кому вручить', 120);
  const timestamp = now();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO custom_award_selection (id, twitch_user_id, award_title, recipient, selected_at, selected_by)
      VALUES (1, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET twitch_user_id = excluded.twitch_user_id, award_title = excluded.award_title,
        recipient = excluded.recipient, selected_at = excluded.selected_at, selected_by = excluded.selected_by`)
      .bind(twitchUserId, awardTitle, recipient, timestamp, admin.twitchUserId),
    env.DB.prepare('INSERT INTO moderation_actions (target_user_id, action, details, created_at, admin_twitch_user_id) VALUES (?, ?, ?, ?, ?)')
      .bind(twitchUserId, 'custom_award_select', JSON.stringify({ awardTitle, recipient }), timestamp, admin.twitchUserId),
    setSetting(env, 'results_dirty', '1', timestamp),
  ]);
  return json({ ok: true, selection: { twitchUserId, awardTitle, recipient } });
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
  const payload = await body<{ status?: string }>(request);
  if (!['preparation', 'open', 'closed'].includes(payload.status ?? '')) throw new ApiError(400, 'Некорректный статус.', 'invalid_status');
  const previousStatus = await setting(env, 'voting_status');
  const timestamp = now();
  const statements = [
    setSetting(env, 'voting_status', payload.status!, timestamp),
    env.DB.prepare('UPDATE nominations SET voting_status = ? WHERE enabled = 1').bind(payload.status),
  ];
  const startsPrivateCycle = previousStatus !== payload.status && (payload.status === 'open' || payload.status === 'preparation');
  if (startsPrivateCycle) {
    const currentCycle = Number.parseInt(await setting(env, 'publication_cycle') || '0', 10);
    statements.push(setSetting(env, 'publication_cycle', String(Number.isFinite(currentCycle) ? currentCycle + 1 : 1), timestamp));
    statements.push(setSetting(env, 'custom_award_published', '0', timestamp));
  }
  statements.push(env.DB.prepare('INSERT INTO moderation_actions (action, details, created_at, admin_twitch_user_id) VALUES (?, ?, ?, ?)').bind(`voting_${payload.status}`, JSON.stringify({ ...payload, previousStatus, startsPrivateCycle }), timestamp, admin.twitchUserId));
  await env.DB.batch(statements);
  return json({ ok: true, status: payload.status });
}

async function updateNomination(request: Request, env: Env, id: string) {
  const admin = await requireAdmin(request, env); requireCsrf(request, admin);
  const payload = await body<{ enabled?: boolean }>(request);
  const existing = await env.DB.prepare('SELECT enabled FROM nominations WHERE id = ?').bind(id).first<Record<string, unknown>>();
  if (!existing) throw new ApiError(404, 'Номинация не найдена.', 'nomination_not_found');
  const timestamp = now();
  await env.DB.batch([
    env.DB.prepare('UPDATE nominations SET enabled = ? WHERE id = ?').bind(payload.enabled === undefined ? existing.enabled : payload.enabled ? 1 : 0, id),
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
        FROM candidates c JOIN nominations n ON n.id = c.nomination_id AND n.enabled = 1
        LEFT JOIN votes v ON v.candidate_id = c.id AND v.status = 'valid'
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
    setSetting(env, 'custom_award_published', '0', timestamp),
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
    env.DB.prepare('DELETE FROM ceremony_exceptions WHERE snapshot_id = ? AND nomination_id = ?').bind(snapshotId, payload.nominationId),
    env.DB.prepare('INSERT INTO moderation_actions (action, details, created_at, admin_twitch_user_id) VALUES (?, ?, ?, ?)').bind('tie_resolve', JSON.stringify(payload), timestamp, admin.twitchUserId),
  ]);
  return json({ ok: true });
}

async function markNoWinner(request: Request, env: Env) {
  const admin = await requireAdmin(request, env); requireCsrf(request, admin);
  const payload = await body<{ nominationId?: string; reason?: string }>(request);
  if (!payload.nominationId || !payload.reason?.trim()) throw new ApiError(400, 'Укажите номинацию и причину.', 'no_winner_reason_required');
  if (payload.nominationId === 'custom-award') throw new ApiError(400, 'Для пользовательской номинации выберите предложение.', 'custom_award_selection_required');
  const snapshotId = await setting(env, 'current_snapshot_id');
  if (!snapshotId || await setting(env, 'results_dirty') === '1') throw new ApiError(409, 'Сначала зафиксируйте актуальные результаты.', 'results_not_finalized');
  const nomination = await env.DB.prepare('SELECT id FROM nominations WHERE id = ? AND enabled = 1').bind(payload.nominationId).first();
  if (!nomination) throw new ApiError(404, 'Номинация не найдена.', 'nomination_not_found');
  const timestamp = now();
  await env.DB.batch([
    env.DB.prepare('UPDATE result_entries SET is_winner = 0, is_tie = 0 WHERE snapshot_id = ? AND nomination_id = ?').bind(snapshotId, payload.nominationId),
    env.DB.prepare(`INSERT INTO ceremony_exceptions (snapshot_id, nomination_id, status, reason, created_at, admin_twitch_user_id)
      VALUES (?, ?, 'no_winner', ?, ?, ?) ON CONFLICT(snapshot_id, nomination_id) DO UPDATE SET
      status = excluded.status, reason = excluded.reason, created_at = excluded.created_at, admin_twitch_user_id = excluded.admin_twitch_user_id`)
      .bind(snapshotId, payload.nominationId, payload.reason.trim(), timestamp, admin.twitchUserId),
    env.DB.prepare('INSERT INTO moderation_actions (action, details, created_at, admin_twitch_user_id) VALUES (?, ?, ?, ?)')
      .bind('results_no_winner', JSON.stringify(payload), timestamp, admin.twitchUserId),
  ]);
  return json({ ok: true });
}

type CeremonyProblem = { nominationId: string | null; nominationTitle: string | null; code: string; message: string };

async function ceremonyMediaAvailable(imageUrl: string, request: Request) {
  try {
    const target = new URL(imageUrl, request.url);
    const origin = new URL(request.url);
    const trustedRemote = target.protocol === 'https:' && target.hostname === 'static-cdn.jtvnw.net';
    if (target.origin !== origin.origin && !trustedRemote) return false;
    const response = await fetch(target, { method: 'HEAD', redirect: 'follow' });
    return response.ok;
  } catch { return false; }
}

async function ceremonyReadiness(env: Env, request: Request) {
  const problems: CeremonyProblem[] = [];
  const globalStatus = await setting(env, 'voting_status');
  if (globalStatus !== 'closed') problems.push({ nominationId: null, nominationTitle: null, code: 'voting_not_closed', message: 'Голосование должно быть закрыто.' });
  const snapshotId = await setting(env, 'current_snapshot_id');
  if (!snapshotId) {
    problems.push({ nominationId: null, nominationTitle: null, code: 'results_not_finalized', message: 'Итоговые результаты ещё не зафиксированы.' });
    return { ready: false, snapshotId: null, problems, winners: [], noWinners: [] };
  }
  if (await setting(env, 'results_dirty') === '1') problems.push({ nominationId: null, nominationTitle: null, code: 'results_dirty', message: 'Результаты изменились и требуют повторной фиксации.' });
  const result = await env.DB.prepare(`SELECT n.id AS nominationId, n.title AS nominationTitle,
    SUM(CASE WHEN e.is_winner = 1 THEN 1 ELSE 0 END) AS winnerCount,
    SUM(CASE WHEN e.is_tie = 1 THEN 1 ELSE 0 END) AS tieCount,
    MAX(CASE WHEN e.is_winner = 1 THEN e.candidate_id END) AS winnerCandidateId,
    MAX(CASE WHEN e.is_winner = 1 THEN c.image_url END) AS winnerImageUrl,
    MAX(CASE WHEN e.is_winner = 1 THEN c.enabled END) AS winnerEnabled,
    MAX(x.status) AS exceptionStatus
    FROM nominations n
    LEFT JOIN result_entries e ON e.nomination_id = n.id AND e.snapshot_id = ?
    LEFT JOIN candidates c ON c.id = e.candidate_id
    LEFT JOIN ceremony_exceptions x ON x.nomination_id = n.id AND x.snapshot_id = ?
    WHERE n.enabled = 1 AND n.id <> 'custom-award' GROUP BY n.id ORDER BY n.sort_order`).bind(snapshotId, snapshotId).all<Record<string, unknown>>();
  for (const row of result.results) {
    const nominationId = String(row.nominationId), nominationTitle = String(row.nominationTitle);
    if (Number(row.tieCount) > 0) {
      problems.push({ nominationId, nominationTitle, code: 'unresolved_tie', message: `${nominationTitle}: ничья не разрешена.` });
      continue;
    }
    if (row.exceptionStatus === 'no_winner') continue;
    if (Number(row.winnerCount) !== 1) {
      problems.push({ nominationId, nominationTitle, code: 'winner_missing', message: `${nominationTitle}: победитель не определён.` });
      continue;
    }
    if (!row.winnerCandidateId || Number(row.winnerEnabled) !== 1) problems.push({ nominationId, nominationTitle, code: 'winner_invalid', message: `${nominationTitle}: победитель отсутствует в актуальном списке кандидатов.` });
    else if (!String(row.winnerImageUrl ?? '').trim()) problems.push({ nominationId, nominationTitle, code: 'winner_image_missing', message: `${nominationTitle}: у победителя нет изображения.` });
    else if (!await ceremonyMediaAvailable(String(row.winnerImageUrl), request)) problems.push({ nominationId, nominationTitle, code: 'winner_image_unavailable', message: `${nominationTitle}: изображение победителя недоступно.` });
  }
  const customEnabled = await env.DB.prepare("SELECT enabled FROM nominations WHERE id = 'custom-award'").first<{ enabled: number }>();
  const customWinner = customEnabled?.enabled === 1 ? await env.DB.prepare(`SELECT s.twitch_user_id AS candidateId,
    s.award_title AS awardTitle, s.recipient AS name, u.login AS authorLogin
    FROM custom_award_selection s JOIN custom_award_proposals p ON p.twitch_user_id = s.twitch_user_id AND p.status = 'valid'
    JOIN users u ON u.twitch_user_id = s.twitch_user_id WHERE s.id = 1`).first<Record<string, unknown>>() : null;
  if (customEnabled?.enabled === 1 && !customWinner) {
    problems.push({ nominationId: 'custom-award', nominationTitle: 'Ваша номинация', code: 'custom_award_selection_missing', message: 'Ваша номинация: выберите предложение для вручения.' });
  }
  const winners = problems.length ? [] : (await env.DB.prepare(`SELECT e.nomination_id AS nominationId, e.candidate_id AS candidateId,
    c.name, c.image_url AS imageUrl FROM result_entries e JOIN candidates c ON c.id = e.candidate_id
    WHERE e.snapshot_id = ? AND e.is_winner = 1 ORDER BY e.nomination_id`).bind(snapshotId).all()).results;
  if (!problems.length && customWinner) winners.push({ nominationId: 'custom-award', imageUrl: '', ...customWinner });
  const noWinners = problems.length ? [] : (await env.DB.prepare(`SELECT x.nomination_id AS nominationId, n.title, x.reason
    FROM ceremony_exceptions x JOIN nominations n ON n.id = x.nomination_id
    WHERE x.snapshot_id = ? AND x.status = 'no_winner' ORDER BY n.sort_order`).bind(snapshotId).all()).results;
  return { ready: problems.length === 0, snapshotId, problems, winners, noWinners };
}

async function publishResults(request: Request, env: Env) {
  const admin = await requireAdmin(request, env); requireCsrf(request, admin);
  if (await setting(env, 'voting_status') !== 'closed') throw new ApiError(409, 'Публикация доступна после закрытия голосования.', 'voting_must_be_closed');
  if (await setting(env, 'results_dirty') === '1') throw new ApiError(409, 'Голоса изменились. Повторно зафиксируйте результаты.', 'results_dirty');
  const snapshotId = await setting(env, 'current_snapshot_id');
  if (!snapshotId) throw new ApiError(409, 'Сначала зафиксируйте результаты.', 'results_not_finalized');
  const readiness = await ceremonyReadiness(env, request);
  if (!readiness.ready) throw new ApiError(409, readiness.problems.map(problem => problem.message).join(' '), 'ceremony_not_ready');
  const payload = await body<{ nominationIds?: string[] }>(request);
  const available = await env.DB.prepare(`SELECT DISTINCT e.nomination_id AS nominationId
    FROM result_entries e JOIN nominations n ON n.id = e.nomination_id
    WHERE e.snapshot_id = ? AND n.enabled = 1 AND n.id <> ? ORDER BY n.sort_order`)
    .bind(snapshotId, CUSTOM_AWARD_ID).all<{ nominationId: string }>();
  const availableIds = available.results.map(row => row.nominationId);
  const plan = publicationPlan(payload.nominationIds, availableIds);
  const unknownIds = plan.standardNominationIds.filter(id => !availableIds.includes(id));
  if (unknownIds.length) throw new ApiError(400, `Неизвестные номинации: ${unknownIds.join(', ')}.`, 'invalid_nomination');
  const publicationCycle = Number.parseInt(await setting(env, 'publication_cycle') || '', 10);
  if (!Number.isFinite(publicationCycle)) throw new ApiError(409, 'Состояние публикации не инициализировано.', 'publication_state_missing');
  const timestamp = now();
  const statements = plan.standardNominationIds.flatMap(id => [
    env.DB.prepare('UPDATE result_entries SET published = 1 WHERE snapshot_id = ? AND nomination_id = ?').bind(snapshotId, id),
    env.DB.prepare(`INSERT INTO result_publications (snapshot_id, nomination_id, publication_cycle, published_at, published_by)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT(snapshot_id, nomination_id, publication_cycle)
      DO UPDATE SET published_at = excluded.published_at, published_by = excluded.published_by`)
      .bind(snapshotId, id, publicationCycle, timestamp, admin.twitchUserId),
  ]);
  if (plan.publishCustomAward) {
    statements.push(setSetting(env, 'custom_award_published', '1', timestamp));
    statements.push(env.DB.prepare(`INSERT INTO result_publications (snapshot_id, nomination_id, publication_cycle, published_at, published_by)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT(snapshot_id, nomination_id, publication_cycle)
      DO UPDATE SET published_at = excluded.published_at, published_by = excluded.published_by`)
      .bind(snapshotId, CUSTOM_AWARD_ID, publicationCycle, timestamp, admin.twitchUserId));
  }
  statements.push(env.DB.prepare("UPDATE results_snapshots SET status = 'published' WHERE id = ?").bind(snapshotId));
  const publishedNominationIds = [...plan.standardNominationIds, ...(plan.publishCustomAward ? [CUSTOM_AWARD_ID] : [])];
  statements.push(env.DB.prepare('INSERT INTO moderation_actions (action, details, created_at, admin_twitch_user_id) VALUES (?, ?, ?, ?)').bind('results_publish', JSON.stringify({ snapshotId, publicationCycle, nominationIds: publishedNominationIds, explicitSelection: plan.explicitSelection }), timestamp, admin.twitchUserId));
  await env.DB.batch(statements);
  return json({ ok: true, snapshotId, publishedNominationIds, customAwardPublished: plan.publishCustomAward });
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
  const customAward = await env.DB.prepare(`SELECT s.award_title AS awardTitle, s.recipient, u.login AS authorLogin
    FROM custom_award_selection s JOIN custom_award_proposals p ON p.twitch_user_id = s.twitch_user_id AND p.status = 'valid'
    JOIN users u ON u.twitch_user_id = s.twitch_user_id WHERE s.id = 1`).first();
  const live = await env.DB.prepare(`SELECT n.id AS nominationId, n.title AS nominationTitle, c.id AS candidateId,
    c.name AS candidateName, c.image_url AS imageUrl, COUNT(v.id) AS voteCount,
    COUNT(v.id) * 100.0 / NULLIF(SUM(COUNT(v.id)) OVER (PARTITION BY n.id), 0) AS percent
    FROM nominations n JOIN candidates c ON c.nomination_id = n.id AND c.enabled = 1
    LEFT JOIN votes v ON v.candidate_id = c.id AND v.status = 'valid'
    WHERE n.enabled = 1 GROUP BY n.id, c.id ORDER BY n.sort_order, voteCount DESC, c.sort_order`).all();
  return json({ snapshot, dirty: await setting(env, 'results_dirty') === '1', entries: snapshotId ? await snapshotResults(env, snapshotId) : [], liveEntries: live.results, customAward, readiness: await ceremonyReadiness(env, request) });
}

async function ceremonyResults(request: Request, env: Env) {
  await requireAdmin(request, env);
  return json(await ceremonyReadiness(env, request));
}

async function publicResults(env: Env) {
  const votingStatus = await setting(env, 'voting_status');
  const resultsDirty = await setting(env, 'results_dirty') === '1';
  if (!canExposePublicResults(votingStatus, resultsDirty)) return json({ published: false, nominations: [] });
  const snapshotId = await setting(env, 'current_snapshot_id');
  const publicationCycle = Number.parseInt(await setting(env, 'publication_cycle') || '', 10);
  if (!snapshotId || !Number.isFinite(publicationCycle)) return json({ published: false, nominations: [] });
  const rows = await env.DB.prepare(`SELECT e.nomination_id AS nominationId, n.title AS nominationTitle, n.description,
    e.candidate_id AS candidateId, c.name AS candidateName, c.image_url AS imageUrl,
    e.vote_count AS voteCount, e.rank, e.is_winner AS isWinner
    FROM result_entries e JOIN nominations n ON n.id = e.nomination_id JOIN candidates c ON c.id = e.candidate_id
    JOIN result_publications p ON p.snapshot_id = e.snapshot_id AND p.nomination_id = e.nomination_id
      AND p.publication_cycle = ?
    WHERE e.snapshot_id = ? ORDER BY n.sort_order, e.rank, c.sort_order`).bind(publicationCycle, snapshotId).all<Record<string, unknown>>();
  const nominations: Array<Record<string, unknown>> = [...new Set(rows.results.map(row => String(row.nominationId)))].map(id => {
    const entries = rows.results.filter(row => row.nominationId === id);
    const total = entries.reduce((sum, row) => sum + Number(row.voteCount), 0);
    return { id, title: entries[0].nominationTitle, description: entries[0].description, totalVotes: total, entries: entries.map(row => ({
      candidateId: row.candidateId, name: row.candidateName, imageUrl: row.imageUrl, votes: row.voteCount,
      percent: total ? Math.round(Number(row.voteCount) / total * 10_000) / 100 : 0, rank: row.rank, isWinner: row.isWinner === 1,
    })) };
  });
  const customAwardPublished = await setting(env, 'custom_award_published') === '1'
    && Boolean(await env.DB.prepare(`SELECT 1 FROM result_publications
      WHERE snapshot_id = ? AND nomination_id = ? AND publication_cycle = ?`)
      .bind(snapshotId, CUSTOM_AWARD_ID, publicationCycle).first());
  if (customAwardPublished) {
    const custom = await env.DB.prepare(`SELECT s.twitch_user_id AS candidateId, s.award_title AS awardTitle,
      s.recipient AS candidateName, u.login AS authorLogin FROM custom_award_selection s
      JOIN custom_award_proposals p ON p.twitch_user_id = s.twitch_user_id AND p.status = 'valid'
      JOIN users u ON u.twitch_user_id = s.twitch_user_id WHERE s.id = 1`).first<Record<string, unknown>>();
    if (custom) nominations.push({
      id: 'custom-award', title: 'Ваша номинация', description: custom.awardTitle, totalVotes: 0,
      entries: [{ candidateId: custom.candidateId, name: custom.candidateName, imageUrl: '', votes: 0, percent: 0, rank: 1, isWinner: true, awardTitle: custom.awardTitle, authorLogin: custom.authorLogin }],
    });
  }
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
