import { useState } from 'react';
import { Image, Play } from 'lucide-react';
import type { Nominee } from '../data/awards';
export function MediaView({ nominee, contain = false, playable = false }: { nominee: Nominee; contain?: boolean; playable?: boolean }) {
  const [failed, setFailed] = useState<string | null>(null);
  const media = nominee.media;
  const source = media?.type === 'video' && !playable ? media.poster : media?.src;
  if (!media || !source || failed === source) return <div className="media-placeholder" role="img" aria-label={nominee.name ? `Изображение ${nominee.name} отсутствует` : 'Материал пока не добавлен'}>
    {nominee.name ? <span className="initials">{nominee.name.slice(0, 2).toUpperCase()}</span> : <><Image size={28} strokeWidth={1} /><span>СКОРО НА СЦЕНЕ</span></>}
  </div>;
  if (media.type === 'video' && playable) return <video src={source} poster={media.poster} controls preload="none" playsInline onError={() => setFailed(source)} aria-label={media.alt || nominee.name} />;
  return <><img src={source} alt={media.alt || nominee.name} className={contain ? 'contain' : ''} onError={() => setFailed(source)} draggable={false} />{media.type === 'video' && <Play className="video-mark" aria-hidden="true" />}</>;
}
