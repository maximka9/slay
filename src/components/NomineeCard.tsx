import type { CSSProperties } from 'react';
import { ExternalLink, Play } from 'lucide-react';
import type { Category, Nominee } from '../data/awards';
import { MediaView } from './MediaView';
export function NomineeCard({ nominee, category, index, playable = false, onOpen }: { nominee: Nominee; category: Category; index: number; playable?: boolean; onOpen?: (nominee: Nominee) => void }) {
  const safeClip = nominee.clipUrl && /^https?:\/\//i.test(nominee.clipUrl) ? nominee.clipUrl : undefined;
  const interactive = Boolean(onOpen && nominee.name && (nominee.media?.src || nominee.videos?.length));
  const open = () => { if (interactive) onOpen?.(nominee); };
  return <article className={`nominee-card ${category.kind} ${!nominee.name ? 'empty' : ''} ${interactive ? 'interactive' : ''}`} style={{ '--order': index } as CSSProperties} data-testid="nominee-card" data-has-video={Boolean(nominee.videos?.length)} role={interactive ? 'button' : undefined} tabIndex={interactive ? 0 : undefined} aria-label={interactive ? `${nominee.videos?.length ? 'Смотреть видео' : 'Увеличить изображение'}: ${nominee.name}` : undefined} onClick={open} onKeyDown={event => { if (interactive && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); open(); } }}>
    <div className="nominee-media"><MediaView nominee={nominee} contain={category.kind === 'meme' || category.kind === 'poster'} playable={playable} />{Boolean(nominee.videos?.length) && <span className="card-play" aria-hidden="true"><Play fill="currentColor" /></span>}<span className="card-index">{String(index + 1).padStart(2, '0')}</span></div>
    <div className="nominee-caption"><h3 title={nominee.name} className={nominee.name.length > 16 ? 'long-name' : ''}>{nominee.name || `Номинант ${String(index + 1).padStart(2, '0')}`}</h3>{nominee.description && <p>{nominee.description}</p>}{!nominee.name && <span>Будет представлен на церемонии</span>}{safeClip && <a href={safeClip} target="_blank" rel="noreferrer" onClick={event => event.stopPropagation()}>Смотреть клип <ExternalLink size={13} /></a>}</div>
  </article>;
}
