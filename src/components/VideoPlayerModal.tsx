import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Maximize, Pause, Play, RefreshCcw, SkipForward, Volume2, VolumeX, X } from 'lucide-react';
import type { Category, Nominee } from '../data/awards';

type Transition = { remaining: number; nextLabel: string; paused: boolean };

export function VideoPlayerModal({ category, nominee, onClose }: { category: Category; nominee: Nominee; onClose: () => void }) {
  const videoNominees = useMemo(() => category.nominees.filter(item => item.videos?.length), [category.nominees]);
  const [activeId, setActiveId] = useState(nominee.id);
  const [videoIndex, setVideoIndex] = useState(0);
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [playAll, setPlayAll] = useState(false);
  const [delay, setDelay] = useState(3);
  const [transition, setTransition] = useState<Transition | null>(null);
  const [completed, setCompleted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState('');
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const activeNominee = category.nominees.find(item => item.id === activeId) ?? nominee;
  const videos = activeNominee.videos ?? [];
  const currentVideo = videos[videoIndex];
  const isImage = videos.length === 0;

  const nextTarget = useCallback(() => {
    if (videoIndex + 1 < videos.length) return { nomineeId: activeNominee.id, videoIndex: videoIndex + 1, label: videos[videoIndex + 1].label };
    if (playAll) {
      const nomineeIndex = videoNominees.findIndex(item => item.id === activeNominee.id);
      const nextNominee = videoNominees[nomineeIndex + 1];
      if (nextNominee?.videos?.length) return { nomineeId: nextNominee.id, videoIndex: 0, label: `${nextNominee.name} — ${nextNominee.videos[0].label}` };
    }
    return null;
  }, [activeNominee.id, playAll, videoIndex, videoNominees, videos]);

  const openTarget = useCallback((target: ReturnType<typeof nextTarget>) => {
    if (!target) { setCompleted(true); setPlaying(false); return; }
    setActiveId(target.nomineeId);
    setVideoIndex(target.videoIndex);
    setTransition(null);
    setCompleted(false);
    setError('');
    setAutoplayBlocked(false);
  }, []);

  const next = useCallback(() => openTarget(nextTarget()), [nextTarget, openTarget]);
  const previous = useCallback(() => {
    if (videoIndex > 0) { openTarget({ nomineeId: activeNominee.id, videoIndex: videoIndex - 1, label: videos[videoIndex - 1].label }); return; }
    if (!playAll) return;
    const nomineeIndex = videoNominees.findIndex(item => item.id === activeNominee.id);
    const previousNominee = videoNominees[nomineeIndex - 1];
    if (previousNominee?.videos?.length) openTarget({ nomineeId: previousNominee.id, videoIndex: previousNominee.videos.length - 1, label: previousNominee.videos.at(-1)!.label });
  }, [activeNominee.id, openTarget, playAll, videoIndex, videoNominees, videos]);

  const togglePlay = useCallback(() => {
    if (transition) { setTransition(current => current ? { ...current, paused: !current.paused } : current); return; }
    if (completed) { setCompleted(false); setVideoIndex(0); return; }
    const player = videoRef.current;
    if (!player) return;
    if (player.paused) void player.play().catch(() => setAutoplayBlocked(true));
    else player.pause();
  }, [completed, transition]);

  const requestVideoFullscreen = useCallback(() => {
    const player = videoRef.current;
    if (player?.requestFullscreen) void player.requestFullscreen();
  }, []);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);

  useEffect(() => {
    if (!currentVideo || transition || completed) return;
    const player = videoRef.current;
    if (!player) return;
    player.load();
    void player.play().then(() => setAutoplayBlocked(false)).catch(() => setAutoplayBlocked(true));
  }, [activeId, completed, currentVideo, transition, videoIndex]);

  useEffect(() => {
    if (!transition || transition.paused) return;
    if (transition.remaining <= 0) { openTarget(nextTarget()); return; }
    const timer = window.setTimeout(() => setTransition(current => current ? { ...current, remaining: Math.max(0, current.remaining - 100) } : current), 100);
    return () => window.clearTimeout(timer);
  }, [nextTarget, openTarget, transition]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      event.stopPropagation();
      if ([' ', 'ArrowRight', 'ArrowLeft', 'm', 'M', 'f', 'F', 'а', 'А', 'p', 'P', 'з', 'З', 'Escape'].includes(event.key)) event.preventDefault();
      if (event.key === 'Escape') onClose();
      else if (!isImage && event.key === ' ') togglePlay();
      else if (!isImage && event.key === 'ArrowRight') next();
      else if (!isImage && event.key === 'ArrowLeft') previous();
      else if (!isImage && ['m', 'M', 'ь', 'Ь'].includes(event.key)) setMuted(value => !value);
      else if (!isImage && ['f', 'F', 'а', 'А'].includes(event.key)) requestVideoFullscreen();
      else if (!isImage && ['p', 'P', 'з', 'З'].includes(event.key)) setAutoAdvance(value => !value);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [isImage, next, onClose, previous, requestVideoFullscreen, togglePlay]);

  const ended = () => {
    setPlaying(false);
    const target = nextTarget();
    if (!autoAdvance || !target) { setCompleted(true); return; }
    if (delay === 0) { openTarget(target); return; }
    setTransition({ remaining: delay * 1000, nextLabel: target.label, paused: false });
  };

  const restart = () => {
    setCompleted(false); setTransition(null); setError('');
    const player = videoRef.current;
    if (player) { player.currentTime = 0; void player.play().catch(() => setAutoplayBlocked(true)); }
  };

  return <div className="media-modal" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="media-dialog" role="dialog" aria-modal="true" aria-labelledby="media-dialog-title" ref={modalRef}>
      <header className="media-dialog-header">
        <div><span>{category.title}</span><h2 id="media-dialog-title">{activeNominee.name}</h2>{!isImage && <p>Видео {videoIndex + 1} из {videos.length} · {currentVideo?.label}</p>}</div>
        <button ref={closeRef} className="media-close" onClick={onClose} aria-label="Закрыть просмотр"><X /></button>
      </header>
      {isImage ? <div className="image-viewer"><img src={activeNominee.media?.src} alt={activeNominee.media?.alt || activeNominee.name} /></div> : <>
        <div className="video-stage">
          {transition ? <div className="video-intermission" role="status"><span>СЛЕДУЮЩИЙ РОЛИК</span><h3>{transition.nextLabel}</h3><b>{Math.ceil(transition.remaining / 1000)}</b><button onClick={togglePlay}>{transition.paused ? <Play /> : <Pause />}{transition.paused ? 'Продолжить отсчёт' : 'Приостановить отсчёт'}</button></div>
            : completed ? <div className="video-intermission completed"><span>ПРОСМОТР ЗАВЕРШЁН</span><h3>{activeNominee.name}</h3><button onClick={restart}><RefreshCcw /> Смотреть ещё раз</button></div>
              : <video key={currentVideo?.src} ref={videoRef} src={currentVideo?.src} poster={activeNominee.media?.src} controls preload="metadata" playsInline muted={muted} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={ended} onError={() => setError('Не удалось загрузить этот ролик. Проверьте файл и попробуйте следующий.')} />}
          {error && <div className="video-error" role="alert">{error}<button onClick={next}>Следующий ролик</button></div>}
          {autoplayBlocked && !transition && !completed && <button className="autoplay-start" onClick={togglePlay}><Play /> Запустить видео</button>}
        </div>
        <div className="video-controls-row">
          <button onClick={previous} aria-label="Предыдущее видео" disabled={videoIndex === 0 && (!playAll || videoNominees.findIndex(item => item.id === activeNominee.id) === 0)}><ChevronLeft /></button>
          <button className="primary-control" onClick={togglePlay}>{playing && !transition ? <Pause /> : <Play />}{playing && !transition ? 'Пауза' : 'Воспроизвести'}</button>
          <button onClick={restart}><RefreshCcw /> Сначала</button>
          <button onClick={next}>Следующее <SkipForward /></button>
          <button onClick={() => setMuted(value => !value)} aria-label={muted ? 'Включить звук' : 'Выключить звук'}>{muted ? <VolumeX /> : <Volume2 />}</button>
          <button onClick={requestVideoFullscreen} aria-label="Полноэкранное видео"><Maximize /></button>
        </div>
        <div className="playlist-settings">
          <label><input type="checkbox" checked={autoAdvance} onChange={event => setAutoAdvance(event.target.checked)} /> Автопереключение</label>
          <label>Пауза между роликами <select value={delay} onChange={event => setDelay(Number(event.target.value))}>{[0, 2, 3, 5, 10].map(value => <option value={value} key={value}>{value} сек.</option>)}</select></label>
          <label><input type="checkbox" checked={playAll} onChange={event => setPlayAll(event.target.checked)} /> Продолжить по всей номинации</label>
          <span><kbd>Space</kbd> пауза · <kbd>←</kbd><kbd>→</kbd> ролики · <kbd>M</kbd> звук · <kbd>F</kbd> экран · <kbd>P</kbd> авто · <kbd>Esc</kbd> закрыть</span>
        </div>
      </>}
    </div>
  </div>;
}
