import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, LockKeyhole, Trophy as TrophyIcon } from 'lucide-react';
import { awards, type Category, type Nominee } from '../data/awards';
import { getWinner } from '../data/scenes';
import { Layout } from '../components/Layout';
import { Trophy } from '../components/Trophy';
import { MediaView } from '../components/MediaView';
import { NomineeCard } from '../components/NomineeCard';
import { VideoPlayerModal } from '../components/VideoPlayerModal';
import { api } from '../lib/api';

type PublishedEntry = { candidateId: string; name: string; imageUrl: string; votes: number; percent: number; rank: number; isWinner: boolean; awardTitle?: string; authorLogin?: string };
type PublishedNomination = { id: string; title: string; description: string; totalVotes: number; entries: PublishedEntry[] };
type PublishedResults = { published: boolean; nominations: PublishedNomination[] };

function localResults(): PublishedResults {
  if (!awards.ceremonyPublished) return { published: false, nominations: [] };
  return { published: true, nominations: awards.categories.flatMap(category => {
    const winner = getWinner(category); if (!winner) return [];
    return [{ id: category.id, title: category.title, description: category.intro, totalVotes: 0, entries: [{ candidateId: winner.id, name: winner.name, imageUrl: winner.media?.src ?? '', votes: 0, percent: 0, rank: 1, isWinner: true }] }];
  }) };
}
function nomineeFor(entry: PublishedEntry): Nominee {
  return awards.categories.flatMap(category => category.nominees).find(nominee => nominee.id === entry.candidateId) ?? { id: entry.candidateId, name: entry.name, awardTitle: entry.awardTitle, authorLogin: entry.authorLogin, media: entry.imageUrl ? { src: entry.imageUrl, alt: entry.name } : undefined };
}

export function Results() {
  const [results, setResults] = useState<PublishedResults | null>(null);
  const [viewer, setViewer] = useState<{ category: Category; nominee: Nominee } | null>(null);
  useEffect(() => { api<PublishedResults>('/api/results').then(setResults).catch(() => setResults(import.meta.env.DEV ? localResults() : { published: false, nominations: [] })); }, []);
  if (!results) return <Layout><main className="archive-locked"><Trophy small /><h1>Загружаем итоги</h1></main></Layout>;
  if (!results.published) return <Layout><main className="archive-locked"><Trophy small /><div className="eyebrow"><LockKeyhole size={15} /> CAMCA63 AWARDS 2026</div><h1>Итоги CAMCA63 AWARDS 2026<br />будут опубликованы после церемонии награждения</h1><p>Победители остаются скрытыми до решения ведущего.</p><Link to="/" className="button outline"><ArrowLeft size={17} /> На главную</Link></main></Layout>;
  return <Layout><main className="results-page"><div className="eyebrow">ВЫБОР КОМЬЮНИТИ / 2026</div><h1 className="sport-title">НАШИ <em>ПОБЕДИТЕЛИ</em></h1><p className="page-intro">Опубликованные результаты CAMCA63 AWARDS 2026.</p>{results.nominations.map(nomination => {
    const staticCategory = awards.categories.find(category => category.id === nomination.id) ?? { id: nomination.id, title: nomination.title, intro: nomination.description, kind: 'frame' as const, icon: 'sparkles' as const, nominees: [], winnerId: null };
    const winnerEntry = nomination.entries.find(entry => entry.isWinner); const winner = winnerEntry ? nomineeFor(winnerEntry) : null;
    return <section className="result-category" key={nomination.id}><h2>{nomination.title}</h2><p>{nomination.description}</p>{winner && winnerEntry ? <div className="result-winner"><div className="result-winner-media"><MediaView nominee={winner} contain={staticCategory.kind === 'poster'} playable /></div><div><span className="eyebrow"><TrophyIcon size={17} /> {winnerEntry.awardTitle || 'ПОБЕДИТЕЛЬ'}</span><h3>{winner.name}</h3><p>{nomination.id === 'custom-award' ? winnerEntry.authorLogin ? `Предложил: @${winnerEntry.authorLogin}` : 'Награда от зрителя' : `${winnerEntry.votes} голосов · ${winnerEntry.percent.toLocaleString('ru-RU')}%`}</p></div></div> : <p className="result-pending">Победитель ещё не опубликован</p>}
      <h3 className="nominees-label">Итоговый рейтинг · {nomination.totalVotes} голосов</h3><div className="published-ranking">{nomination.entries.map(entry => <div key={entry.candidateId} className={entry.isWinner ? 'winner' : ''}><b>{entry.rank}</b><span>{entry.name}</span><i><em style={{ width: `${entry.percent}%` }} /></i><strong>{entry.votes} · {entry.percent.toLocaleString('ru-RU')}%</strong></div>)}</div>
      <div className="archive-nominees">{nomination.entries.map((entry, index) => <NomineeCard nominee={nomineeFor(entry)} category={staticCategory} index={index} key={entry.candidateId} playable onOpen={nominee => setViewer({ category: staticCategory, nominee })} />)}</div>
    </section>;
  })}</main>{viewer && <VideoPlayerModal category={viewer.category} nominee={viewer.nominee} onClose={() => setViewer(null)} />}</Layout>;
}
