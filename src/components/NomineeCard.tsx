import type { CSSProperties } from 'react';
import { ExternalLink } from 'lucide-react';
import type { Category, Nominee } from '../data/awards';
import { MediaView } from './MediaView';
export function NomineeCard({ nominee, category, index, playable = false }: { nominee: Nominee; category: Category; index: number; playable?: boolean }) {
  const safeClip = nominee.clipUrl && /^https?:\/\//i.test(nominee.clipUrl) ? nominee.clipUrl : undefined;
  return <article className={`nominee-card ${category.kind} ${!nominee.name ? 'empty' : ''}`} style={{ '--order': index } as CSSProperties} data-testid="nominee-card">
    <div className="nominee-media"><MediaView nominee={nominee} contain={category.kind === 'meme' || category.kind === 'poster'} playable={playable} /><span className="card-index">{String(index + 1).padStart(2, '0')}</span></div>
    <div className="nominee-caption"><h3 title={nominee.name} className={nominee.name.length > 16 ? 'long-name' : ''}>{nominee.name || `Номинант ${String(index + 1).padStart(2, '0')}`}</h3>{nominee.description && <p>{nominee.description}</p>}{!nominee.name && <span>Будет представлен на церемонии</span>}{safeClip && <a href={safeClip} target="_blank" rel="noreferrer">Смотреть клип <ExternalLink size={13} /></a>}</div>
  </article>;
}
