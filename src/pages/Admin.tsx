import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, Check, Download, LockKeyhole, Plus, RefreshCcw, Search, Shield, Users, Vote } from 'lucide-react';
import { Layout } from '../components/Layout';
import { useAuth } from '../components/AuthProvider';
import { api, mutation, type VotingData } from '../lib/api';
import { utcToZonedInput, zonedInputToUtc } from '../lib/timezone';

type Overview = {
  counts: { users: number; validVotes: number; excludedVotes: number };
  recent: { recentUsers: number }; lastVote: { lastVoteAt: string | null };
  nominations: { id: string; title: string; votingStatus: string; votes: number; validVotes: number }[];
  settings: Record<string, string>;
};
type AdminVote = {
  id: number; nominationId: string; nominationTitle: string; candidateId: string; candidateName: string;
  twitchUserId: string; login: string; displayName: string; avatarUrl: string; twitchCreatedAt: string;
  firstSeenAt: string; createdAt: string; updatedAt: string; status: 'valid' | 'excluded'; exclusionReason?: string;
};
type ResultEntry = { nominationId: string; nominationTitle: string; candidateId: string; candidateName: string; imageUrl: string; voteCount: number; rank: number; isWinner: number; isTie: number; published: number };
type LiveEntry = Pick<ResultEntry, 'nominationId' | 'nominationTitle' | 'candidateId' | 'candidateName' | 'imageUrl' | 'voteCount'> & { percent: number | null };
type CeremonyProblem = { nominationId: string | null; nominationTitle: string | null; code: string; message: string };
type AdminResults = { snapshot: { id: string; revision: number; status: string; created_at: string } | null; dirty: boolean; entries: ResultEntry[]; liveEntries: LiveEntry[]; readiness: { ready: boolean; problems: CeremonyProblem[] } };
type Pagination = { page: number; limit: number; total: number; pages: number };
type AdminCandidate = { id: string; nominationId: string; nominationTitle: string; name: string; imageUrl: string; twitchLogin: string | null; enabled: number; sortOrder: number };
type AuditAction = { id: number; action: string; target_user_id: string | null; reason: string | null; comment: string | null; details: string | null; created_at: string; admin_twitch_user_id: string };

export function Admin() {
  const auth = useAuth();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [votes, setVotes] = useState<AdminVote[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 100, total: 0, pages: 1 });
  const [page, setPage] = useState(1);
  const [results, setResults] = useState<AdminResults | null>(null);
  const [publicData, setPublicData] = useState<VotingData | null>(null);
  const [candidates, setCandidates] = useState<AdminCandidate[]>([]);
  const [actions, setActions] = useState<AuditAction[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [nominationFilter, setNominationFilter] = useState('');
  const [newAccounts, setNewAccounts] = useState(false);
  const [sort, setSort] = useState('latest');
  const [candidateLogin, setCandidateLogin] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const csrf = auth.csrfToken ?? '';
  const load = useCallback(async () => {
    if (!auth.isAdmin) return;
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search); if (statusFilter) params.set('status', statusFilter); if (nominationFilter) params.set('nomination', nominationFilter); if (newAccounts) params.set('newAccounts', '1'); if (sort !== 'latest') params.set('sort', sort); params.set('page', String(page));
      const [nextOverview, nextVotes, nextResults, nextPublic, nextCandidates, nextActions] = await Promise.all([
        api<Overview>('/api/admin/overview'), api<{ votes: AdminVote[]; pagination: Pagination }>(`/api/admin/votes?${params}`),
        api<AdminResults>('/api/admin/results'), api<VotingData>('/api/nominations'),
        api<{ candidates: AdminCandidate[] }>('/api/admin/candidates'), api<{ actions: AuditAction[] }>('/api/admin/actions?limit=30'),
      ]);
      setOverview(nextOverview); setVotes(nextVotes.votes); setPagination(nextVotes.pagination); setResults(nextResults); setPublicData(nextPublic); setCandidates(nextCandidates.candidates); setActions(nextActions.actions); setError('');
    } catch (err) { setError(err instanceof Error ? err.message : 'Не удалось загрузить админ-панель.'); }
  }, [auth.isAdmin, nominationFilter, newAccounts, page, search, sort, statusFilter]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(1); }, [nominationFilter, newAccounts, search, sort, statusFilter]);

  const act = async (name: string, operation: () => Promise<unknown>, success: string) => {
    setBusy(name); setError(''); setNotice('');
    try { await operation(); setNotice(success); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Операция не выполнена.'); }
    finally { setBusy(''); }
  };
  const changeStatus = (status: string) => {
    const label = status === 'open' ? 'открыть' : status === 'closed' ? 'закрыть' : 'перевести в подготовку';
    if (!window.confirm(`Действительно ${label} голосование?`)) return;
    void act(`status-${status}`, () => mutation('/api/admin/voting/status', 'POST', csrf, { status }), `Статус голосования изменён: ${status}.`);
  };
  const changeAllCategories = (categoryAction: 'open_all' | 'close_all') => {
    const label = categoryAction === 'open_all' ? 'открыть все доступные номинации' : 'закрыть все номинации';
    if (!window.confirm(`Действительно ${label}? Индивидуальные статусы категорий будут изменены.`)) return;
    void act(`categories-${categoryAction}`, () => mutation('/api/admin/voting/status', 'POST', csrf, { status: overview?.settings.voting_status, categoryAction }), categoryAction === 'open_all' ? 'Все доступные номинации открыты.' : 'Все номинации закрыты.');
  };
  const moderate = (vote: AdminVote, action: 'exclude' | 'restore') => {
    const reason = action === 'exclude' ? window.prompt('Причина исключения:', 'Подозрительная активность') : 'Восстановлено администратором';
    if (reason === null) return;
    const comment = action === 'exclude' ? window.prompt('Комментарий (необязательно):', '') ?? '' : '';
    void act(`vote-${vote.id}`, () => mutation(`/api/admin/votes/${vote.id}/${action}`, 'POST', csrf, { reason, comment }), action === 'exclude' ? 'Голос исключён.' : 'Голос восстановлен.');
  };
  const moderateAll = (vote: AdminVote, action: 'exclude' | 'restore') => {
    const reason = action === 'exclude' ? window.prompt('Причина исключения всех голосов:', 'Подозрительная активность') : 'Восстановлено администратором';
    if (reason === null) return;
    const comment = action === 'exclude' ? window.prompt('Комментарий (необязательно):', '') ?? '' : '';
    void act(`user-${vote.twitchUserId}`, () => mutation(`/api/admin/users/${encodeURIComponent(vote.twitchUserId)}/${action}`, 'POST', csrf, { reason, comment }), action === 'exclude' ? 'Все голоса пользователя исключены.' : 'Все голоса пользователя восстановлены.');
  };
  const groupedResults = useMemo(() => {
    const groups = new Map<string, ResultEntry[]>();
    for (const entry of results?.entries ?? []) groups.set(entry.nominationId, [...(groups.get(entry.nominationId) ?? []), entry]);
    return [...groups.entries()];
  }, [results]);
  const groupedLive = useMemo(() => {
    const groups = new Map<string, LiveEntry[]>();
    for (const entry of results?.liveEntries ?? []) groups.set(entry.nominationId, [...(groups.get(entry.nominationId) ?? []), entry]);
    return [...groups.entries()];
  }, [results]);
  const candidateChangeNeedsWarning = overview ? overview.settings.voting_status !== 'preparation' || (overview.counts.validVotes ?? 0) + (overview.counts.excludedVotes ?? 0) > 0 : false;

  if (auth.loading) return <Layout><main className="admin-gate"><Shield size={42} /><h1>ПРОВЕРЯЕМ <em>ДОСТУП</em></h1></main></Layout>;
  if (!auth.authenticated) return <Layout><main className="admin-gate"><LockKeyhole size={46} /><span className="eyebrow">ЗАКРЫТАЯ ЗОНА</span><h1>АДМИН-ПАНЕЛЬ</h1><p>Войдите через Twitch. Доступ получит только аккаунт с ID из `ADMIN_TWITCH_USER_ID`.</p><a className="button primary" href={auth.loginUrl('/admin')}>Войти через Twitch</a></main></Layout>;
  if (!auth.isAdmin) return <Layout><main className="admin-gate"><AlertTriangle size={46} /><h1>ДОСТУП <em>ЗАПРЕЩЁН</em></h1><p>Аккаунт @{auth.user?.login} не является администратором премии.</p></main></Layout>;
  if (!overview || !publicData) return <Layout><main className="admin-gate"><h1>ЗАГРУЖАЕМ <em>ДАННЫЕ</em></h1>{error && <p className="form-error">{error}</p>}</main></Layout>;
  return <Layout><main className="admin-page">
    <header className="admin-heading"><div><span className="eyebrow"><Shield size={16} /> CAMCA63 / CONTROL ROOM</span><h1>АДМИН-ПАНЕЛЬ</h1><p>Голосование, ручная проверка и закрытые результаты.</p></div><div className={`admin-live ${overview.settings.voting_status}`}><span className="status-dot" />{overview.settings.voting_status === 'open' ? 'ГОЛОСОВАНИЕ ОТКРЫТО' : overview.settings.voting_status === 'closed' ? 'ГОЛОСОВАНИЕ ЗАКРЫТО' : 'ПОДГОТОВКА'}</div></header>
    {(error || notice) && <div className={`vote-message ${error ? 'error' : ''}`} role={error ? 'alert' : 'status'}>{error || notice}</div>}
    <section className="admin-stats"><article><Users /><span>Уникальных зрителей</span><b>{overview.counts.users ?? 0}</b></article><article><Vote /><span>Учтённых голосов</span><b>{overview.counts.validVotes ?? 0}</b></article><article><AlertTriangle /><span>Исключённых</span><b>{overview.counts.excludedVotes ?? 0}</b></article><article><BarChart3 /><span>За последние 24 часа</span><b>{overview.recent.recentUsers ?? 0}</b></article><article><Check /><span>Фактически открыто</span><b>{publicData.nominations.filter(nomination => nomination.canVote).length} / {publicData.nominations.length}</b></article><article><RefreshCcw /><span>Последний голос</span><b className="admin-date">{overview.lastVote.lastVoteAt ? new Date(overview.lastVote.lastVoteAt).toLocaleString('ru-RU') : '—'}</b></article></section>
    <section className="admin-section"><div className="admin-section-title"><div><span className="eyebrow">УПРАВЛЕНИЕ</span><h2>СТАТУС ГОЛОСОВАНИЯ</h2><p>Глобальный статус не перезаписывает индивидуально закрытые категории.</p></div><div className="admin-actions"><button onClick={() => changeStatus('open')} disabled={busy !== ''}>Открыть голосование</button><button onClick={() => changeStatus('closed')} disabled={busy !== ''}>Закрыть голосование</button><button onClick={() => changeStatus('preparation')} disabled={busy !== ''}>Вернуть в подготовку</button><button onClick={() => changeAllCategories('open_all')} disabled={busy !== ''}>Открыть все номинации</button><button onClick={() => changeAllCategories('close_all')} disabled={busy !== ''}>Закрыть все номинации</button></div></div>
      <div className="nomination-admin-grid">{publicData.nominations.map(nomination => <article key={nomination.id}><div><b>{nomination.title}</b><span>{overview.nominations.find(item => item.id === nomination.id)?.validVotes ?? 0} голосов</span></div><select value={nomination.votingStatus} onChange={event => void act(`nom-${nomination.id}`, () => mutation(`/api/admin/nominations/${nomination.id}`, 'PATCH', csrf, { votingStatus: event.target.value }), `Статус «${nomination.title}» обновлён.`)}><option value="preparation">Подготовка</option><option value="open">Открыта</option><option value="closed">Закрыта</option></select></article>)}</div>
      <form className="admin-settings" key={`${overview.settings.voting_starts_at}-${overview.settings.voting_ends_at}-${overview.settings.display_timezone}`} onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); const timezone = String(form.get('timezone') || 'Europe/Moscow'); void act('schedule', () => mutation('/api/admin/voting/status', 'POST', csrf, { status: overview.settings.voting_status, startsAt: zonedInputToUtc(form.get('startsAt'), timezone), endsAt: zonedInputToUtc(form.get('endsAt'), timezone), timezone, chatterFreeInput: form.get('chatterFreeInput') === 'on' }), 'Расписание и режимы сохранены.'); }}>
        <label>Начало ({overview.settings.display_timezone || 'Europe/Moscow'})<input name="startsAt" type="datetime-local" defaultValue={utcToZonedInput(overview.settings.voting_starts_at, overview.settings.display_timezone || 'Europe/Moscow')} /></label>
        <label>Окончание ({overview.settings.display_timezone || 'Europe/Moscow'})<input name="endsAt" type="datetime-local" defaultValue={utcToZonedInput(overview.settings.voting_ends_at, overview.settings.display_timezone || 'Europe/Moscow')} /></label>
        <label>Часовой пояс<input name="timezone" defaultValue={overview.settings.display_timezone || 'Europe/Moscow'} /></label>
        <label className="check-filter"><input name="chatterFreeInput" type="checkbox" defaultChecked={overview.settings.chatter_free_input === '1'} /> Свободный ввод «Чаттера года»</label>
        <button className="button" disabled={busy !== ''}>Сохранить настройки</button>
      </form>
    </section>
    <section className="admin-section"><div className="admin-section-title"><div><span className="eyebrow">ЧАТТЕР ГОДА</span><h2>УПРАВЛЕНИЕ КАНДИДАТАМИ</h2><p>Изменение состава после начала голосования делает зафиксированные результаты неактуальными.</p></div></div><form className="admin-inline-form" onSubmit={event => { event.preventDefault(); if (candidateChangeNeedsWarning && !window.confirm('Голосование уже начиналось или в базе есть голоса. Добавить кандидата и пометить результаты неактуальными?')) return; void act('candidate', () => mutation('/api/admin/candidates', 'POST', csrf, { nominationId: 'chatter', twitchLogin: candidateLogin }), 'Кандидат Twitch добавлен.').then(() => setCandidateLogin('')); }}><input value={candidateLogin} onChange={event => setCandidateLogin(event.target.value)} placeholder="Twitch login" required /><button className="button primary" disabled={busy === 'candidate'}><Plus size={17} /> Найти и добавить</button></form><div className="candidate-admin-list">{candidates.filter(candidate => candidate.nominationId === 'chatter').map(candidate => <article key={candidate.id}><span><b>{candidate.name}</b><small>@{candidate.twitchLogin}</small></span><button onClick={() => { if (candidateChangeNeedsWarning && !window.confirm('В базе уже есть голоса или голосование началось. Изменение кандидата сделает текущий снимок результатов неактуальным. Продолжить?')) return; void act(`candidate-${candidate.id}`, () => mutation(`/api/admin/candidates/${encodeURIComponent(candidate.id)}`, 'PATCH', csrf, { enabled: candidate.enabled !== 1 }), candidate.enabled === 1 ? 'Кандидат скрыт.' : 'Кандидат восстановлен.'); }}>{candidate.enabled === 1 ? 'Скрыть' : 'Восстановить'}</button></article>)}</div></section>
    <section className="admin-section"><div className="admin-section-title"><div><span className="eyebrow">ТЕКУЩИЕ ДАННЫЕ</span><h2>ПРОМЕЖУТОЧНЫЕ РЕЗУЛЬТАТЫ</h2><p>Доступны только администратору и пересчитываются по действительным голосам.</p></div></div><div className="admin-results">{groupedLive.map(([id, entries]) => { const maximum = Math.max(1, ...entries.map(entry => entry.voteCount)); return <article key={id}><h3>{entries[0].nominationTitle}</h3>{entries.map(entry => <div className="result-bar" key={entry.candidateId}><span>{entry.candidateName}</span><i><b style={{ width: `${entry.voteCount / maximum * 100}%` }} /></i><strong>{entry.voteCount} · {Number(entry.percent ?? 0).toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%</strong></div>)}<a className="csv-inline" href={`/api/admin/export?kind=valid&nomination=${encodeURIComponent(id)}`}><Download size={14} /> CSV номинации</a></article>; })}</div></section>
    <section className="admin-section"><div className="admin-section-title"><div><span className="eyebrow">РУЧНАЯ ПРОВЕРКА</span><h2>ГОЛОСА ЗРИТЕЛЕЙ</h2></div><div className="admin-actions"><a href="/api/admin/export?kind=valid"><Download size={16} /> Учтённые CSV</a><a href="/api/admin/export?kind=excluded"><Download size={16} /> Исключённые CSV</a></div></div>
      <div className="admin-filters"><label><Search size={16} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Ник или Twitch ID" /></label><select value={nominationFilter} onChange={event => setNominationFilter(event.target.value)}><option value="">Все номинации</option>{publicData.nominations.map(nomination => <option value={nomination.id} key={nomination.id}>{nomination.title}</option>)}</select><select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="">Все статусы</option><option value="valid">Учтён</option><option value="excluded">Исключён</option></select><select value={sort} onChange={event => setSort(event.target.value)}><option value="latest">По изменению голоса</option><option value="account">По дате аккаунта</option><option value="first">По первому участию</option></select><label className="check-filter"><input type="checkbox" checked={newAccounts} onChange={event => setNewAccounts(event.target.checked)} /> Новые аккаунты</label><button onClick={() => void load()}><RefreshCcw size={16} /> Обновить</button></div>
      <div className="admin-table-wrap"><table><thead><tr><th>Аккаунт</th><th>Создан</th><th>Первое участие</th><th>Номинация</th><th>Выбор</th><th>Изменён</th><th>Статус</th><th /></tr></thead><tbody>{votes.map(vote => <tr key={vote.id} className={vote.status}><td><div className="voter"><img src={vote.avatarUrl} alt="" /><span><a href={`https://twitch.tv/${vote.login}`} target="_blank" rel="noreferrer">{vote.displayName}</a><small>{vote.twitchUserId}</small></span></div></td><td>{new Date(vote.twitchCreatedAt).toLocaleDateString('ru-RU')}</td><td>{new Date(vote.firstSeenAt).toLocaleString('ru-RU')}</td><td>{vote.nominationTitle}</td><td>{vote.candidateName}</td><td>{new Date(vote.updatedAt).toLocaleString('ru-RU')}</td><td><span className={`vote-record-status ${vote.status}`}>{vote.status === 'valid' ? 'Учтён' : 'Исключён'}</span></td><td><div className="table-actions"><button onClick={() => moderate(vote, vote.status === 'valid' ? 'exclude' : 'restore')} disabled={busy === `vote-${vote.id}`}>{vote.status === 'valid' ? 'Один: исключить' : 'Один: восстановить'}</button><button onClick={() => moderateAll(vote, vote.status === 'valid' ? 'exclude' : 'restore')} disabled={busy === `user-${vote.twitchUserId}`}>{vote.status === 'valid' ? 'Все: исключить' : 'Все: восстановить'}</button></div></td></tr>)}</tbody></table></div>
      <div className="admin-pagination"><button disabled={pagination.page <= 1} onClick={() => setPage(value => Math.max(1, value - 1))}>← Предыдущая</button><span>Страница {pagination.page} из {pagination.pages} · записей: {pagination.total}</span><button disabled={pagination.page >= pagination.pages} onClick={() => setPage(value => Math.min(pagination.pages, value + 1))}>Следующая →</button></div>
    </section>
    <section className="admin-section"><div className="admin-section-title"><div><span className="eyebrow">ЗАКРЫТЫЕ ДАННЫЕ</span><h2>ИТОГОВЫЙ ПОДСЧЁТ</h2>{results?.snapshot && <p>Снимок №{results.snapshot.revision} · {new Date(results.snapshot.created_at).toLocaleString('ru-RU')} {results.dirty && <strong>· Требуется повторная фиксация</strong>}</p>}</div><div className="admin-actions"><button onClick={() => { if (window.confirm('Зафиксировать текущие результаты? Голосование должно быть закрыто.')) void act('finalize', () => mutation('/api/admin/results/finalize', 'POST', csrf, {}), 'Результаты зафиксированы.'); }}>Зафиксировать результаты</button><button className="primary" onClick={() => { if (window.confirm('Опубликовать результаты для всех зрителей?')) void act('publish', () => mutation('/api/admin/results/publish', 'POST', csrf, {}), 'Результаты опубликованы.'); }}>Опубликовать результаты</button><a href="/api/admin/export?kind=results"><Download size={16} /> Итоги CSV</a></div></div>
      {results && <div className={`readiness-panel ${results.readiness.ready ? 'ready' : 'blocked'}`}><div><b>{results.readiness.ready ? 'ЦЕРЕМОНИЯ ГОТОВА' : 'ЦЕРЕМОНИЯ НЕ ГОТОВА'}</b><span>{results.readiness.ready ? 'Все победители проверены, результаты актуальны.' : 'Исправьте проблемы до боевого режима /present.'}</span></div>{!results.readiness.ready && <ul>{results.readiness.problems.map(problem => <li key={`${problem.code}-${problem.nominationId ?? 'global'}`}><span>{problem.message}</span>{problem.nominationId && ['winner_missing', 'unresolved_tie'].includes(problem.code) && <button onClick={() => { const reason = window.prompt(`Указать для «${problem.nominationTitle}» статус «без победителя». Причина:`); if (reason) void act(`no-winner-${problem.nominationId}`, () => mutation('/api/admin/results/no-winner', 'POST', csrf, { nominationId: problem.nominationId, reason }), 'Статус «без победителя» сохранён.'); }}>Без победителя</button>}</li>)}</ul>}</div>}
      {groupedResults.length ? <div className="admin-results">{groupedResults.map(([id, entries]) => { const maximum = Math.max(1, ...entries.map(entry => entry.voteCount)); return <article key={id}><div className="result-title"><h3>{entries[0].nominationTitle}</h3><button onClick={() => { if (window.confirm(`Опубликовать только «${entries[0].nominationTitle}»?`)) void act(`publish-${id}`, () => mutation('/api/admin/results/publish', 'POST', csrf, { nominationIds: [id] }), 'Номинация опубликована.'); }}>Опубликовать эту номинацию</button></div>{entries.map(entry => <div className={`result-bar ${entry.isWinner ? 'winner' : ''} ${entry.isTie ? 'tie' : ''}`} key={entry.candidateId}><span>{entry.candidateName}{entry.isTie ? ' · НИЧЬЯ' : entry.isWinner ? ' · ПОБЕДИТЕЛЬ' : ''}</span><i><b style={{ width: `${entry.voteCount / maximum * 100}%` }} /></i><strong>{entry.voteCount}</strong>{entry.isTie === 1 && <button onClick={() => { const reason = window.prompt('Основание выбора победителя при ничьей:'); if (reason) void act(`tie-${id}`, () => mutation('/api/admin/results/resolve-tie', 'POST', csrf, { nominationId: id, candidateId: entry.candidateId, reason }), 'Ничья разрешена.'); }}><Check size={14} /> Выбрать</button>}</div>)}</article>; })}</div> : <p className="admin-empty">Зафиксированных результатов пока нет.</p>}
    </section>
    <section className="admin-section"><div className="admin-section-title"><div><span className="eyebrow">АУДИТ</span><h2>ЖУРНАЛ ДЕЙСТВИЙ</h2><p>Последние 30 административных операций.</p></div></div><div className="audit-list">{actions.map(action => <article key={action.id}><time>{new Date(action.created_at).toLocaleString('ru-RU')}</time><b>{action.action}</b><span>{action.target_user_id ? `Twitch ID: ${action.target_user_id}` : action.reason || action.details || '—'}</span></article>)}</div></section>
  </main></Layout>;
}
