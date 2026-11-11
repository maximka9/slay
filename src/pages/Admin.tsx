import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, Check, Download, LockKeyhole, Plus, RefreshCcw, Search, Shield, Sparkles, Users, Vote } from 'lucide-react';
import { Layout } from '../components/Layout';
import { useAuth } from '../components/AuthProvider';
import { api, mutation, type VotingData } from '../lib/api';

type Overview = {
  counts: { users: number; validVotes: number; excludedVotes: number };
  recent: { recentUsers: number }; lastVote: { lastVoteAt: string | null };
  nominations: { id: string; title: string; votes: number; validVotes: number }[];
  settings: Record<string, string>;
};
type AdminVote = {
  id: number; nominationId: string; nominationTitle: string; candidateId: string; candidateName: string;
  twitchUserId: string; login: string; displayName: string; avatarUrl: string; twitchCreatedAt: string;
  firstSeenAt: string; updatedAt: string; status: 'valid' | 'excluded';
};
type ResultEntry = { nominationId: string; nominationTitle: string; candidateId: string; candidateName: string; imageUrl: string; voteCount: number; rank: number; isWinner: number; isTie: number; published: number };
type LiveEntry = Pick<ResultEntry, 'nominationId' | 'nominationTitle' | 'candidateId' | 'candidateName' | 'imageUrl' | 'voteCount'> & { percent: number | null };
type CeremonyProblem = { nominationId: string | null; nominationTitle: string | null; code: string; message: string };
type AdminResults = { snapshot: { id: string; revision: number; status: string; created_at: string } | null; dirty: boolean; entries: ResultEntry[]; liveEntries: LiveEntry[]; readiness: { ready: boolean; problems: CeremonyProblem[] } };
type Pagination = { page: number; limit: number; total: number; pages: number };
type AdminCandidate = { id: string; nominationId: string; name: string; twitchLogin: string | null; enabled: number };
type AuditAction = { id: number; action: string; target_user_id: string | null; reason: string | null; details: string | null; created_at: string; admin_twitch_user_id: string };
type CustomProposal = {
  twitchUserId: string; login: string; displayName: string; avatarUrl: string; awardTitle: string; recipient: string;
  status: 'valid' | 'excluded'; exclusionReason: string | null; updatedAt: string; selected: number;
  selectedAwardTitle: string | null; selectedRecipient: string | null;
};

function groupByNomination<T extends { nominationId: string }>(items: T[]): Array<[string, T[]]> {
  const groups = new Map<string, T[]>();
  for (const item of items) groups.set(item.nominationId, [...(groups.get(item.nominationId) ?? []), item]);
  return [...groups.entries()];
}

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
  const [customProposals, setCustomProposals] = useState<CustomProposal[]>([]);
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
      const params = new URLSearchParams({ page: String(page) });
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      if (nominationFilter) params.set('nomination', nominationFilter);
      if (newAccounts) params.set('newAccounts', '1');
      if (sort !== 'latest') params.set('sort', sort);
      const [nextOverview, nextVotes, nextResults, nextPublic, nextCandidates, nextActions, nextCustom] = await Promise.all([
        api<Overview>('/api/admin/overview'),
        api<{ votes: AdminVote[]; pagination: Pagination }>(`/api/admin/votes?${params}`),
        api<AdminResults>('/api/admin/results'),
        api<VotingData>('/api/nominations'),
        api<{ candidates: AdminCandidate[] }>('/api/admin/candidates'),
        api<{ actions: AuditAction[] }>('/api/admin/actions?limit=30'),
        api<{ proposals: CustomProposal[] }>('/api/admin/custom-awards?limit=200'),
      ]);
      setOverview(nextOverview); setVotes(nextVotes.votes); setPagination(nextVotes.pagination);
      setResults(nextResults); setPublicData(nextPublic); setCandidates(nextCandidates.candidates);
      setActions(nextActions.actions); setCustomProposals(nextCustom.proposals); setError('');
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

  const changeStatus = (status: 'preparation' | 'open' | 'closed') => {
    const label = status === 'open' ? 'открыть' : status === 'closed' ? 'закрыть' : 'вернуть в подготовку';
    if (!window.confirm(`Действительно ${label} голосование? Сохранённые голоса останутся в базе.`)) return;
    void act(`status-${status}`, () => mutation('/api/admin/voting/status', 'POST', csrf, { status }), `Статус голосования изменён: ${status}.`);
  };

  const moderateVote = (vote: AdminVote, all: boolean) => {
    const action = vote.status === 'valid' ? 'exclude' : 'restore';
    const reason = action === 'exclude' ? window.prompt('Причина исключения:', 'Другая причина') : '';
    if (action === 'exclude' && !reason) return;
    const path = all ? `/api/admin/users/${encodeURIComponent(vote.twitchUserId)}/${action}` : `/api/admin/votes/${vote.id}/${action}`;
    void act(`${all ? 'user' : 'vote'}-${all ? vote.twitchUserId : vote.id}`, () => mutation(path, 'POST', csrf, { reason }), action === 'exclude' ? 'Голос исключён.' : 'Голос восстановлен.');
  };

  const selectProposal = (proposal: CustomProposal) => {
    const awardTitle = window.prompt('Название награды для показа:', proposal.selectedAwardTitle ?? proposal.awardTitle);
    if (!awardTitle) return;
    const recipient = window.prompt('Получатель награды:', proposal.selectedRecipient ?? proposal.recipient);
    if (!recipient) return;
    void act(`custom-select-${proposal.twitchUserId}`, () => mutation('/api/admin/custom-awards/select', 'POST', csrf, { twitchUserId: proposal.twitchUserId, awardTitle, recipient }), 'Предложение выбрано для церемонии.');
  };

  const moderateProposal = (proposal: CustomProposal) => {
    const status = proposal.status === 'valid' ? 'excluded' : 'valid';
    const reason = status === 'excluded' ? window.prompt('Причина исключения:', 'Не подходит для церемонии') : '';
    if (status === 'excluded' && !reason) return;
    void act(`custom-${proposal.twitchUserId}`, () => mutation(`/api/admin/custom-awards/${encodeURIComponent(proposal.twitchUserId)}`, 'PATCH', csrf, { status, reason }), status === 'excluded' ? 'Предложение исключено.' : 'Предложение восстановлено.');
  };

  const groupedLive = useMemo(() => groupByNomination(results?.liveEntries ?? []), [results]);
  const groupedResults = useMemo(() => groupByNomination(results?.entries ?? []), [results]);

  if (auth.loading) return <main className="admin-gate"><Shield size={48} /><h1>ПРОВЕРЯЕМ ДОСТУП</h1></main>;
  if (!auth.authenticated) return <main className="admin-gate"><LockKeyhole size={48} /><h1>ТРЕБУЕТСЯ ВХОД</h1><p>Войдите через Twitch-аккаунт администратора.</p><a className="button primary" href={auth.loginUrl('/admin')}>Войти через Twitch</a></main>;
  if (!auth.isAdmin) return <main className="admin-gate"><LockKeyhole size={48} /><h1>ДОСТУП ЗАКРЫТ</h1><p>Этот Twitch ID не входит в список администраторов.</p><a className="button" href="/">На главную</a></main>;
  if (!overview || !publicData) return <main className="admin-gate"><RefreshCcw size={48} /><h1>ЗАГРУЖАЕМ ПАНЕЛЬ</h1>{error && <p className="form-error">{error}</p>}</main>;

  const votingStatus = (overview.settings.voting_status || 'preparation') as 'preparation' | 'open' | 'closed';
  const primaryStatus = votingStatus === 'open' ? 'closed' : 'open';
  const primaryLabel = votingStatus === 'open' ? 'Закрыть голосование' : votingStatus === 'closed' ? 'Открыть повторно' : 'Открыть голосование';
  const candidateChangeNeedsWarning = overview.counts.validVotes > 0 || votingStatus !== 'preparation';

  return <Layout><main className="admin-page">
    <header className="admin-heading"><div><span className="eyebrow">CAMCA63 / CONTROL ROOM</span><h1>ПАНЕЛЬ <em>ГОЛОСОВАНИЯ</em></h1><p>Единый статус, модерация, результаты и готовность церемонии.</p></div><div className={`admin-live ${votingStatus}`}><span className="status-dot" />{votingStatus === 'open' ? 'ОТКРЫТО' : votingStatus === 'closed' ? 'ЗАКРЫТО' : 'ПОДГОТОВКА'}</div></header>
    {(error || notice) && <div className={`vote-message ${error ? 'error' : ''}`} role={error ? 'alert' : 'status'}>{error || notice}</div>}
    <section className="admin-stats"><article><Users /><span>Уникальных зрителей</span><b>{overview.counts.users ?? 0}</b></article><article><Vote /><span>Учтённых голосов</span><b>{overview.counts.validVotes ?? 0}</b></article><article><AlertTriangle /><span>Исключённых</span><b>{overview.counts.excludedVotes ?? 0}</b></article><article><BarChart3 /><span>За последние 24 часа</span><b>{overview.recent.recentUsers ?? 0}</b></article><article><Sparkles /><span>Свои номинации</span><b>{customProposals.length}</b></article></section>

    <section className="admin-section"><div className="admin-section-title"><div><span className="eyebrow">УПРАВЛЕНИЕ</span><h2>СТАТУС ГОЛОСОВАНИЯ</h2><p>Один статус действует для всех включённых и готовых номинаций. Переход в подготовку не удаляет голоса.</p></div><div className="admin-actions"><button className="primary" onClick={() => changeStatus(primaryStatus)} disabled={busy !== ''}>{busy === `status-${primaryStatus}` ? 'СОХРАНЯЕМ…' : primaryLabel}</button>{votingStatus !== 'preparation' && <button onClick={() => changeStatus('preparation')} disabled={busy !== ''}>{busy === 'status-preparation' ? 'СОХРАНЯЕМ…' : 'Вернуть в подготовку'}</button>}</div></div>
      <div className="nomination-summary">{publicData.nominations.map(nomination => <article key={nomination.id}><div><b>{nomination.title}</b><span>{overview.nominations.find(item => item.id === nomination.id)?.validVotes ?? 0} голосов</span></div><span className={nomination.canVote ? 'ready' : ''}>{nomination.canVote ? 'Доступна' : nomination.unavailableReason}</span></article>)}</div>
    </section>

    <section className="admin-section"><div className="admin-section-title"><div><span className="eyebrow">ВАША НОМИНАЦИЯ</span><h2>ПРЕДЛОЖЕНИЯ ЗРИТЕЛЕЙ</h2><p>До закрытия голосования предложения скрыты от публики. Выберите одно и при необходимости отредактируйте текст для показа.</p></div></div>
      {customProposals.length ? <div className="custom-admin-list">{customProposals.map(proposal => <article key={proposal.twitchUserId} className={`${proposal.status} ${proposal.selected ? 'selected' : ''}`}><div className="voter"><img src={proposal.avatarUrl} alt="" /><span><b>{proposal.displayName}</b><small>@{proposal.login} · {new Date(proposal.updatedAt).toLocaleString('ru-RU')}</small></span></div><div className="custom-proposal-copy"><b>{proposal.awardTitle}</b><span>{proposal.recipient}</span>{proposal.exclusionReason && <small>{proposal.exclusionReason}</small>}</div><div className="admin-actions"><button onClick={() => moderateProposal(proposal)} disabled={busy !== ''}>{proposal.status === 'valid' ? 'Исключить' : 'Восстановить'}</button><button className="primary" onClick={() => selectProposal(proposal)} disabled={proposal.status !== 'valid' || busy !== ''}>{busy === `custom-select-${proposal.twitchUserId}` ? 'СОХРАНЯЕМ…' : proposal.selected ? 'Изменить показ' : 'Выбрать для церемонии'}</button></div></article>)}</div> : <p className="admin-empty">Предложений пока нет.</p>}
    </section>

    <section className="admin-section"><div className="admin-section-title"><div><span className="eyebrow">ЧАТТЕР ГОДА</span><h2>УПРАВЛЕНИЕ КАНДИДАТАМИ</h2><p>Изменение состава после фиксации помечает результаты как неактуальные.</p></div></div><form className="admin-inline-form" onSubmit={event => { event.preventDefault(); if (candidateChangeNeedsWarning && !window.confirm('Добавить кандидата и пометить результаты неактуальными?')) return; void act('candidate', () => mutation('/api/admin/candidates', 'POST', csrf, { nominationId: 'chatter', twitchLogin: candidateLogin }), 'Кандидат Twitch добавлен.').then(() => setCandidateLogin('')); }}><input value={candidateLogin} onChange={event => setCandidateLogin(event.target.value)} placeholder="Twitch login" required /><button className="button primary" disabled={busy !== ''}><Plus size={17} /> {busy === 'candidate' ? 'ДОБАВЛЯЕМ…' : 'Найти и добавить'}</button></form><div className="candidate-admin-list">{candidates.filter(candidate => candidate.nominationId === 'chatter').map(candidate => <article key={candidate.id}><span><b>{candidate.name}</b><small>@{candidate.twitchLogin}</small></span><button disabled={busy !== ''} onClick={() => { if (candidateChangeNeedsWarning && !window.confirm('Изменить кандидата и пометить результаты неактуальными?')) return; void act(`candidate-${candidate.id}`, () => mutation(`/api/admin/candidates/${encodeURIComponent(candidate.id)}`, 'PATCH', csrf, { enabled: candidate.enabled !== 1 }), candidate.enabled === 1 ? 'Кандидат скрыт.' : 'Кандидат восстановлен.'); }}>{candidate.enabled === 1 ? 'Скрыть' : 'Восстановить'}</button></article>)}</div></section>

    <section className="admin-section"><div className="admin-section-title"><div><span className="eyebrow">ТЕКУЩИЕ ДАННЫЕ</span><h2>ПРОМЕЖУТОЧНЫЕ РЕЗУЛЬТАТЫ</h2></div></div><div className="admin-results">{groupedLive.map(([id, rawEntries]) => { const entries = rawEntries ?? []; const maximum = Math.max(1, ...entries.map(entry => entry.voteCount)); return <article key={id}><h3>{entries[0]?.nominationTitle}</h3>{entries.map(entry => <div className="result-bar" key={entry.candidateId}><span>{entry.candidateName}</span><i><b style={{ width: `${entry.voteCount / maximum * 100}%` }} /></i><strong>{entry.voteCount} · {Number(entry.percent ?? 0).toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%</strong></div>)}</article>; })}</div></section>

    <section className="admin-section"><div className="admin-section-title"><div><span className="eyebrow">РУЧНАЯ ПРОВЕРКА</span><h2>ГОЛОСА ЗРИТЕЛЕЙ</h2></div><div className="admin-actions"><a href="/api/admin/export?kind=valid"><Download size={16} /> Учтённые CSV</a><a href="/api/admin/export?kind=excluded"><Download size={16} /> Исключённые CSV</a></div></div>
      <div className="admin-filters"><label><Search size={16} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Ник или Twitch ID" /></label><select value={nominationFilter} onChange={event => setNominationFilter(event.target.value)}><option value="">Все номинации</option>{publicData.nominations.filter(item => item.id !== 'custom-award').map(nomination => <option value={nomination.id} key={nomination.id}>{nomination.title}</option>)}</select><select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="">Все статусы</option><option value="valid">Учтён</option><option value="excluded">Исключён</option></select><select value={sort} onChange={event => setSort(event.target.value)}><option value="latest">По изменению голоса</option><option value="account">По дате аккаунта</option><option value="first">По первому участию</option></select><label className="check-filter"><input type="checkbox" checked={newAccounts} onChange={event => setNewAccounts(event.target.checked)} /> Новые аккаунты</label><button onClick={() => void load()} disabled={busy !== ''}><RefreshCcw size={16} /> Обновить</button></div>
      <div className="admin-table-wrap"><table><thead><tr><th>Аккаунт</th><th>Номинация</th><th>Выбор</th><th>Статус</th><th /></tr></thead><tbody>{votes.map(vote => <tr key={vote.id} className={vote.status}><td><div className="voter"><img src={vote.avatarUrl} alt="" /><span><a href={`https://twitch.tv/${vote.login}`} target="_blank" rel="noreferrer">{vote.displayName}</a><small>{vote.twitchUserId}</small></span></div></td><td>{vote.nominationTitle}</td><td>{vote.candidateName}</td><td><span className={`vote-record-status ${vote.status}`}>{vote.status === 'valid' ? 'Учтён' : 'Исключён'}</span></td><td><div className="table-actions"><button onClick={() => moderateVote(vote, false)} disabled={busy !== ''}>{vote.status === 'valid' ? 'Один: исключить' : 'Один: восстановить'}</button><button onClick={() => moderateVote(vote, true)} disabled={busy !== ''}>{vote.status === 'valid' ? 'Все: исключить' : 'Все: восстановить'}</button></div></td></tr>)}</tbody></table></div>
      <div className="admin-pagination"><button disabled={pagination.page <= 1 || busy !== ''} onClick={() => setPage(value => Math.max(1, value - 1))}>← Предыдущая</button><span>Страница {pagination.page} из {pagination.pages} · записей: {pagination.total}</span><button disabled={pagination.page >= pagination.pages || busy !== ''} onClick={() => setPage(value => Math.min(pagination.pages, value + 1))}>Следующая →</button></div>
    </section>

    <section className="admin-section"><div className="admin-section-title"><div><span className="eyebrow">ЗАКРЫТЫЕ ДАННЫЕ</span><h2>ИТОГОВЫЙ ПОДСЧЁТ</h2>{results?.snapshot && <p>Снимок №{results.snapshot.revision} {results.dirty && <strong>· Требуется повторная фиксация</strong>}</p>}</div><div className="admin-actions"><button disabled={busy !== ''} onClick={() => { if (window.confirm('Зафиксировать текущие результаты? Голосование должно быть закрыто.')) void act('finalize', () => mutation('/api/admin/results/finalize', 'POST', csrf, {}), 'Результаты зафиксированы.'); }}>{busy === 'finalize' ? 'ФИКСИРУЕМ…' : 'Зафиксировать результаты'}</button><button className="primary" disabled={busy !== ''} onClick={() => { if (window.confirm('Опубликовать результаты для зрителей?')) void act('publish', () => mutation('/api/admin/results/publish', 'POST', csrf, {}), 'Результаты опубликованы.'); }}>{busy === 'publish' ? 'ПУБЛИКУЕМ…' : 'Опубликовать результаты'}</button><a href="/api/admin/export?kind=results"><Download size={16} /> Итоги CSV</a></div></div>
      {results && <div className={`readiness-panel ${results.readiness.ready ? 'ready' : 'blocked'}`}><div><b>{results.readiness.ready ? 'ЦЕРЕМОНИЯ ГОТОВА' : 'ЦЕРЕМОНИЯ НЕ ГОТОВА'}</b><span>{results.readiness.ready ? 'Все победители проверены, результаты актуальны.' : 'Исправьте перечисленные проблемы перед боевым режимом.'}</span></div>{!results.readiness.ready && <ul>{results.readiness.problems.map(problem => <li key={`${problem.code}-${problem.nominationId ?? 'global'}`}><span>{problem.message}</span>{problem.nominationId && problem.nominationId !== 'custom-award' && ['winner_missing', 'unresolved_tie'].includes(problem.code) && <button disabled={busy !== ''} onClick={() => { const reason = window.prompt(`Причина статуса «без победителя» для «${problem.nominationTitle}»:`); if (reason) void act(`no-winner-${problem.nominationId}`, () => mutation('/api/admin/results/no-winner', 'POST', csrf, { nominationId: problem.nominationId, reason }), 'Статус сохранён.'); }}>Без победителя</button>}</li>)}</ul>}</div>}
      {groupedResults.length ? <div className="admin-results">{groupedResults.map(([id, rawEntries]) => { const entries = rawEntries ?? []; const maximum = Math.max(1, ...entries.map(entry => entry.voteCount)); return <article key={id}><h3>{entries[0]?.nominationTitle}</h3>{entries.map(entry => <div className={`result-bar ${entry.isWinner ? 'winner' : ''} ${entry.isTie ? 'tie' : ''}`} key={entry.candidateId}><span>{entry.candidateName}{entry.isTie ? ' · НИЧЬЯ' : entry.isWinner ? ' · ПОБЕДИТЕЛЬ' : ''}</span><i><b style={{ width: `${entry.voteCount / maximum * 100}%` }} /></i><strong>{entry.voteCount}</strong>{entry.isTie === 1 && <button disabled={busy !== ''} onClick={() => { const reason = window.prompt('Основание выбора победителя при ничьей:'); if (reason) void act(`tie-${id}`, () => mutation('/api/admin/results/resolve-tie', 'POST', csrf, { nominationId: id, candidateId: entry.candidateId, reason }), 'Ничья разрешена.'); }}><Check size={14} /> Выбрать</button>}</div>)}</article>; })}</div> : <p className="admin-empty">Зафиксированных результатов пока нет.</p>}
    </section>

    <section className="admin-section"><div className="admin-section-title"><div><span className="eyebrow">АУДИТ</span><h2>ЖУРНАЛ ДЕЙСТВИЙ</h2></div></div><div className="audit-list">{actions.map(action => <article key={action.id}><time>{new Date(action.created_at).toLocaleString('ru-RU')}</time><b>{action.action}</b><span>{action.target_user_id ? `Twitch ID: ${action.target_user_id}` : action.reason || action.details || '—'}</span></article>)}</div></section>
  </main></Layout>;
}
