import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Check,
  Download,
  LockKeyhole,
  Play,
  Plus,
  Radio,
  RefreshCcw,
  Search,
  Shield,
  Sparkles,
  Users,
  Vote,
} from 'lucide-react';
import { Layout } from '../components/Layout';
import { useAuth } from '../components/AuthProvider';
import { api, mutation, type VotingData } from '../lib/api';
import { votesLabel } from '../lib/plural';
import { useAdminDialog } from '../components/admin/AdminDialog';

type Overview = {
  counts: { users: number; validVotes: number; excludedVotes: number };
  recent: { recentUsers: number };
  lastVote: { lastVoteAt: string | null };
  nominations: {
    id: string;
    title: string;
    votes: number;
    validVotes: number;
  }[];
  settings: Record<string, string>;
};
type AdminVote = {
  id: number;
  nominationId: string;
  nominationTitle: string;
  candidateId: string;
  candidateName: string;
  twitchUserId: string;
  login: string;
  displayName: string;
  avatarUrl: string;
  twitchCreatedAt: string;
  firstSeenAt: string;
  updatedAt: string;
  status: 'valid' | 'excluded';
};
type ResultEntry = {
  nominationId: string;
  nominationTitle: string;
  candidateId: string;
  candidateName: string;
  imageUrl: string;
  voteCount: number;
  rank: number;
  isWinner: number;
  isTie: number;
  published: number;
};
type LiveEntry = Pick<
  ResultEntry,
  | 'nominationId'
  | 'nominationTitle'
  | 'candidateId'
  | 'candidateName'
  | 'imageUrl'
  | 'voteCount'
> & { percent: number | null };
type CeremonyProblem = {
  nominationId: string | null;
  nominationTitle: string | null;
  code: string;
  message: string;
};
type AdminResults = {
  snapshot: {
    id: string;
    revision: number;
    status: string;
    created_at: string;
  } | null;
  dirty: boolean;
  entries: ResultEntry[];
  liveEntries: LiveEntry[];
  customAward: {
    awardTitle: string;
    recipient: string;
    authorLogin: string;
  } | null;
  readiness: { ready: boolean; problems: CeremonyProblem[] };
};
type Pagination = { page: number; limit: number; total: number; pages: number };
type AdminCandidate = {
  id: string;
  nominationId: string;
  name: string;
  twitchLogin: string | null;
  enabled: number;
  validVotes?: number;
  totalVotes?: number;
};
type AuditAction = {
  id: number;
  action: string;
  target_user_id: string | null;
  reason: string | null;
  comment: string | null;
  details: string | null;
  created_at: string;
  admin_twitch_user_id: string;
  adminLogin: string | null;
  adminDisplayName: string | null;
};
type CustomProposal = {
  twitchUserId: string;
  login: string;
  displayName: string;
  avatarUrl: string;
  awardTitle: string;
  recipient: string;
  status: 'valid' | 'excluded';
  exclusionReason: string | null;
  updatedAt: string;
  selected: number;
  selectedAwardTitle: string | null;
  selectedRecipient: string | null;
};

function groupByNomination<T extends { nominationId: string }>(
  items: T[],
): Array<[string, T[]]> {
  const groups = new Map<string, T[]>();
  for (const item of items)
    groups.set(item.nominationId, [
      ...(groups.get(item.nominationId) ?? []),
      item,
    ]);
  return [...groups.entries()];
}

const auditLabels: Record<string, string> = {
  voting_preparation: 'Голосование возвращено в подготовку',
  voting_open: 'Голосование открыто',
  voting_closed: 'Голосование закрыто',
  exclude: 'Голос исключён',
  restore: 'Голос восстановлен',
  exclude_all: 'Голоса пользователя исключены',
  restore_all: 'Голоса пользователя восстановлены',
  results_finalize: 'Результаты зафиксированы',
  results_publish: 'Результаты опубликованы',
  tie_resolve: 'Ничья разрешена',
  results_no_winner: 'Для номинации выбран статус «Без победителя»',
  no_winner: 'Для номинации выбран статус «Без победителя»',
  custom_award_select: 'Выбрана пользовательская награда',
  custom_award_excluded: 'Предложение исключено',
  custom_award_valid: 'Предложение восстановлено',
  candidate_create: 'Кандидат добавлен',
  candidate_update: 'Кандидат изменён',
  nomination_update: 'Номинация изменена',
  chatter_free_input_on: 'Свободный ввод ника в «Чаттере» включён',
  chatter_free_input_off: 'Свободный ввод ника в «Чаттере» выключен',
};

function formatDateTime(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString('ru-RU') : 'нет данных';
}

function compactFinalEntries(entries: ResultEntry[], expanded: boolean) {
  if (expanded) return entries;
  const firstThree = entries.slice(0, 3);
  const boundary = firstThree[firstThree.length - 1];
  if (!boundary || boundary.voteCount <= 0) return firstThree;
  return entries.filter(
    (entry, index) => index < 3 || entry.rank === boundary.rank,
  );
}

function auditSubject(action: AuditAction) {
  let details: Record<string, unknown> = {};
  try {
    details = action.details
      ? (JSON.parse(action.details) as Record<string, unknown>)
      : {};
  } catch {
    /* Old rows may contain plain text. */
  }
  const target = action.target_user_id
    ? `Twitch ID: ${action.target_user_id}`
    : details.nominationId
      ? `Номинация: ${String(details.nominationId)}`
      : details.id
        ? `Объект: ${String(details.id)}`
        : '';
  return (
    [target, action.reason, action.comment].filter(Boolean).join(' · ') ||
    'Без дополнительных деталей'
  );
}

function toggleSet(current: Set<string>, id: string) {
  const next = new Set(current);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function Admin() {
  const auth = useAuth();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [votes, setVotes] = useState<AdminVote[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 100,
    total: 0,
    pages: 1,
  });
  const [page, setPage] = useState(1);
  const [results, setResults] = useState<AdminResults | null>(null);
  const [publicData, setPublicData] = useState<VotingData | null>(null);
  const [candidates, setCandidates] = useState<AdminCandidate[]>([]);
  const [actions, setActions] = useState<AuditAction[]>([]);
  const [auditPagination, setAuditPagination] = useState<Pagination>({
    page: 1,
    limit: 3,
    total: 0,
    pages: 1,
  });
  const [auditExpanded, setAuditExpanded] = useState(false);
  const [auditPage, setAuditPage] = useState(1);
  const [expandedLive, setExpandedLive] = useState<Set<string>>(
    () => new Set(),
  );
  const [expandedFinal, setExpandedFinal] = useState<Set<string>>(
    () => new Set(),
  );
  const [customProposals, setCustomProposals] = useState<CustomProposal[]>([]);
  const [customAwardPublished, setCustomAwardPublished] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [nominationFilter, setNominationFilter] = useState('');
  const [newAccounts, setNewAccounts] = useState(false);
  const [sort, setSort] = useState('latest');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const csrf = auth.csrfToken ?? '';
  const dialog = useAdminDialog();

  const [loadFailures, setLoadFailures] = useState<string[]>([]);
  const loadCore = useCallback(async () => {
    if (!auth.isAdmin) return;
    // allSettled: падение одного блока не мешает показать остальные.
    const [nextOverview, nextResults, nextPublic, nextCandidates, nextCustom] =
      await Promise.allSettled([
        api<Overview>('/api/admin/overview'),
        api<AdminResults>('/api/admin/results'),
        api<VotingData>('/api/nominations'),
        api<{ candidates: AdminCandidate[] }>('/api/admin/candidates'),
        api<{ proposals: CustomProposal[]; customAwardPublished: boolean }>(
          '/api/admin/custom-awards?limit=200',
        ),
      ]);
    const failures: string[] = [];
    if (nextOverview.status === 'fulfilled') setOverview(nextOverview.value);
    else failures.push('статистика');
    if (nextResults.status === 'fulfilled') setResults(nextResults.value);
    else failures.push('результаты');
    if (nextPublic.status === 'fulfilled') setPublicData(nextPublic.value);
    else failures.push('номинации');
    if (nextCandidates.status === 'fulfilled')
      setCandidates(nextCandidates.value.candidates);
    else failures.push('кандидаты «Чаттера»');
    if (nextCustom.status === 'fulfilled') {
      setCustomProposals(nextCustom.value.proposals);
      setCustomAwardPublished(nextCustom.value.customAwardPublished);
    } else failures.push('«Ваша номинация»');
    setLoadFailures(failures);
    if (failures.length)
      throw new Error(`Не загрузилось: ${failures.join(', ')}.`);
  }, [auth.isAdmin]);

  const votesRequest = useRef(0);
  const loadVotes = useCallback(async () => {
    if (!auth.isAdmin) return;
    const params = new URLSearchParams({ page: String(page) });
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (statusFilter) params.set('status', statusFilter);
    if (nominationFilter) params.set('nomination', nominationFilter);
    if (newAccounts) params.set('newAccounts', '1');
    if (sort !== 'latest') params.set('sort', sort);
    const requestId = ++votesRequest.current;
    const nextVotes = await api<{ votes: AdminVote[]; pagination: Pagination }>(
      `/api/admin/votes?${params}`,
    );
    // Пришёл ответ на устаревший запрос (фильтр уже поменялся) — не применяем.
    if (requestId !== votesRequest.current) return;
    setVotes(nextVotes.votes);
    setPagination(nextVotes.pagination);
  }, [
    auth.isAdmin,
    debouncedSearch,
    nominationFilter,
    newAccounts,
    page,
    sort,
    statusFilter,
  ]);

  const loadActions = useCallback(async () => {
    if (!auth.isAdmin) return;
    const limit = auditExpanded ? 25 : 3;
    const nextActions = await api<{
      actions: AuditAction[];
      pagination: Pagination;
    }>(
      `/api/admin/actions?limit=${limit}&page=${auditExpanded ? auditPage : 1}`,
    );
    setActions(nextActions.actions);
    setAuditPagination(nextActions.pagination);
  }, [auditExpanded, auditPage, auth.isAdmin]);

  const refreshAll = useCallback(
    () => Promise.all([loadCore(), loadVotes(), loadActions()]),
    [loadActions, loadCore, loadVotes],
  );
  const showLoadError = useCallback(
    (err: unknown) =>
      setError(
        err instanceof Error
          ? err.message
          : 'Не удалось загрузить админ-панель.',
      ),
    [],
  );

  useEffect(() => {
    void loadCore().catch(showLoadError);
  }, [loadCore, showLoadError]);
  useEffect(() => {
    void loadVotes().catch(showLoadError);
  }, [loadVotes, showLoadError]);
  useEffect(() => {
    void loadActions().catch(showLoadError);
  }, [loadActions, showLoadError]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      setDebouncedSearch(search.trim());
    }, 350);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    setPage(1);
  }, [nominationFilter, newAccounts, sort, statusFilter]);

  const act = async (
    name: string,
    operation: () => Promise<unknown>,
    success: string,
  ): Promise<boolean> => {
    setBusy(name);
    setError('');
    setNotice('');
    try {
      await operation();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Операция не выполнена.');
      setBusy('');
      return false;
    }
    setNotice(success);
    try {
      await refreshAll();
    } catch {
      setNotice(
        `${success} Не удалось обновить часть данных — обновите страницу.`,
      );
    } finally {
      setBusy('');
    }
    return true;
  };

  const changeStatus = async (status: 'preparation' | 'open' | 'closed') => {
    const label =
      status === 'open'
        ? 'открыть'
        : status === 'closed'
          ? 'закрыть'
          : 'вернуть в подготовку';
    if (
      !(await dialog.confirm(
        `Действительно ${label} голосование? Сохранённые голоса останутся в базе.`,
        { confirmLabel: 'Да, изменить статус' },
      ))
    )
      return;
    void act(
      `status-${status}`,
      () => mutation('/api/admin/voting/status', 'POST', csrf, { status }),
      `Статус голосования изменён: ${status}.`,
    );
  };

  const exclusionReasons = [
    'Подозрение на накрутку',
    'Твинк / новый аккаунт',
    'Голос за себя',
    'Тестовый голос',
    'Другая причина',
  ];

  const moderateVote = async (vote: AdminVote, all: boolean) => {
    const action = vote.status === 'valid' ? 'exclude' : 'restore';
    const target = vote.displayName || vote.login || vote.twitchUserId;
    const values = await dialog.form({
      title: action === 'exclude'
        ? (all ? `Исключить все голоса ${target}?` : `Исключить голос ${target}?`)
        : (all ? `Восстановить все голоса ${target}?` : `Восстановить голос ${target}?`),
      message: all
        ? 'Действие затронет все номинации этого аккаунта. Результаты будут помечены неактуальными.'
        : `Номинация: ${vote.nominationTitle}. Результаты будут помечены неактуальными.`,
      fields: [
        ...(action === 'exclude'
          ? [
              { type: 'select' as const, name: 'reason', label: 'Причина', options: exclusionReasons, initial: 'Другая причина' },
              { type: 'textarea' as const, name: 'comment', label: 'Комментарий (необязательно)', maxLength: 300 },
            ]
          : []),
        ...(all
          ? [{ type: 'checkbox' as const, name: 'includeCustomAward', label: action === 'exclude' ? 'Также исключить его предложение в «Вашей номинации»' : 'Также восстановить его предложение в «Вашей номинации»', initial: true }]
          : []),
      ],
      confirmLabel: action === 'exclude' ? 'Исключить' : 'Восстановить',
      danger: action === 'exclude',
    });
    if (!values) return;
    const path = all
      ? `/api/admin/users/${encodeURIComponent(vote.twitchUserId)}/${action}`
      : `/api/admin/votes/${vote.id}/${action}`;
    void act(
      `${all ? 'user' : 'vote'}-${all ? vote.twitchUserId : vote.id}`,
      () => mutation(path, 'POST', csrf, {
        reason: values.reason ?? '',
        comment: values.comment ?? '',
        ...(all ? { includeCustomAward: values.includeCustomAward === '1' } : {}),
      }),
      action === 'exclude' ? (all ? 'Голоса аккаунта исключены.' : 'Голос исключён.') : (all ? 'Голоса аккаунта восстановлены.' : 'Голос восстановлен.'),
    );
  };

  const selectProposal = async (proposal: CustomProposal) => {
    const values = await dialog.form({
      title: 'Выбрать предложение для церемонии',
      message: `Автор: ${proposal.displayName || proposal.login || proposal.twitchUserId}. Можно поправить формулировку для показа.`,
      fields: [
        { type: 'text', name: 'awardTitle', label: 'Название награды', initial: proposal.selectedAwardTitle ?? proposal.awardTitle, required: true, maxLength: 80 },
        { type: 'text', name: 'recipient', label: 'Получатель награды', initial: proposal.selectedRecipient ?? proposal.recipient, required: true, maxLength: 80 },
      ],
      confirmLabel: 'Выбрать',
    });
    if (!values) return;
    void act(
      `custom-select-${proposal.twitchUserId}`,
      () =>
        mutation('/api/admin/custom-awards/select', 'POST', csrf, {
          twitchUserId: proposal.twitchUserId,
          awardTitle: values.awardTitle,
          recipient: values.recipient,
        }),
      'Предложение выбрано для церемонии.',
    );
  };

  const moderateProposal = async (proposal: CustomProposal) => {
    const status = proposal.status === 'valid' ? 'excluded' : 'valid';
    let reason = '';
    if (status === 'excluded') {
      const values = await dialog.form({
        title: 'Исключить предложение?',
        message: `«${proposal.awardTitle}» → ${proposal.recipient}`,
        fields: [{ type: 'select', name: 'reason', label: 'Причина', options: ['Не подходит для церемонии', 'Оскорбительное содержание', 'Спам / бессмыслица', 'Дубликат', 'Другая причина'], initial: 'Не подходит для церемонии' }],
        confirmLabel: 'Исключить',
        danger: true,
      });
      if (!values) return;
      reason = values.reason;
    }
    void act(
      `custom-${proposal.twitchUserId}`,
      () =>
        mutation(
          `/api/admin/custom-awards/${encodeURIComponent(proposal.twitchUserId)}`,
          'PATCH',
          csrf,
          { status, reason },
        ),
      status === 'excluded'
        ? 'Предложение исключено.'
        : 'Предложение восстановлено.',
    );
  };

  const groupedLive = useMemo(
    () => groupByNomination(results?.liveEntries ?? []),
    [results],
  );
  const groupedResults = useMemo(
    () => groupByNomination(results?.entries ?? []),
    [results],
  );

  if (auth.loading)
    return (
      <main className="admin-gate">
        <Shield size={48} />
        <h1>ПРОВЕРЯЕМ ДОСТУП</h1>
      </main>
    );
  if (!auth.authenticated)
    return (
      <main className="admin-gate">
        <LockKeyhole size={48} />
        <h1>ТРЕБУЕТСЯ ВХОД</h1>
        <p>Войдите через Twitch-аккаунт администратора.</p>
        <a className="button primary" href={auth.loginUrl('/admin')}>
          Войти через Twitch
        </a>
      </main>
    );
  if (!auth.isAdmin)
    return (
      <main className="admin-gate">
        <LockKeyhole size={48} />
        <h1>ДОСТУП ЗАКРЫТ</h1>
        <p>Этот Twitch ID не входит в список администраторов.</p>
        <a className="button" href="/">
          На главную
        </a>
      </main>
    );
  if (!overview || !publicData)
    return (
      <main className="admin-gate">
        <RefreshCcw size={48} />
        <h1>ЗАГРУЖАЕМ ПАНЕЛЬ</h1>
        {error && <p className="form-error">{error}</p>}
        {error && (
          <button
            className="button primary"
            onClick={() => {
              setError('');
              void loadCore().catch(showLoadError);
            }}
          >
            Повторить
          </button>
        )}
      </main>
    );

  const votingStatus = (overview.settings.voting_status || 'preparation') as
    | 'preparation'
    | 'open'
    | 'closed';
  const primaryStatus = votingStatus === 'open' ? 'closed' : 'open';
  const primaryLabel =
    votingStatus === 'open'
      ? 'Закрыть голосование'
      : votingStatus === 'closed'
        ? 'Открыть повторно'
        : 'Открыть голосование';
  const candidateChangeNeedsWarning =
    overview.counts.validVotes > 0 || votingStatus !== 'preparation';
  const chatterCandidates = candidates
    .filter((candidate) => candidate.nominationId === 'chatter')
    // Ники, за которые никто сейчас не голосует (зритель передумал), не показываем — это просто мусор.
    .filter((candidate) => (candidate.totalVotes ?? 0) > 0 || candidate.enabled !== 1)
    .sort((a, b) => (b.enabled - a.enabled) || ((b.validVotes ?? 0) - (a.validVotes ?? 0)));
  const readiness = results?.readiness;

  return (
    <Layout>
      {dialog.element}
      <main className="admin-page">
        <header className="admin-heading">
          <div>
            <span className="eyebrow">CAMCA63 / CONTROL ROOM</span>
            <h1>
              ПАНЕЛЬ <em>ГОЛОСОВАНИЯ</em>
            </h1>
            <p>Единый статус, модерация, результаты и готовность церемонии.</p>
          </div>
          <div className={`admin-live ${votingStatus}`}>
            <span className="status-dot" />
            {votingStatus === 'open'
              ? 'ОТКРЫТО'
              : votingStatus === 'closed'
                ? 'ЗАКРЫТО'
                : 'ПОДГОТОВКА'}
          </div>
        </header>
        {(error || notice) && (
          <div
            className={`vote-message ${error ? 'error' : ''}`}
            role={error ? 'alert' : 'status'}
          >
            {error || notice}
          </div>
        )}
        {loadFailures.length > 0 && (
          <div className="admin-load-failure" role="alert">
            <AlertTriangle size={18} />
            <span>
              Не загрузилось: {loadFailures.join(', ')}. Остальные блоки
              показаны по последним полученным данным.
            </span>
            <button
              disabled={busy !== ''}
              onClick={() => {
                setError('');
                void refreshAll().catch(showLoadError);
              }}
            >
              <RefreshCcw size={15} /> Повторить
            </button>
          </div>
        )}
        <section className="admin-stats">
          <article>
            <Users />
            <span>Уникальных зрителей</span>
            <b>{overview.counts.users ?? 0}</b>
          </article>
          <article>
            <Vote />
            <span>Учтённых голосов</span>
            <b>{overview.counts.validVotes ?? 0}</b>
          </article>
          <article>
            <AlertTriangle />
            <span>Исключённых</span>
            <b>{overview.counts.excludedVotes ?? 0}</b>
          </article>
          <article>
            <BarChart3 />
            <span>За последние 24 часа</span>
            <b>{overview.recent.recentUsers ?? 0}</b>
          </article>
          <article>
            <Sparkles />
            <span>Свои номинации</span>
            <b>{customProposals.length}</b>
          </article>
        </section>

        <section className="admin-section">
          <div className="admin-section-title">
            <div>
              <span className="eyebrow">УПРАВЛЕНИЕ</span>
              <h2>СТАТУС ГОЛОСОВАНИЯ</h2>
              <p>
                Один статус действует для всех включённых и готовых номинаций.
                Переход в подготовку не удаляет голоса.
              </p>
            </div>
            <div className="admin-actions">
              <button
                className="primary"
                onClick={() => void changeStatus(primaryStatus)}
                disabled={busy !== ''}
              >
                {busy === `status-${primaryStatus}`
                  ? 'СОХРАНЯЕМ…'
                  : primaryLabel}
              </button>
              {votingStatus !== 'preparation' && (
                <button
                  onClick={() => void changeStatus('preparation')}
                  disabled={busy !== ''}
                >
                  {busy === 'status-preparation'
                    ? 'СОХРАНЯЕМ…'
                    : 'Вернуть в подготовку'}
                </button>
              )}
            </div>
          </div>
          <div className="nomination-summary">
            {publicData.nominations.map((nomination) => (
              <article key={nomination.id}>
                <div>
                  <b>{nomination.title}</b>
                  <span>
                    {votesLabel(
                      overview.nominations.find(
                        (item) => item.id === nomination.id,
                      )?.validVotes ?? 0,
                    )}
                  </span>
                </div>
                <span className={nomination.canVote ? 'ready' : ''}>
                  {nomination.canVote
                    ? 'Доступна'
                    : nomination.unavailableReason}
                </span>
              </article>
            ))}
          </div>
        </section>

        <section
          className="admin-section ceremony-control"
          aria-labelledby="ceremony-control-title"
        >
          <div className="admin-section-title">
            <div>
              <span className="eyebrow">ВЕДУЩИЙ</span>
              <h2 id="ceremony-control-title">УПРАВЛЕНИЕ ЦЕРЕМОНИЕЙ</h2>
              <p>
                Закройте голосование → проверьте голоса → выберите
                пользовательскую награду → зафиксируйте результаты → начните
                церемонию.
              </p>
            </div>
          </div>
          <div className="ceremony-launches">
            <a
              className="ceremony-launch rehearsal"
              href="/present?rehearsal=1"
            >
              <Play size={24} />{' '}
              <span>
                <b>Начать репетицию</b>
                <small>Доступна всегда, реальные итоги скрыты</small>
              </span>
            </a>
            {readiness?.ready ? (
              <a className="ceremony-launch live" href="/present">
                <Radio size={24} />{' '}
                <span>
                  <b>Начать церемонию</b>
                  <small>Все серверные проверки пройдены</small>
                </span>
              </a>
            ) : (
              <button className="ceremony-launch live" disabled>
                <Radio size={24} />{' '}
                <span>
                  <b>Начать церемонию — недоступно</b>
                  <small>Завершите подготовку результатов</small>
                </span>
              </button>
            )}
          </div>
          <div
            className={`ceremony-status ${readiness?.ready ? 'ready' : 'blocked'}`}
          >
            <b>
              {readiness?.ready
                ? 'Церемония готова'
                : 'Церемония пока не готова'}
            </b>
            {!readiness?.ready && (
              <ul>
                {(readiness?.problems ?? []).map((problem) => (
                  <li
                    key={`launch-${problem.code}-${problem.nominationId ?? 'global'}`}
                  >
                    {problem.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="admin-section" id="custom-awards">
          <div className="admin-section-title">
            <div>
              <span className="eyebrow">ВАША НОМИНАЦИЯ</span>
              <h2>ПРЕДЛОЖЕНИЯ ЗРИТЕЛЕЙ</h2>
              <p>
                До отдельной публикации итоговая зрительская награда скрыта от
                публики. Выберите одно предложение и при необходимости
                отредактируйте текст для показа.
              </p>
            </div>
            <div className="admin-actions">
              <button
                className="primary"
                disabled={
                  busy !== '' ||
                  customAwardPublished ||
                  votingStatus !== 'closed' ||
                  !readiness?.ready
                }
                onClick={async () => {
                  if (
                    await dialog.confirm(
                      'Опубликовать «Вашу номинацию» для зрителей?',
                    )
                  )
                    void act(
                      'publish-custom',
                      () =>
                        mutation('/api/admin/results/publish', 'POST', csrf, {
                          nominationIds: ['custom-award'],
                        }),
                      '«Ваша номинация» опубликована.',
                    );
                }}
              >
                {busy === 'publish-custom'
                  ? 'ПУБЛИКУЕМ…'
                  : customAwardPublished
                    ? 'Уже опубликована'
                    : 'Опубликовать отдельно'}
              </button>
            </div>
          </div>
          {customProposals.length ? (
            <div className="custom-admin-list">
              {customProposals.map((proposal) => (
                <article
                  key={proposal.twitchUserId}
                  className={`${proposal.status} ${proposal.selected ? 'selected' : ''}`}
                >
                  <div className="voter">
                    <img src={proposal.avatarUrl} alt="" />
                    <span>
                      <b>{proposal.displayName}</b>
                      <small>
                        @{proposal.login} ·{' '}
                        {new Date(proposal.updatedAt).toLocaleString('ru-RU')}
                      </small>
                    </span>
                  </div>
                  <div className="custom-proposal-copy">
                    <b>{proposal.awardTitle}</b>
                    <span>{proposal.recipient}</span>
                    {proposal.exclusionReason && (
                      <small>{proposal.exclusionReason}</small>
                    )}
                  </div>
                  <div className="admin-actions">
                    <button
                      onClick={() => void moderateProposal(proposal)}
                      disabled={busy !== ''}
                    >
                      {proposal.status === 'valid'
                        ? 'Исключить'
                        : 'Восстановить'}
                    </button>
                    <button
                      className="primary"
                      onClick={() => void selectProposal(proposal)}
                      disabled={proposal.status !== 'valid' || busy !== ''}
                    >
                      {busy === `custom-select-${proposal.twitchUserId}`
                        ? 'СОХРАНЯЕМ…'
                        : proposal.selected
                          ? 'Изменить показ'
                          : 'Выбрать для церемонии'}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="admin-empty">Предложений пока нет.</p>
          )}
        </section>

        <section className="admin-section">
          <div className="admin-section-title">
            <div>
              <span className="eyebrow">ЧАТТЕР ГОДА</span>
              <h2>ВПИСАННЫЕ НИКИ</h2>
              <p>
                Ники появляются сами, когда зрители их вписывают. Побеждает ник
                с наибольшим числом учтённых голосов. Голосовать за себя нельзя.
                Снятый ник не участвует в подсчёте, и за него больше нельзя
                проголосовать. Ники, за которые сейчас никто не голосует,
                скрыты. Один зритель может вписать ник не больше 2 раз.
              </p>
            </div>
          </div>
          {chatterCandidates.length ? (
            <div className="chatter-admin-list">
              {chatterCandidates.map((candidate, index) => (
                <article
                  key={candidate.id}
                  className={candidate.enabled === 1 ? undefined : 'is-hidden'}
                >
                  <span className="chatter-rank">{index + 1}</span>
                  <span>
                    <b>{candidate.name}</b>
                    <small>@{candidate.twitchLogin}</small>
                  </span>
                  <span className="chatter-votes">
                    {candidate.enabled === 1
                      ? votesLabel(candidate.validVotes ?? 0)
                      : 'снят'}
                  </span>
                  <button
                    disabled={busy !== ''}
                    onClick={async () => {
                      const hide = candidate.enabled === 1;
                      if (
                        !await dialog.confirm(
                          (hide
                            ? 'Его голоса перестанут учитываться, а зрители не смогут за него проголосовать.'
                            : 'Его учтённые голоса снова войдут в подсчёт.')
                            + (candidateChangeNeedsWarning ? ' Результаты будут помечены неактуальными.' : ''),
                          {
                            title: hide
                              ? `Снять @${candidate.twitchLogin} с номинации?`
                              : `Вернуть @${candidate.twitchLogin} в номинацию?`,
                            confirmLabel: hide ? 'Снять' : 'Вернуть',
                            danger: hide,
                          },
                        )
                      )
                        return;
                      void act(
                        `candidate-${candidate.id}`,
                        () =>
                          mutation(
                            `/api/admin/candidates/${encodeURIComponent(candidate.id)}`,
                            'PATCH',
                            csrf,
                            { enabled: !hide },
                          ),
                        hide ? 'Ник снят с номинации.' : 'Ник возвращён в номинацию.',
                      );
                    }}
                  >
                    {candidate.enabled === 1 ? 'Снять' : 'Вернуть'}
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <p className="admin-empty">Пока никто не вписал ни одного ника.</p>
          )}
        </section>

        <section className="admin-section">
          <div className="admin-section-title">
            <div>
              <span className="eyebrow">РУЧНАЯ ПРОВЕРКА</span>
              <h2>ГОЛОСА ЗРИТЕЛЕЙ</h2>
            </div>
            <div className="admin-actions">
              <a href="/api/admin/export?kind=valid">
                <Download size={16} /> Учтённые CSV
              </a>
              <a href="/api/admin/export?kind=excluded">
                <Download size={16} /> Исключённые CSV
              </a>
            </div>
          </div>
          <div className="admin-filters">
            <label>
              <Search size={16} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Ник или Twitch ID"
                maxLength={23}
              />
            </label>
            <select
              value={nominationFilter}
              onChange={(event) => setNominationFilter(event.target.value)}
            >
              <option value="">Все номинации</option>
              {publicData.nominations
                .filter((item) => item.id !== 'custom-award')
                .map((nomination) => (
                  <option value={nomination.id} key={nomination.id}>
                    {nomination.title}
                  </option>
                ))}
            </select>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="">Все статусы</option>
              <option value="valid">Учтён</option>
              <option value="excluded">Исключён</option>
            </select>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value)}
            >
              <option value="latest">По изменению голоса</option>
              <option value="account">По дате аккаунта</option>
              <option value="first">По первому участию</option>
            </select>
            <label className="check-filter">
              <input
                type="checkbox"
                checked={newAccounts}
                onChange={(event) => setNewAccounts(event.target.checked)}
              />{' '}
              Новые аккаунты
            </label>
            <button
              onClick={() => void loadVotes().catch(showLoadError)}
              disabled={busy !== ''}
            >
              <RefreshCcw size={16} /> Обновить
            </button>
          </div>
          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Аккаунт</th>
                  <th>Номинация</th>
                  <th>Выбор</th>
                  <th>Статус</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {votes.map((vote) => (
                  <tr key={vote.id} className={vote.status}>
                    <td>
                      <div className="voter">
                        <img src={vote.avatarUrl} alt="" />
                        <span>
                          <a
                            href={`https://twitch.tv/${vote.login}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {vote.displayName}
                          </a>
                          <small>{vote.twitchUserId}</small>
                        </span>
                      </div>
                    </td>
                    <td>{vote.nominationTitle}</td>
                    <td>{vote.candidateName}</td>
                    <td>
                      <span className={`vote-record-status ${vote.status}`}>
                        {vote.status === 'valid' ? 'Учтён' : 'Исключён'}
                      </span>
                    </td>
                    <td>
                      <div className="table-actions">
                        <button
                          className={vote.status === 'valid' ? 'danger' : 'restore'}
                          onClick={() => void moderateVote(vote, false)}
                          disabled={busy !== ''}
                        >
                          {vote.status === 'valid'
                            ? 'Один: исключить'
                            : 'Один: восстановить'}
                        </button>
                        <button
                          className={vote.status === 'valid' ? 'danger' : 'restore'}
                          onClick={() => void moderateVote(vote, true)}
                          disabled={busy !== ''}
                        >
                          {vote.status === 'valid'
                            ? 'Все: исключить'
                            : 'Все: восстановить'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="admin-pagination">
            <button
              disabled={pagination.page <= 1 || busy !== ''}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              ← Предыдущая
            </button>
            <span>
              Страница {pagination.page} из {pagination.pages} · записей:{' '}
              {pagination.total}
            </span>
            <button
              disabled={pagination.page >= pagination.pages || busy !== ''}
              onClick={() =>
                setPage((value) => Math.min(pagination.pages, value + 1))
              }
            >
              Следующая →
            </button>
          </div>
        </section>

        <section
          className={`admin-section ${results?.dirty ? 'stale-results' : ''}`}
          id="final-results"
        >
          <div className="admin-section-title">
            <div>
              <span className="eyebrow">ЗАКРЫТЫЕ ДАННЫЕ</span>
              <h2>ИТОГОВЫЙ ПОДСЧЁТ</h2>
              {results?.snapshot && (
                <p>
                  Снимок №{results.snapshot.revision} · зафиксирован{' '}
                  {formatDateTime(results.snapshot.created_at)}{' '}
                  {results.dirty ? (
                    <strong>· Требуется повторная фиксация</strong>
                  ) : (
                    <strong className="snapshot-fresh">· Актуален</strong>
                  )}
                </p>
              )}
            </div>
            <div className="admin-actions">
              <button
                disabled={busy !== '' || votingStatus !== 'closed'}
                title={
                  votingStatus !== 'closed'
                    ? 'Сначала закройте голосование'
                    : undefined
                }
                onClick={async () => {
                  if (
                    await dialog.confirm(
                      'Зафиксировать текущие результаты? Голосование должно быть закрыто.',
                    )
                  )
                    void act(
                      'finalize',
                      () =>
                        mutation(
                          '/api/admin/results/finalize',
                          'POST',
                          csrf,
                          {},
                        ),
                      'Результаты зафиксированы.',
                    );
                }}
              >
                {busy === 'finalize'
                  ? 'ФИКСИРУЕМ…'
                  : 'Зафиксировать результаты'}
              </button>
              <button
                className="primary"
                disabled={
                  busy !== '' ||
                  votingStatus !== 'closed' ||
                  !results?.snapshot ||
                  results.dirty
                }
                title={
                  votingStatus !== 'closed'
                    ? 'Сначала закройте голосование'
                    : !results?.snapshot || results?.dirty
                      ? 'Сначала зафиксируйте актуальные результаты'
                      : undefined
                }
                onClick={async () => {
                  if (
                    await dialog.confirm(
                      'Опубликовать основные результаты для зрителей? «Ваша номинация» останется скрытой до отдельной команды.',
                    )
                  )
                    void act(
                      'publish',
                      () =>
                        mutation(
                          '/api/admin/results/publish',
                          'POST',
                          csrf,
                          {},
                        ),
                      'Основные результаты опубликованы.',
                    );
                }}
              >
                {busy === 'publish'
                  ? 'ПУБЛИКУЕМ…'
                  : 'Опубликовать основные результаты'}
              </button>
              <a href="/api/admin/export?kind=results">
                <Download size={16} /> Итоги CSV
              </a>
            </div>
          </div>
          {results?.snapshot && results.dirty && (
            <div className="stale-snapshot-warning" role="alert">
              <AlertTriangle size={20} />
              <div>
                <b>УСТАРЕВШИЙ СНИМОК — НЕ ИСПОЛЬЗОВАТЬ ДЛЯ ЦЕРЕМОНИИ</b>
                <span>
                  Голоса или состав кандидатов изменились после фиксации.
                  Текущие данные смотрите в промежуточных результатах ниже.
                </span>
              </div>
            </div>
          )}
          {results && (
            <div
              className={`readiness-panel ${readiness?.ready ? 'ready' : 'blocked'}`}
            >
              <div>
                <b>
                  {readiness?.ready
                    ? 'ЦЕРЕМОНИЯ ГОТОВА'
                    : 'ЦЕРЕМОНИЯ НЕ ГОТОВА'}
                </b>
                <span>
                  {readiness?.ready
                    ? 'Результаты зафиксированы, девять номинаций подготовлены.'
                    : 'Исправьте перечисленные проблемы перед боевым режимом.'}
                </span>
              </div>
              {!readiness?.ready && (
                <ul>
                  {readiness?.problems.map((problem) => (
                    <li
                      key={`${problem.code}-${problem.nominationId ?? 'global'}`}
                    >
                      <span>{problem.message}</span>
                      {problem.nominationId === 'custom-award' && (
                        <button
                          onClick={() =>
                            document
                              .getElementById('custom-awards')
                              ?.scrollIntoView({ behavior: 'smooth' })
                          }
                        >
                          К предложениям
                        </button>
                      )}
                      {problem.nominationId &&
                        problem.nominationId !== 'custom-award' &&
                        ['winner_missing', 'unresolved_tie'].includes(
                          problem.code,
                        ) && (
                          <button
                            disabled={busy !== ''}
                            onClick={async () => {
                              const reason = await dialog.prompt(
                                `Причина статуса «без победителя» для «${problem.nominationTitle}»:`,
                              );
                              if (reason)
                                void act(
                                  `no-winner-${problem.nominationId}`,
                                  () =>
                                    mutation(
                                      '/api/admin/results/no-winner',
                                      'POST',
                                      csrf,
                                      {
                                        nominationId: problem.nominationId,
                                        reason,
                                      },
                                    ),
                                  'Статус сохранён.',
                                );
                            }}
                          >
                            Без победителя
                          </button>
                        )}
                    </li>
                  ))}
                </ul>
              )}
              <div className="readiness-actions">
                <a className="button outline" href="/present?rehearsal=1">
                  Начать репетицию
                </a>
                {readiness?.ready && (
                  <a className="button primary" href="/present">
                    Начать церемонию
                  </a>
                )}
              </div>
            </div>
          )}
          {groupedResults.length ? (
            <div className="admin-results">
              {groupedResults.map(([id, rawEntries]) => {
                const entries = [...rawEntries].sort((a, b) => a.rank - b.rank);
                const allZero = entries.every((entry) => entry.voteCount === 0);
                const visible = compactFinalEntries(
                  entries,
                  expandedFinal.has(id),
                );
                const maximum = Math.max(
                  1,
                  ...entries.map((entry) => entry.voteCount),
                );
                const published = entries.some(
                  (entry) => entry.published === 1,
                );
                return (
                  <article key={id}>
                    <div className="result-title">
                      <h3>{entries[0]?.nominationTitle}</h3>
                      <span
                        className={`publication-mark ${published ? 'published' : ''}`}
                      >
                        {published ? 'Опубликовано' : 'Скрыто'}
                      </span>
                    </div>
                    {allZero && !expandedFinal.has(id) ? (
                      <p className="admin-empty">
                        В снимке нет учтённых голосов — победитель не
                        определяется.
                      </p>
                    ) : (
                      visible.map((entry) => (
                        <div
                          className={`result-bar ${entry.isWinner && !results?.dirty ? 'winner' : ''} ${entry.isTie ? 'tie' : ''}`}
                          key={entry.candidateId}
                        >
                          <span>
                            <b className="result-rank">{entry.rank}.</b>{' '}
                            {entry.candidateName}
                            {entry.isTie
                              ? results?.dirty
                                ? ' · АРХИВНАЯ НИЧЬЯ'
                                : ' · НИЧЬЯ'
                              : entry.isWinner
                                ? results?.dirty
                                  ? ' · АРХИВНЫЙ ЛИДЕР'
                                  : ' · ПОБЕДИТЕЛЬ'
                                : ''}
                          </span>
                          <i>
                            <b
                              style={{
                                width: `${(entry.voteCount / maximum) * 100}%`,
                              }}
                            />
                          </i>
                          <strong>{entry.voteCount}</strong>
                          {entry.isTie === 1 && (
                            <button
                              disabled={busy !== ''}
                              onClick={async () => {
                                const reason = await dialog.prompt(
                                  'Основание выбора победителя при ничьей:',
                                );
                                if (reason)
                                  void act(
                                    `tie-${id}`,
                                    () =>
                                      mutation(
                                        '/api/admin/results/resolve-tie',
                                        'POST',
                                        csrf,
                                        {
                                          nominationId: id,
                                          candidateId: entry.candidateId,
                                          reason,
                                        },
                                      ),
                                    'Ничья разрешена.',
                                  );
                              }}
                            >
                              <Check size={14} /> Выбрать
                            </button>
                          )}
                        </div>
                      ))
                    )}
                    {entries.length > visible.length && (
                      <button
                        className="compact-toggle"
                        onClick={() =>
                          setExpandedFinal((current) => toggleSet(current, id))
                        }
                      >
                        Показать всех {entries.length}
                      </button>
                    )}
                    {expandedFinal.has(id) && entries.length > 3 && (
                      <button
                        className="compact-toggle"
                        onClick={() =>
                          setExpandedFinal((current) => toggleSet(current, id))
                        }
                      >
                        Свернуть
                      </button>
                    )}
                  </article>
                );
              })}
              <article className="custom-result-card">
                <div className="result-title">
                  <h3>Ваша номинация</h3>
                  <span
                    className={`publication-mark ${customAwardPublished ? 'published' : ''}`}
                  >
                    {customAwardPublished ? 'Опубликовано' : 'Скрыто'}
                  </span>
                </div>
                {results?.customAward ? (
                  <div>
                    <b>{results.customAward.awardTitle}</b>
                    <p>{results.customAward.recipient}</p>
                    <small>Предложил: @{results.customAward.authorLogin}</small>
                  </div>
                ) : (
                  <p className="admin-empty">
                    Выберите предложение зрителя перед боевой церемонией.
                  </p>
                )}
              </article>
            </div>
          ) : (
            <p className="admin-empty">Зафиксированных результатов пока нет.</p>
          )}
        </section>

        <section className="admin-section">
          <div className="admin-section-title">
            <div>
              <span className="eyebrow">АУДИТ</span>
              <h2>ЖУРНАЛ ДЕЙСТВИЙ</h2>
              <p>
                Новые события отображаются первыми. Серверная история не
                сокращается.
              </p>
            </div>
          </div>
          <div className="audit-list">
            {actions.map((action) => (
              <article key={action.id}>
                <time>
                  {new Date(action.created_at).toLocaleString('ru-RU')}
                </time>
                <b>{auditLabels[action.action] ?? 'Неизвестное действие'}</b>
                <span>
                  <strong>
                    {action.adminDisplayName ||
                      action.adminLogin ||
                      action.admin_twitch_user_id}
                  </strong>{' '}
                  · {auditSubject(action)}
                </span>
              </article>
            ))}
          </div>
          {auditExpanded ? (
            <div className="admin-pagination">
              <button
                disabled={auditPagination.page <= 1}
                onClick={() => setAuditPage((value) => Math.max(1, value - 1))}
              >
                ← Предыдущая
              </button>
              <span>
                Страница {auditPagination.page} из {auditPagination.pages} ·
                событий: {auditPagination.total}
              </span>
              <button
                disabled={auditPagination.page >= auditPagination.pages}
                onClick={() =>
                  setAuditPage((value) =>
                    Math.min(auditPagination.pages, value + 1),
                  )
                }
              >
                Следующая →
              </button>
              <button
                onClick={() => {
                  setAuditExpanded(false);
                  setAuditPage(1);
                }}
              >
                Свернуть
              </button>
            </div>
          ) : (
            auditPagination.total > 3 && (
              <button
                className="compact-toggle"
                onClick={() => {
                  setAuditExpanded(true);
                  setAuditPage(1);
                }}
              >
                Показать все события
              </button>
            )
          )}
        </section>

        <section className="admin-section" id="live-results">
          <div className="admin-section-title">
            <div>
              <span className="eyebrow">ТЕКУЩИЕ ДАННЫЕ</span>
              <h2>ПРОМЕЖУТОЧНЫЕ РЕЗУЛЬТАТЫ</h2>
              <p>
                По умолчанию показаны три лидера. Эти данные доступны только
                администратору. Последний учтённый голос:{' '}
                {formatDateTime(overview.lastVote.lastVoteAt)}.
              </p>
            </div>
          </div>
          <div className="admin-results">
            {groupedLive.map(([id, rawEntries]) => {
              const entries = [...rawEntries].sort(
                (a, b) => b.voteCount - a.voteCount,
              );
              const allZero = entries.every((entry) => entry.voteCount === 0);
              const visible = expandedLive.has(id)
                ? entries
                : entries.slice(0, 3);
              const maximum = Math.max(
                1,
                ...entries.map((entry) => entry.voteCount),
              );
              return (
                <article key={id}>
                  <h3>{entries[0]?.nominationTitle}</h3>
                  {allZero && !expandedLive.has(id) ? (
                    <p className="admin-empty">
                      Учтённых голосов пока нет — лидер не определяется.
                    </p>
                  ) : (
                    visible.map((entry) => {
                      // Плотный ранг, как в зафиксированном снимке: равные голоса → одно место.
                      const rank =
                        1 +
                        new Set(
                          entries
                            .filter((other) => other.voteCount > entry.voteCount)
                            .map((other) => other.voteCount),
                        ).size;
                      const tied =
                        entry.voteCount > 0 &&
                        entries.some(
                          (other) =>
                            other.candidateId !== entry.candidateId &&
                            other.voteCount === entry.voteCount,
                        );
                      return (
                        <div
                          className={`result-bar ${tied ? 'tie' : ''}`}
                          key={entry.candidateId}
                        >
                          <span>
                            <b className="result-rank">{rank}.</b>{' '}
                            {entry.candidateName}
                            {tied ? ' · РАВЕНСТВО' : ''}
                          </span>
                          <i>
                            <b
                              style={{
                                width: `${(entry.voteCount / maximum) * 100}%`,
                              }}
                            />
                          </i>
                          <strong>
                            {entry.voteCount} ·{' '}
                            {Number(entry.percent ?? 0).toLocaleString(
                              'ru-RU',
                              { maximumFractionDigits: 1 },
                            )}
                            %
                          </strong>
                        </div>
                      );
                    })
                  )}
                  {entries.length > 3 && (
                    <button
                      className="compact-toggle"
                      onClick={() =>
                        setExpandedLive((current) => toggleSet(current, id))
                      }
                    >
                      {expandedLive.has(id)
                        ? 'Свернуть'
                        : `Показать всех ${entries.length}`}
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      </main>
    </Layout>
  );
}
