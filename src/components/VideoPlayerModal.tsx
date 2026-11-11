import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, Maximize, Pause, Play, RefreshCcw, SkipForward, Volume2, VolumeX, X } from 'lucide-react';
import type { Category, Nominee } from '../data/awards';

type Transition = { remaining: number; nextLabel: string; paused: boolean };
type VideoDimensions = { width: number; height: number };

const TRANSITION_DELAY_MS = 2000;

export function VideoPlayerModal({ category, nominee, onClose }: { category: Category; nominee: Nominee; onClose: () => void }) {
  const [videoIndex, setVideoIndex] = useState(0);
  const [transition, setTransition] = useState<Transition | null>(null);
  const [completed, setCompleted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState('');
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [closing, setClosing] = useState(false);
  const [videoDimensions, setVideoDimensions] = useState<VideoDimensions | null>(null);
  const [frameSize, setFrameSize] = useState<VideoDimensions | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | null>(null);
  const returnFocus = useRef<HTMLElement | null>(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const videos = nominee.videos ?? [];
  const currentVideo = videos[videoIndex];
  const isImage = videos.length === 0;

  const requestClose = useCallback(() => {
    if (closing) return;
    videoRef.current?.pause();
    setTransition(null);
    setPlaying(false);
    setClosing(true);
    closeTimer.current = window.setTimeout(onClose, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180);
  }, [closing, onClose]);

  const nextTarget = useCallback(() => {
    if (videoIndex + 1 >= videos.length) return null;
    return { videoIndex: videoIndex + 1, label: videos[videoIndex + 1].label };
  }, [videoIndex, videos]);

  const openTarget = useCallback((target: ReturnType<typeof nextTarget>) => {
    if (!target) {
      setTransition(null);
      setCompleted(true);
      setPlaying(false);
      return;
    }
    setVideoIndex(target.videoIndex);
    setTransition(null);
    setCompleted(false);
    setError('');
    setAutoplayBlocked(false);
    setVideoReady(false);
    setVideoDimensions(null);
    setFrameSize(null);
  }, []);

  const next = useCallback(() => openTarget(nextTarget()), [nextTarget, openTarget]);
  const previous = useCallback(() => {
    if (videoIndex > 0) openTarget({ videoIndex: videoIndex - 1, label: videos[videoIndex - 1].label });
  }, [openTarget, videoIndex, videos]);

  const restart = useCallback(() => {
    setCompleted(false);
    setTransition(null);
    setError('');
    setAutoplayBlocked(false);
    setVideoReady(false);
    if (videoIndex !== 0) {
      setVideoIndex(0);
      setVideoDimensions(null);
      setFrameSize(null);
      return;
    }
    const player = videoRef.current;
    if (player) {
      player.currentTime = 0;
      void player.play().catch(() => setAutoplayBlocked(true));
    }
  }, [videoIndex]);

  const togglePlay = useCallback(() => {
    if (transition) {
      setTransition(current => current ? { ...current, paused: !current.paused } : current);
      return;
    }
    if (completed) {
      restart();
      return;
    }
    const player = videoRef.current;
    if (!player) return;
    if (player.paused) void player.play().catch(() => setAutoplayBlocked(true));
    else player.pause();
  }, [completed, restart, transition]);

  const requestVideoFullscreen = useCallback(() => {
    const player = videoRef.current;
    if (player?.requestFullscreen) void player.requestFullscreen();
  }, []);

  const retryCurrent = useCallback(() => {
    const player = videoRef.current;
    if (!player) return;
    setError('');
    setVideoReady(false);
    setAutoplayBlocked(false);
    player.load();
    void player.play().catch(() => setAutoplayBlocked(true));
  }, []);

  useEffect(() => {
    const scroll = { x: window.scrollX, y: window.scrollY };
    const previous = {
      bodyOverflow: document.body.style.overflow,
      bodyPaddingRight: document.body.style.paddingRight,
      rootOverflow: document.documentElement.style.overflow,
    };
    const scrollbar = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    if (scrollbar) document.body.style.paddingRight = `${scrollbar}px`;
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previous.bodyOverflow;
      document.body.style.paddingRight = previous.bodyPaddingRight;
      document.documentElement.style.overflow = previous.rootOverflow;
      window.scrollTo(scroll.x, scroll.y);
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
      window.requestAnimationFrame(() => returnFocus.current?.focus());
    };
  }, []);

  useEffect(() => () => {
    videoRef.current?.pause();
  }, []);

  useEffect(() => {
    if (closing || !currentVideo || transition || completed) return;
    const player = videoRef.current;
    if (!player) return;
    setVideoReady(false);
    player.load();
    void player.play().then(() => setAutoplayBlocked(false)).catch(() => setAutoplayBlocked(true));
  }, [closing, completed, currentVideo, transition, videoIndex]);

  useEffect(() => {
    if (!transition || transition.paused) return;
    if (transition.remaining <= 0) {
      openTarget(nextTarget());
      return;
    }
    const timer = window.setTimeout(() => {
      setTransition(current => current ? { ...current, remaining: Math.max(0, current.remaining - 100) } : current);
    }, 100);
    return () => window.clearTimeout(timer);
  }, [nextTarget, openTarget, transition]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !videoDimensions) {
      setFrameSize(null);
      return;
    }
    const fitVideo = () => {
      const availableWidth = stage.clientWidth;
      const availableHeight = stage.clientHeight;
      if (!availableWidth || !availableHeight) return;
      const ratio = videoDimensions.width / videoDimensions.height;
      let width = availableWidth;
      let height = width / ratio;
      if (height > availableHeight) {
        height = availableHeight;
        width = height * ratio;
      }
      setFrameSize({ width: Math.floor(width), height: Math.floor(height) });
    };
    fitVideo();
    const observer = new ResizeObserver(fitVideo);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [videoDimensions]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      event.stopPropagation();
      if ([' ', 'ArrowRight', 'ArrowLeft', 'm', 'M', 'f', 'F', 'а', 'А', 'Escape'].includes(event.key)) event.preventDefault();
      if (event.key === 'Escape') requestClose();
      else if (!isImage && event.key === ' ') togglePlay();
      else if (!isImage && event.key === 'ArrowRight') next();
      else if (!isImage && event.key === 'ArrowLeft') previous();
      else if (!isImage && ['m', 'M', 'ь', 'Ь'].includes(event.key)) setMuted(value => !value);
      else if (!isImage && ['f', 'F', 'а', 'А'].includes(event.key)) requestVideoFullscreen();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [isImage, next, previous, requestClose, requestVideoFullscreen, togglePlay]);

  const ended = () => {
    setPlaying(false);
    const target = nextTarget();
    if (!target) {
      setCompleted(true);
      return;
    }
    setTransition({ remaining: TRANSITION_DELAY_MS, nextLabel: target.label, paused: false });
  };

  const control = transition
    ? { icon: transition.paused ? <Play /> : <Pause />, label: transition.paused ? 'Продолжить отсчёт' : 'Приостановить отсчёт' }
    : completed
      ? { icon: <Play />, label: 'Смотреть снова' }
      : { icon: playing ? <Pause /> : <Play />, label: playing ? 'Пауза' : 'Воспроизвести' };

  return createPortal(<div className={`media-modal ${closing ? 'is-closing' : ''}`} role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) requestClose(); }}>
    <div className={`media-dialog ${isImage ? 'image-dialog' : 'video-dialog'}`} role="dialog" aria-modal="true" aria-labelledby="media-dialog-title">
      <header className="media-dialog-header">
        <div><span>{category.title}</span><h2 id="media-dialog-title">{nominee.name}</h2>{!isImage && <p>Видео {videoIndex + 1} из {videos.length} · {currentVideo?.label}</p>}</div>
        <button ref={closeRef} className="media-close" onClick={requestClose} aria-label="Закрыть просмотр"><X /></button>
      </header>
      {isImage ? <div className="image-viewer"><img src={nominee.media?.src} alt={nominee.media?.alt || nominee.name} /></div> : <>
        <div className="video-stage" ref={stageRef} data-video-width={videoDimensions?.width} data-video-height={videoDimensions?.height}>
          {transition ? <div className="video-intermission" role="status"><span>СЛЕДУЮЩИЙ РОЛИК</span><h3>{transition.nextLabel}</h3><b>{Math.ceil(transition.remaining / 1000)}</b><button onClick={togglePlay}>{transition.paused ? <Play /> : <Pause />}{transition.paused ? 'Продолжить отсчёт' : 'Приостановить отсчёт'}</button></div>
            : completed ? <div className="video-intermission completed" role="status"><span>ПЛЕЙЛИСТ ЗАВЕРШЁН</span><h3>{nominee.name}</h3><button onClick={restart}><RefreshCcw /> Смотреть ещё раз</button></div>
              : <div className="video-frame" style={frameSize ? { width: frameSize.width, height: frameSize.height } : undefined}>
                <video key={currentVideo?.src} ref={videoRef} src={currentVideo?.src} poster={nominee.media?.src} controls preload="metadata" playsInline muted={muted}
                  onLoadedMetadata={event => setVideoDimensions({ width: event.currentTarget.videoWidth, height: event.currentTarget.videoHeight })}
                  onLoadedData={() => setVideoReady(true)}
                  onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={ended}
                  onError={() => { setVideoReady(false); setError('Не удалось загрузить этот ролик. Попробуйте ещё раз или перейдите к следующему.'); }} />
              </div>}
          {!transition && !completed && !videoReady && !error && <div className="video-loading" role="status">{nominee.media?.src && <img src={nominee.media.src} alt="" />}<span aria-hidden="true" /><b>ЗАГРУЖАЕМ ВИДЕО</b></div>}
          {error && <div className="video-error" role="alert"><span>{error}</span><div><button onClick={retryCurrent}><RefreshCcw /> Повторить</button>{nextTarget() && <button onClick={next}>Следующий ролик</button>}</div></div>}
          {autoplayBlocked && !transition && !completed && <button className="autoplay-start" onClick={togglePlay}><Play /> Запустить видео</button>}
        </div>
        <div className="video-controls-row">
          <button onClick={previous} aria-label="Предыдущее видео" disabled={videoIndex === 0}><ChevronLeft /></button>
          <button className="primary-control" onClick={togglePlay}>{control.icon}{control.label}</button>
          <button onClick={restart}><RefreshCcw /> Сначала</button>
          <button onClick={next}>Следующее <SkipForward /></button>
          <button onClick={() => setMuted(value => !value)} aria-label={muted ? 'Включить звук' : 'Выключить звук'}>{muted ? <VolumeX /> : <Volume2 />}</button>
          <button onClick={requestVideoFullscreen} aria-label="Полноэкранное видео"><Maximize /></button>
          <span className="video-shortcuts"><kbd>Space</kbd> пауза · <kbd>←</kbd><kbd>→</kbd> ролики · <kbd>M</kbd> звук · <kbd>F</kbd> экран · <kbd>Esc</kbd> закрыть</span>
        </div>
      </>}
    </div>
  </div>, document.body);
}
