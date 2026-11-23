import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, Maximize, Minimize, Pause, Play, RefreshCcw, SkipForward, Volume1, Volume2, VolumeX, X } from 'lucide-react';
import type { Category, Nominee } from '../data/awards';

type Transition = { remaining: number; nextLabel: string; paused: boolean };
type VideoDimensions = { width: number; height: number };

const TRANSITION_DELAY_MS = 2000;
const SEEK_STEP_SECONDS = 5;
const SOUND_STORAGE_KEY = 'camca63-player-sound';

type SoundSettings = { volume: number; muted: boolean };

// Громкость и «без звука» запоминаются между роликами и открытиями плеера.
function readSound(): SoundSettings {
  try {
    const saved = JSON.parse(window.localStorage.getItem(SOUND_STORAGE_KEY) ?? 'null') as Partial<SoundSettings> | null;
    const volume = typeof saved?.volume === 'number' && saved.volume >= 0 && saved.volume <= 1 ? saved.volume : 1;
    return { volume, muted: saved?.muted === true };
  } catch {
    return { volume: 1, muted: false };
  }
}

function saveSound(sound: SoundSettings) {
  try { window.localStorage.setItem(SOUND_STORAGE_KEY, JSON.stringify(sound)); } catch { /* приватный режим — не страшно */ }
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, '0')}`;
}

export function VideoPlayerModal({ category, nominee, onClose }: { category: Category; nominee: Nominee; onClose: () => void }) {
  const [videoIndex, setVideoIndex] = useState(0);
  const [transition, setTransition] = useState<Transition | null>(null);
  const [completed, setCompleted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [sound, setSound] = useState<SoundSettings>(readSound);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffering, setBuffering] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState('');
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [closing, setClosing] = useState(false);
  const [videoDimensions, setVideoDimensions] = useState<VideoDimensions | null>(null);
  const [frameSize, setFrameSize] = useState<VideoDimensions | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | null>(null);
  const returnFocusFrame = useRef<number | null>(null);
  const returnFocus = useRef<HTMLElement | null>(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const videos = nominee.videos ?? [];
  const currentVideo = videos[videoIndex];
  const isImage = videos.length === 0;
  const hasPlaylist = videos.length > 1;
  const muted = sound.muted || sound.volume === 0;

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
    setCurrentTime(0);
    setDuration(0);
  }, []);

  const next = useCallback(() => openTarget(nextTarget()), [nextTarget, openTarget]);
  const previous = useCallback(() => {
    if (videoIndex > 0) openTarget({ videoIndex: videoIndex - 1, label: videos[videoIndex - 1].label });
  }, [openTarget, videoIndex, videos]);

  // «Сначала»: если ролик уже на экране — просто перематываем в начало.
  // Раньше здесь сбрасывался флаг готовности, а событие loadeddata для уже загруженного
  // ролика больше не приходит — отсюда бесконечное «ЗАГРУЖАЕМ ВИДЕО».
  const restart = useCallback(() => {
    setTransition(null);
    setError('');
    setAutoplayBlocked(false);
    const player = videoRef.current;
    if (videoIndex === 0 && player && !completed) {
      player.currentTime = 0;
      setCurrentTime(0);
      void player.play().catch(() => setAutoplayBlocked(true));
      return;
    }
    // Плейлист завершён или открыт другой ролик — монтируем первый заново, он загрузится сам.
    setCompleted(false);
    setVideoReady(false);
    setCurrentTime(0);
    setDuration(0);
    if (videoIndex !== 0) {
      setVideoIndex(0);
      setVideoDimensions(null);
      setFrameSize(null);
    }
  }, [completed, videoIndex]);

  const seekTo = useCallback((seconds: number) => {
    const player = videoRef.current;
    if (!player || !Number.isFinite(player.duration)) return;
    const target = Math.min(player.duration, Math.max(0, seconds));
    player.currentTime = target;
    setCurrentTime(target);
  }, []);

  const toggleMute = useCallback(() => {
    // Если громкость на нуле, «включить звук» возвращает её на половину.
    setSound(current => current.muted || current.volume === 0
      ? { muted: false, volume: current.volume === 0 ? 0.5 : current.volume }
      : { ...current, muted: true });
  }, []);

  const changeVolume = useCallback((volume: number) => {
    setSound({ volume, muted: volume === 0 });
  }, []);

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

  // На весь экран разворачиваем окно плеера целиком, чтобы наша панель управления оставалась видна.
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
      return;
    }
    const dialog = dialogRef.current;
    if (dialog?.requestFullscreen) void dialog.requestFullscreen().catch(() => undefined);
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
    if (returnFocusFrame.current !== null) window.cancelAnimationFrame(returnFocusFrame.current);
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
      returnFocusFrame.current = window.requestAnimationFrame(() => returnFocus.current?.focus());
    };
  }, []);

  useEffect(() => () => {
    videoRef.current?.pause();
  }, []);

  // Звук применяется к элементу video и запоминается — кнопка и реальный звук всегда совпадают.
  useEffect(() => {
    const player = videoRef.current;
    if (player) {
      player.volume = sound.volume;
      player.muted = sound.muted;
    }
    saveSound(sound);
  }, [sound, videoIndex, completed, transition]);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === dialogRef.current && dialogRef.current !== null);
    document.addEventListener('fullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      if (document.fullscreenElement && document.fullscreenElement === dialogRef.current) void document.exitFullscreen().catch(() => undefined);
    };
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
      if (event.key === 'Tab') {
        const dialog = dialogRef.current;
        const focusable = dialog ? [...dialog.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter(element => !element.hasAttribute('hidden')) : [];
        if (!focusable.length) {
          event.preventDefault();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && (document.activeElement === first || !dialog?.contains(document.activeElement))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !dialog?.contains(document.activeElement))) {
          event.preventDefault();
          first.focus();
        }
        return;
      }
      // Ползунки (перемотка, громкость) сами обрабатывают стрелки.
      if (event.target instanceof HTMLInputElement && event.target.type === 'range' && ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
      if ([' ', 'ArrowRight', 'ArrowLeft', 'm', 'M', 'ь', 'Ь', 'f', 'F', 'а', 'А', 'Escape'].includes(event.key)) event.preventDefault();
      if (event.key === 'Escape') { if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined); else requestClose(); }
      else if (!isImage && event.key === ' ') togglePlay();
      // Стрелки: в плейлисте — соседний ролик, у одиночного клипа — перемотка на 5 секунд.
      else if (!isImage && event.key === 'ArrowRight') { if (hasPlaylist) next(); else seekTo((videoRef.current?.currentTime ?? 0) + SEEK_STEP_SECONDS); }
      else if (!isImage && event.key === 'ArrowLeft') { if (hasPlaylist) previous(); else seekTo((videoRef.current?.currentTime ?? 0) - SEEK_STEP_SECONDS); }
      else if (!isImage && ['m', 'M', 'ь', 'Ь'].includes(event.key)) toggleMute();
      else if (!isImage && ['f', 'F', 'а', 'А'].includes(event.key)) toggleFullscreen();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [hasPlaylist, isImage, next, previous, requestClose, seekTo, toggleFullscreen, toggleMute, togglePlay]);

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

  const volumeIcon = muted ? <VolumeX /> : sound.volume < 0.5 ? <Volume1 /> : <Volume2 />;
  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const volumePercent = muted ? 0 : Math.round(sound.volume * 100);
  const showVideo = !transition && !completed;

  return createPortal(<div className={`media-modal ${closing ? 'is-closing' : ''}`} role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) requestClose(); }}>
    <div ref={dialogRef} className={`media-dialog ${isImage ? 'image-dialog' : 'video-dialog'} ${fullscreen ? 'is-fullscreen' : ''}`} role="dialog" aria-modal="true" aria-labelledby="media-dialog-title">
      <header className="media-dialog-header">
        <div><span>{category.title}</span><h2 id="media-dialog-title">{nominee.name}</h2>{hasPlaylist && <p>Видео {videoIndex + 1} из {videos.length} · {currentVideo?.label}</p>}</div>
        <button ref={closeRef} className="media-close" onClick={requestClose} aria-label="Закрыть просмотр"><X /></button>
      </header>
      {isImage ? <div className="image-viewer"><img src={nominee.media?.src} alt={nominee.media?.alt || nominee.name} /></div> : <>
        <div className="video-stage" ref={stageRef} data-video-width={videoDimensions?.width} data-video-height={videoDimensions?.height}>
          {transition ? <div className="video-intermission" role="status"><span>СЛЕДУЮЩИЙ РОЛИК</span><h3>{transition.nextLabel}</h3><b>{Math.ceil(transition.remaining / 1000)}</b><button onClick={togglePlay}>{transition.paused ? <Play /> : <Pause />}{transition.paused ? 'Продолжить отсчёт' : 'Приостановить отсчёт'}</button></div>
            : completed ? <div className="video-intermission completed" role="status"><span>{hasPlaylist ? 'ПЛЕЙЛИСТ ЗАВЕРШЁН' : 'РОЛИК ЗАКОНЧИЛСЯ'}</span><h3>{nominee.name}</h3><button onClick={restart}><RefreshCcw /> Смотреть ещё раз</button></div>
              : <div className="video-frame" style={frameSize ? { width: frameSize.width, height: frameSize.height } : undefined}>
                {/* Свои элементы управления вместо встроенных: звук, перемотка и полный экран всегда синхронизированы с кнопками. */}
                <video key={currentVideo?.src} ref={videoRef} src={currentVideo?.src} poster={nominee.media?.src} preload="metadata" playsInline
                  onClick={togglePlay} onDoubleClick={toggleFullscreen}
                  onLoadedMetadata={event => {
                    const player = event.currentTarget;
                    player.volume = sound.volume;
                    player.muted = sound.muted;
                    setVideoDimensions({ width: player.videoWidth, height: player.videoHeight });
                    setDuration(Number.isFinite(player.duration) ? player.duration : 0);
                  }}
                  onDurationChange={event => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
                  onTimeUpdate={event => setCurrentTime(event.currentTarget.currentTime)}
                  onLoadedData={() => setVideoReady(true)}
                  onCanPlay={() => { setVideoReady(true); setBuffering(false); }}
                  onPlaying={() => { setVideoReady(true); setBuffering(false); }}
                  onWaiting={() => setBuffering(true)}
                  onSeeked={() => { setVideoReady(true); setBuffering(false); }}
                  onVolumeChange={event => {
                    const player = event.currentTarget;
                    setSound(current => current.volume === player.volume && current.muted === player.muted ? current : { volume: player.volume, muted: player.muted });
                  }}
                  onPlay={() => { setPlaying(true); setAutoplayBlocked(false); }} onPause={() => setPlaying(false)} onEnded={ended}
                  onError={() => { setVideoReady(false); setBuffering(false); setError(hasPlaylist ? 'Не удалось загрузить этот ролик. Попробуйте ещё раз или перейдите к следующему.' : 'Не удалось загрузить этот ролик. Попробуйте ещё раз.'); }} />
              </div>}
          {/* Если браузер заблокировал автозапуск, вместо вечной «загрузки» показываем кнопку запуска. */}
          {showVideo && !videoReady && !autoplayBlocked && !error && <div className="video-loading" role="status">{nominee.media?.src && <img src={nominee.media.src} alt="" />}<span aria-hidden="true" /><b>ЗАГРУЖАЕМ ВИДЕО</b></div>}
          {showVideo && videoReady && buffering && !error && <div className="video-buffering" aria-hidden="true"><span /></div>}
          {error && <div className="video-error" role="alert"><span>{error}</span><div><button onClick={retryCurrent}><RefreshCcw /> Повторить</button>{nextTarget() && <button onClick={next}>Следующий ролик</button>}</div></div>}
          {autoplayBlocked && showVideo && <button className="autoplay-start" onClick={togglePlay}><Play /> Запустить видео</button>}
        </div>
        <div className="video-progress">
          <span className="video-time">{formatTime(currentTime)}</span>
          <input type="range" className="video-seek" aria-label="Перемотка" min={0} max={duration || 0} step={0.1} value={Math.min(currentTime, duration || 0)}
            disabled={!showVideo || !duration} style={{ '--fill': `${progress}%` } as CSSProperties}
            aria-valuetext={`${formatTime(currentTime)} из ${formatTime(duration)}`}
            onChange={event => seekTo(Number(event.currentTarget.value))} />
          <span className="video-time">{formatTime(duration)}</span>
        </div>
        <div className="video-controls-row">
          {hasPlaylist && <button onClick={previous} aria-label="Предыдущее видео" disabled={videoIndex === 0}><ChevronLeft /></button>}
          <button className="primary-control" onClick={togglePlay}>{control.icon}{control.label}</button>
          <button onClick={restart}><RefreshCcw /> Сначала</button>
          {hasPlaylist && <button onClick={next} disabled={videoIndex + 1 >= videos.length}>Следующее <SkipForward /></button>}
          <div className="video-sound">
            <button onClick={toggleMute} aria-label={muted ? 'Включить звук' : 'Выключить звук'} aria-pressed={muted}>{volumeIcon}</button>
            <input type="range" className="video-volume" aria-label="Громкость" min={0} max={1} step={0.05} value={muted ? 0 : sound.volume}
              aria-valuetext={`${volumePercent}%`} style={{ '--fill': `${volumePercent}%` } as CSSProperties}
              onChange={event => changeVolume(Number(event.currentTarget.value))} />
          </div>
          <button className="video-fullscreen" onClick={toggleFullscreen} aria-label="Полноэкранное видео" aria-pressed={fullscreen}>{fullscreen ? <Minimize /> : <Maximize />}</button>
        </div>
      </>}
    </div>
  </div>, document.body);
}
