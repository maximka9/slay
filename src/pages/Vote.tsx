import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronRight, LogIn, LogOut, Play, ShieldCheck, Sparkles, Vote as VoteIcon } from 'lucide-react';
import { awards, type Category, type Nominee } from '../data/awards';
import { Layout } from '../components/Layout';
import { MediaView } from '../components/MediaView';
import { VideoPlayerModal } from '../components/VideoPlayerModal';
import { useAuth } from '../components/AuthProvider';
import { api, mutation, type CustomAwardProposal, type MyVote, type VotingCandidate, type VotingData, type VotingNomination } from '../lib/api';

function nomineeFor(candidate: VotingCandidate): Nominee {
  const local = awards.categories.flatMap(category => category.nominees).find(nominee => nominee.id === candidate.id);
  return local
    ? { ...local, name: candidate.name, media: local.media ? { ...local.media, alt: candidate.name } : undefined }
    : { id: candidate.id, name: candidate.name, media: candidate.imageUrl ? { src: candidate.imageUrl, alt: candidate.name } : undefined };
}

function categoryFor(nomination: VotingNomination): Category {
  return awards.categories.find(category => category.id === nomination.id) ?? {
    id: nomination.id,
    title: nomination.title,
    intro: nomination.description,
    kind: nomination.id === 'chatter' ? 'chatter' : nomination.id === 'custom-award' ? 'custom' : 'frame',
    icon: nomination.id === 'chatter' ? 'message' : 'sparkles',
    nominees: nomination.candidates.map(nomineeFor),
    winnerId: null,
  };
}

export function Vote() {
  const auth = useAuth();
  const [data, setData] = useState<VotingData | null>(null);
  const [votes, setVotes] = useState<Record<string, MyVote>>({});
  const [proposal, setProposal] = useState<CustomAwardProposal | null>(null);
  const [awardTitle, setAwardTitle] = useState('');
  const [recipient, setRecipient] = useState('');
  const [viewer, setViewer] = useState<{ category: Category; nominee: Nominee } | null>(null);
  const [pending, setPending] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [freeLogin, setFreeLogin] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [nominationsLoading, setNominationsLoading] = useState(true);
  const nominationsRequest = useRef(0);

  const loadNominations = useCallback(async () => {
    const requestId = ++nominationsRequest.current;
    setNominationsLoading(true);
    setError('');
    try {
      const result = await api<VotingData>('/api/nominations');
      if (requestId === nominationsRequest.current) setData(result);
    } catch (err) {
      if (requestId === nominationsRequest.current) setError(err instanceof Error ? err.message : 'Не удалось загрузить номинации.');
    } finally {
      if (requestId === nominationsRequest.current) setNominationsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!confirmation) return;
    const timer = window.setTimeout(() => setConfirmation(''), 900);
    return () => window.clearTimeout(timer);
  }, [confirmation]);

  useEffect(() => { void loadNominations(); }, [loadNominations]);

  useEffect(() => {
    if (!auth.authenticated) { setVotes({}); setProposal(null); return; }
    Promise.all([
      api<{ votes: MyVote[] }>('/api/my-votes'),
      api<{ proposal: CustomAwardProposal | null }>('/api/my-custom-award'),
    ]).then(([voteResult, customResult]) => {
      setVotes(Object.fromEntries(voteResult.votes.map(vote => [vote.nominationId, vote])));
      setProposal(customResult.proposal);
      setAwardTitle(customResult.proposal?.awardTitle ?? '');
      setRecipient(customResult.proposal?.recipient ?? '');
    }).catch(err => setError(err instanceof Error ? err.message : 'Не удалось загрузить сохранённый выбор.'));
  }, [auth.authenticated]);

  const completed = data?.nominations.reduce((count, nomination) => {
    if (nomination.id === 'custom-award') return count + (proposal?.status === 'valid' ? 1 : 0);
    return count + (votes[nomination.id]?.status === 'valid' ? 1 : 0);
  }, 0) ?? 0;
  const categories = useMemo(() => Object.fromEntries(awards.categories.map(category => [category.id, category])), []);

  const choose = async (nomination: VotingNomination, candidateId?: string, twitchLogin?: string) => {
    if (!auth.authenticated || !auth.csrfToken) { window.location.href = auth.loginUrl('/vote'); return; }
    setPending(nomination.id); setError(''); setNotice('');
    try {
      const result = await mutation<{ vote: MyVote }>(`/api/votes/${encodeURIComponent(nomination.id)}`, 'PUT', auth.csrfToken, { candidateId, twitchLogin });
      const candidate = nomination.candidates.find(item => item.id === result.vote.candidateId);
      setVotes(current => ({ ...current, [nomination.id]: { ...result.vote, candidateName: candidate?.name ?? twitchLogin ?? 'Выбранный кандидат', updatedAt: new Date().toISOString() } }));
      setConfirmation(`vote:${nomination.id}:${result.vote.candidateId ?? twitchLogin ?? ''}`);
      setNotice(`Голос в номинации «${nomination.title}» сохранён.`);
      setFreeLogin('');
      try {
        setData(await api<VotingData>('/api/nominations'));
      } catch {
        // Голос уже сохранён; обновление списка кандидатов не влияет на результат операции.
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'Не удалось сохранить голос.'); }
    finally { setPending(''); }
  };

  const saveProposal = async (nomination: VotingNomination) => {
    if (!auth.authenticated || !auth.csrfToken) { window.location.href = auth.loginUrl('/vote'); return; }
    setPending(nomination.id); setError(''); setNotice('');
    try {
      await mutation('/api/custom-award', 'PUT', auth.csrfToken, { awardTitle, recipient });
      const saved: CustomAwardProposal = { awardTitle: awardTitle.trim(), recipient: recipient.trim(), status: proposal?.status ?? 'valid', updatedAt: new Date().toISOString() };
      setProposal(saved);
      setConfirmation(`custom:${nomination.id}`);
      setNotice(proposal ? 'Предложение обновлено.' : 'Предложение сохранено. До закрытия голосования его можно изменить.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Не удалось сохранить предложение.'); }
    finally { setPending(''); }
  };

  if (!data) return <Layout><main className="vote-page loading-page"><span className="eyebrow">CAMCA63 AWARDS / VOTE</span><h1>{nominationsLoading ? <>ЗАГРУЖАЕМ <em>НОМИНАЦИИ</em></> : <>НЕ УДАЛОСЬ <em>ЗАГРУЗИТЬ</em></>}</h1>{error && <><p className="form-error" role="alert">{error}</p><button className="button outline" onClick={() => void loadNominations()} disabled={nominationsLoading}>{nominationsLoading ? 'ЗАГРУЖАЕМ…' : 'ПОВТОРИТЬ ЗАГРУЗКУ'}</button></>}</main></Layout>;
  const statusText = data.voting.status === 'open' ? 'ГОЛОСОВАНИЕ ОТКРЫТО' : data.voting.status === 'closed' ? 'ГОЛОСОВАНИЕ ЗАКРЫТО' : 'ИДЁТ ПОДГОТОВКА';

  return <Layout><main className="vote-page">
    <section className="vote-hero"><div><div className="eyebrow"><VoteIcon size={16} /> ВЫБОР КОМЬЮНИТИ</div><h1>CAMCA63 <em>AWARDS 2026</em></h1><p>Выбор комьюнити. Определи лучшие моменты, игры и участников года.</p></div>
      <div className="voting-profile">{auth.authenticated && auth.user ? <><img src={auth.user.avatarUrl} alt="" /><div><b>{auth.user.displayName}</b><span>@{auth.user.login}</span></div><button onClick={() => void auth.logout()}><LogOut size={16} /> Выйти</button></> : <><ShieldCheck size={28} /><div><b>Голосуй своим аккаунтом</b><span>Twitch ID защищает от повторных голосов</span></div><a className="button primary" href={auth.loginUrl('/vote')}><LogIn size={17} /> Войти через Twitch</a></>}</div>
    </section>
    <section className="vote-status-panel"><div className={`vote-status ${data.voting.status}`}><span className="status-dot" />{statusText}</div><div className="vote-progress"><b>Заполнено {completed} из {data.nominations.length} номинаций</b><span><i style={{ width: `${data.nominations.length ? completed / data.nominations.length * 100 : 0}%` }} /></span></div></section>
    {(notice || error) && <div className={`vote-message ${error ? 'error' : ''}`} role={error ? 'alert' : 'status'}>{error || notice}</div>}
    <div className="vote-nominations">{data.nominations.map((nomination, nominationIndex) => {
      const localCategory = categories[nomination.id] ?? categoryFor(nomination);
      const selected = votes[nomination.id]?.candidateId;
      const open = nomination.canVote;
      return <section className="vote-nomination" id={`vote-${nomination.id}`} key={nomination.id}><header><div><span className="eyebrow">НОМИНАЦИЯ {String(nominationIndex + 1).padStart(2, '0')} / {String(data.nominations.length).padStart(2, '0')}</span><h2>{nomination.title}</h2><p>{nomination.description}</p></div><span className={`nomination-state ${open ? 'open' : ''}`}>{open ? 'Открыта' : nomination.unavailableReason ?? 'Недоступна'}</span></header>
        {nomination.id === 'custom-award' ? <form className={`custom-award-form ${confirmation === `custom:${nomination.id}` ? 'just-confirmed' : ''}`} onSubmit={event => { event.preventDefault(); void saveProposal(nomination); }}>
          <div className="custom-award-intro"><Sparkles size={30} /><div><b>Придумай собственную награду</b><span>Предложение видишь только ты и команда церемонии. До закрытия голосования его можно обновлять.</span></div></div>
          <label htmlFor="custom-award-title">Название награды <span>{[...awardTitle].length}/80</span></label>
          <input id="custom-award-title" value={awardTitle} onChange={event => setAwardTitle(event.target.value)} maxLength={80} placeholder="Например: Легендарный камбэк года" required disabled={!open || pending === nomination.id} />
          <label htmlFor="custom-award-recipient">Кому вручить <span>{[...recipient].length}/120</span></label>
          <input id="custom-award-recipient" value={recipient} onChange={event => setRecipient(event.target.value)} maxLength={120} placeholder="Ник, имя или название команды" required disabled={!open || pending === nomination.id} />
          {proposal?.status === 'excluded' && <p className="form-error" role="status">Предложение исключено модератором. Изменение текста не снимает ограничение.</p>}
          <button className="button primary" disabled={!open || pending === nomination.id}>{pending === nomination.id ? 'СОХРАНЯЕМ…' : proposal ? 'ОБНОВИТЬ ПРЕДЛОЖЕНИЕ' : 'СОХРАНИТЬ ПРЕДЛОЖЕНИЕ'}</button>
        </form> : <>
          {nomination.candidates.length ? <div className={`voting-grid ${nomination.candidates.length > 6 ? 'many' : ''}`}>{nomination.candidates.map((candidate, index) => {
            const nominee = nomineeFor(candidate); const isSelected = selected === candidate.id; const hasVideo = Boolean(nominee.videos?.length);
            return <article className={`voting-card ${isSelected ? 'selected' : ''} ${confirmation === `vote:${nomination.id}:${candidate.id}` ? 'just-confirmed' : ''}`} key={candidate.id}>
              <div className="voting-media"><MediaView nominee={nominee} contain={localCategory.kind === 'poster'} /><i>{String(index + 1).padStart(2, '0')}</i></div>
              <div className="voting-card-copy"><h3>{candidate.name}</h3>{candidate.twitchLogin && <a href={`https://twitch.tv/${candidate.twitchLogin}`} target="_blank" rel="noreferrer">@{candidate.twitchLogin}</a>}</div>
              {hasVideo && <button className="clip-watch-button" onClick={() => setViewer({ category: localCategory, nominee })}><Play size={17} fill="currentColor" /> Смотреть клип</button>}
              <button className={`vote-choice ${isSelected ? 'chosen' : ''}`} disabled={!open || pending === nomination.id} onClick={() => void choose(nomination, candidate.id)}>{isSelected ? <><Check size={18} /> Мой голос</> : <>Выбрать <ChevronRight size={18} /></>}</button>
            </article>;
          })}</div> : <div className="candidates-pending"><span>КАНДИДАТЫ ФОРМИРУЮТСЯ</span><h3>{nomination.id === 'chatter' ? 'Кандидаты формируются по предложениям зрителей' : 'Список появится перед открытием голосования'}</h3></div>}
          {nomination.id === 'chatter' && data.voting.chatterFreeInput && open && <form className="free-chatter" onSubmit={event => { event.preventDefault(); void choose(nomination, undefined, freeLogin); }}><label htmlFor="chatter-login">Twitch-ник кандидата</label><div><input id="chatter-login" value={freeLogin} onChange={event => setFreeLogin(event.target.value)} placeholder="username" required /><button className="button primary" disabled={pending === nomination.id}>Проверить и выбрать</button></div></form>}
        </>}
      </section>;
    })}</div>
    <p className="privacy-note">Мы получаем только данные профиля, необходимые для голосования. <a href="/privacy">Как используются данные</a>.</p>
  </main>{viewer && <VideoPlayerModal category={viewer.category} nominee={viewer.nominee} onClose={() => setViewer(null)} />}</Layout>;
}
