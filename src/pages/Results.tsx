import { Link } from 'react-router-dom';
import { ArrowLeft, LockKeyhole, Trophy as TrophyIcon } from 'lucide-react';
import { awards } from '../data/awards';
import { getWinner } from '../data/scenes';
import { Layout } from '../components/Layout';
import { Trophy } from '../components/Trophy';
import { MediaView } from '../components/MediaView';
import { NomineeCard } from '../components/NomineeCard';
export function Results() {
  if (!awards.ceremonyPublished) return <Layout><main className="archive-locked"><Trophy small /><div className="eyebrow"><LockKeyhole size={15} /> CAMCA63 AWARDS 2026</div><h1>Архив церемонии<br />пока недоступен</h1><p>Здесь сохранится история нашего года.</p><Link to="/" className="button outline"><ArrowLeft size={17} /> На главную</Link></main></Layout>;
  return <Layout><main className="results-page"><div className="eyebrow">ВЫБОР КОМЬЮНИТИ / 2026</div><h1 className="sport-title">НАШИ <em>ПОБЕДИТЕЛИ</em></h1><p className="page-intro">Люди и моменты, которые сделали этот год особенным.</p>{awards.categories.map(category => {
    const winner = getWinner(category);
    return <section className="result-category" key={category.id}><h2>{category.title}</h2><p>{category.intro}</p>{winner ? <div className="result-winner"><div className="result-winner-media"><MediaView nominee={winner} contain={category.kind === 'meme' || category.kind === 'poster'} playable /></div><div><span className="eyebrow"><TrophyIcon size={17} /> ПОБЕДИТЕЛЬ</span><h3>{winner.name}</h3>{winner.description && <p>{winner.description}</p>}</div></div> : <p className="result-pending">Результат не опубликован</p>}{category.nominees.length > 0 && <><h3 className="nominees-label">Номинанты</h3><div className="archive-nominees">{category.nominees.map((n, i) => <NomineeCard nominee={n} category={category} index={i} key={n.id} playable />)}</div></>}</section>;
  })}</main></Layout>;
}
