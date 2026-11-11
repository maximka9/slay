import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronRight, Clock3, Eye, LogIn, LogOut, ShieldCheck, Vote as VoteIcon } from 'lucide-react';
import { awards, type Category, type Nominee } from '../data/awards';
import { Layout } from '../components/Layout';
import { MediaView } from '../components/MediaView';
import { VideoPlayerModal } from '../components/VideoPlayerModal';
import { useAuth } from '../components/AuthProvider';
import { api, mutation, type MyVote, type VotingCandidate, type VotingData, type VotingNomination } from '../lib/api';

function nomineeFor(candidate: VotingCandidate): Nominee {
  const local = awards.categories.flatMap(category => category.nominees).find(nominee => nominee.id === candidate.id);
  return local ?? { id: candidate.id, name: candidate.name, media: candidate.imageUrl ? { src: candidate.imageUrl, alt: candidate.name } : undefined };
}
function categoryFor(nomination: VotingNomination): Category {
  return awards.categories.find(category => category.id === nomination.id) ?? {
    id: nomination.id, title: nomination.title, intro: nomination.description, kind: nomination.id === 'chatter' ? 'chatter' : 'frame',
    icon: nomination.id === 'chatter' ? 'message' : 'sparkles', nominees: nomination.candidates.map(nomineeFor), winnerId: null,
  };
}
function formatDate(value: string | null, timezone: string) {
  if (!value) return 'срок не задан';
  try { return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'long', timeStyle: 'short', timeZone: timezone }).format(new Date(value)); }
  catch { return new Date(value).toLocaleString('ru-RU'); }
}

export function Vote() {
  const auth = useAuth();
  const [data, setData] = useState<VotingData | null>(null);
  const [votes, setVotes] = useState<Record<string, MyVote>>({});
  const [viewer, setViewer] = useState<{ category: Category; nominee: Nominee } | null>(null);
  const [pending, setPending] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [freeLogin, setFreeLogin] = useState('');
  useEffect(() => { api<VotingData>('/api/nominations').then(setData).catch(err => setError(err instanceof Error ? err.message : 'Не удалось загрузить номинации.')); }, []);
  useEffect(() => {
    if (!auth.authenticated) { setVotes({}); return; }
    api<{ votes: MyVote[] }>('/api/my-votes').then(result => setVotes(Object.fromEntries(result.votes.map(vote => [vote.nominationId, vote])))).catch(err => setError(err instanceof Error ? err.message : 'Не удалось загрузить голоса.'));
  }, [auth.authenticated]);
  const completed = Object.keys(votes).length;
  const categories = useMemo(() => Object.fromEntries(awards.categories.map(category => [category.id, category])), []);

  const choose = async (nomination: VotingNomination, candidateId?: string, twitchLogin?: string) => {
    if (!auth.authenticated || !auth.csrfToken) { window.location.href = auth.loginUrl('/vote'); return; }
    setPending(nomination.id); setError(''); setNotice('');
    try {
      const result = await mutation<{ vote: MyVote }>(`/api/votes/${encodeURIComponent(nomination.id)}`, 'PUT', auth.csrfToken, { candidateId, twitchLogin });
      const candidate = nomination.candidates.find(item => item.id === result.vote.candidateId);
      setVotes(current => ({ ...current, [nomination.id]: { ...result.vote, candidateName: candidate?.name ?? twitchLogin ?? 'Выбранный кандидат', updatedAt: new Date().toISOString() } }));
      setNotice(`Голос в номинации «${nomination.title}» сохранён.`); setFreeLogin('');
      setData(await api<VotingData>('/api/nominations'));
    } catch (err) { setError(err instanceof Error ? err.message : 'Не удалось сохранить голос.'); }
    finally { setPending(''); }
  };

  if (!data) return <Layout><main className="vote-page loading-page"><span className="eyebrow">CAMCA63 AWARDS / VOTE</span><h1>ЗАГРУЖАЕМ <em>НОМИНАЦИИ</em></h1>{error && <p className="form-error" role="alert">{error}</p>}</main></Layout>;
  const statusText = data.voting.status === 'open' ? 'ГОЛОСОВАНИЕ ОТКРЫТО' : data.voting.status === 'closed' ? 'ГОЛОСОВАНИЕ ЗАКРЫТО' : 'ИДЁТ ПОДГОТОВКА';
  return <Layout><main className="vote-page">
    <section className="vote-hero"><div><div className="eyebrow"><VoteIcon size={16} /> ВЫБОР КОМЬЮНИТИ</div><h1>CAMCA63 <em>AWARDS 2026</em></h1><p>Выбор комьюнити. Определи лучшие моменты, игры и участников года.</p></div>
      <div className="voting-profile">{auth.authenticated && auth.user ? <><img src={auth.user.avatarUrl} alt="" /><div><b>{auth.user.displayName}</b><span>@{auth.user.login}</span></div><button onClick={() => void auth.logout()}><LogOut size={16} /> Выйти</button></> : <><ShieldCheck size={28} /><div><b>Голосуй своим аккаунтом</b><span>Twitch ID защищает от повторных голосов</span></div><a className="button primary" href={auth.loginUrl('/vote')}><LogIn size={17} /> Войти через Twitch</a></>}</div>
    </section>
    <section className="vote-status-panel"><div className={`vote-status ${data.voting.status}`}><span className="status-dot" />{statusText}</div><div><Clock3 size={17} /><span>{formatDate(data.voting.startsAt, data.voting.timezone)} — {formatDate(data.voting.endsAt, data.voting.timezone)}</span></div><div className="vote-progress"><b>Проголосовано в {completed} из {data.nominations.length} номинаций</b><span><i style={{ width: `${data.nominations.length ? completed / data.nominations.length * 100 : 0}%` }} /></span></div></section>
    {(notice || error) && <div className={`vote-message ${error ? 'error' : ''}`} role={error ? 'alert' : 'status'}>{error || notice}</div>}
    <div className="vote-nominations">{data.nominations.map((nomination, nominationIndex) => {
      const localCategory = categories[nomination.id] ?? categoryFor(nomination);
      const selected = votes[nomination.id]?.candidateId;
      const open = data.voting.status === 'open' && nomination.votingStatus === 'open';
      return <section className="vote-nomination" id={`vote-${nomination.id}`} key={nomination.id}><header><div><span className="eyebrow">НОМИНАЦИЯ {String(nominationIndex + 1).padStart(2, '0')} / {String(data.nominations.length).padStart(2, '0')}</span><h2>{nomination.title}</h2><p>{nomination.description}</p></div><span className={`nomination-state ${open ? 'open' : ''}`}>{open ? 'Открыта' : nomination.votingStatus === 'closed' ? 'Закрыта' : 'Подготовка'}</span></header>
        {nomination.candidates.length ? <div className={`voting-grid ${nomination.candidates.length > 6 ? 'many' : ''}`}>{nomination.candidates.map((candidate, index) => {
          const nominee = nomineeFor(candidate); const isSelected = selected === candidate.id; const watchable = Boolean(nominee.media?.src || nominee.videos?.length);
          return <article className={`voting-card ${isSelected ? 'selected' : ''}`} key={candidate.id}>
            <button className="voting-media" onClick={() => watchable && setViewer({ category: localCategory, nominee })} disabled={!watchable} aria-label={`${nominee.videos?.length ? 'Смотреть видео' : 'Увеличить изображение'}: ${candidate.name}`}><MediaView nominee={nominee} contain={localCategory.kind === 'poster' || localCategory.kind === 'meme'} /><span>{watchable && <><Eye size={18} /> Смотреть</>}</span><i>{String(index + 1).padStart(2, '0')}</i></button>
            <div className="voting-card-copy"><h3>{candidate.name}</h3>{candidate.twitchLogin && <a href={`https://twitch.tv/${candidate.twitchLogin}`} target="_blank" rel="noreferrer">@{candidate.twitchLogin}</a>}</div>
            <button className={`vote-choice ${isSelected ? 'chosen' : ''}`} disabled={!open || pending === nomination.id} onClick={() => void choose(nomination, candidate.id)}>{isSelected ? <><Check size={18} /> Мой голос</> : <>Выбрать <ChevronRight size={18} /></>}</button>
          </article>;
        })}</div> : <div className="candidates-pending"><span>КАНДИДАТЫ ФОРМИРУЮТСЯ</span><h3>{nomination.id === 'chatter' ? 'Кандидаты формируются по предложениям зрителей' : 'Список появится перед открытием голосования'}</h3></div>}
        {nomination.id === 'chatter' && data.voting.chatterFreeInput && open && <form className="free-chatter" onSubmit={event => { event.preventDefault(); void choose(nomination, undefined, freeLogin); }}><label htmlFor="chatter-login">Twitch-ник кандидата</label><div><input id="chatter-login" value={freeLogin} onChange={event => setFreeLogin(event.target.value)} placeholder="username" required /><button className="button primary" disabled={pending === nomination.id}>Проверить и выбрать</button></div></form>}
      </section>;
    })}</div>
    <p className="privacy-note">Мы получаем только данные профиля, необходимые для голосования. <a href="/privacy">Как используются данные</a>.</p>
  </main>{viewer && <VideoPlayerModal category={viewer.category} nominee={viewer.nominee} onClose={() => setViewer(null)} />}</Layout>;
}
