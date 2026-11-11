import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, ChevronLeft, ChevronRight, Maximize, Minimize, Settings2, X, RotateCcw, Trophy as TrophyIcon, Grid2X2, EyeOff } from 'lucide-react';
import { awards, type AwardsConfig, type Category, type Nominee } from '../data/awards';
import { createScenes, getWinner, readReveals } from '../data/scenes';
import { Brand } from '../components/Brand';
import { Trophy } from '../components/Trophy';
import { CategoryIcon } from '../components/Icons';
import { NomineeCard } from '../components/NomineeCard';
import { MediaView } from '../components/MediaView';
import { VideoPlayerModal } from '../components/VideoPlayerModal';
import { useAuth } from '../components/AuthProvider';
import { api } from '../lib/api';

const REVEALS_KEY = 'camca63-reveals-2026';
const number = (n: number) => String(n).padStart(2, '0');
function safeRead(key: string) { try { return sessionStorage.getItem(key); } catch { return null; } }

type CeremonyWinner = { nominationId: string; candidateId: string; name: string; imageUrl: string };
type CeremonyProblem = { nominationId: string | null; nominationTitle: string | null; code: string; message: string };
type NoWinner = { nominationId: string; title: string; reason: string };

export function Present() {
  const auth = useAuth();
  const [config, setConfig] = useState<AwardsConfig | null>(null);
  const [loadError, setLoadError] = useState('');
  const [readinessProblems, setReadinessProblems] = useState<CeremonyProblem[]>([]);
  const rehearsal = new URLSearchParams(window.location.search).get('rehearsal') === '1';
  useEffect(() => {
    if (auth.loading) return;
    if (!auth.authenticated || !auth.isAdmin) {
      if (import.meta.env.DEV) setConfig(awards);
      return;
    }
    if (rehearsal) { setConfig(structuredClone(awards)); return; }
    api<{ ready: boolean; winners: CeremonyWinner[]; noWinners: NoWinner[]; problems: CeremonyProblem[] }>('/api/admin/ceremony').then(result => {
      if (!result.ready) { setReadinessProblems(result.problems); return; }
      const next = structuredClone(awards);
      for (const winner of result.winners) {
        const category = next.categories.find(item => item.id === winner.nominationId);
        if (!category) continue;
        const nominee = category.nominees.find(item => item.id === winner.candidateId);
        if (nominee) category.winnerId = nominee.id;
        else category.winner = { id: winner.candidateId, name: winner.name, media: winner.imageUrl ? { src: winner.imageUrl, alt: winner.name } : undefined };
      }
      for (const item of result.noWinners) {
        const category = next.categories.find(entry => entry.id === item.nominationId);
        if (category) category.winner = { id: `no-winner-${item.nominationId}`, name: 'Без победителя', description: item.reason };
      }
      setConfig(next);
    }).catch(error => setLoadError(error instanceof Error ? error.message : 'Не удалось загрузить результаты церемонии.'));
  }, [auth.authenticated, auth.isAdmin, auth.loading, rehearsal]);
  if (auth.loading || (auth.authenticated && auth.isAdmin && !config && !loadError && !readinessProblems.length)) return <main className="present-access"><Trophy small /><h1>Подготавливаем церемонию</h1></main>;
  if (!auth.authenticated && !import.meta.env.DEV) return <main className="present-access"><Trophy small /><h1>Режим церемонии защищён</h1><p>Войдите через Twitch-аккаунт владельца канала.</p><a className="button primary" href={auth.loginUrl('/present')}>Войти через Twitch</a></main>;
  if (!auth.isAdmin && !import.meta.env.DEV) return <main className="present-access"><Trophy small /><h1>Доступ запрещён</h1><p>Управлять церемонией может только camca63.</p><Link className="button outline" to="/">На главную</Link></main>;
  if (loadError) return <main className="present-access"><Trophy small /><h1>Результаты недоступны</h1><p>{loadError}</p><button className="button primary" onClick={() => window.location.reload()}>Повторить</button></main>;
  if (readinessProblems.length) return <main className="present-access"><Trophy small /><h1>Церемония не готова</h1><ul className="ceremony-problems">{readinessProblems.map(problem => <li key={`${problem.code}-${problem.nominationId ?? 'global'}`}>{problem.message}</li>)}</ul><div className="access-actions"><Link className="button primary" to="/admin">Исправить в админ-панели</Link><Link className="button outline" to="/present?rehearsal=1">Открыть репетицию</Link></div></main>;
  return <PresentStage config={config ?? awards} rehearsal={rehearsal} />;
}

function PresentStage({ config: awards, rehearsal = false }: { config: AwardsConfig; rehearsal?: boolean }) {
  const scenes = createScenes(awards);
  const [params, setParams] = useSearchParams();
  const rawScene = Number(params.get('scene') ?? 1);
  const current = Number.isFinite(rawScene) ? Math.min(scenes.length - 1, Math.max(0, Math.trunc(rawScene) - 1)) : 0;
  const scene = scenes[current];
  const category = awards.categories.find(c => c.id === scene.categoryId);
  const [reveals, setReveals] = useState(() => readReveals(safeRead(REVEALS_KEY), awards));
  const [phase, setPhase] = useState<'idle' | 'revealing'>('idle');
  const [notice, setNotice] = useState('');
  const [settings, setSettings] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [lowEffects, setLowEffects] = useState(() => safeRead('camca63-low-effects') === 'true');
  const [clean, setClean] = useState(false);
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement));
  const [viewer, setViewer] = useState<{ category: Category; nominee: Nominee } | null>(null);
  const revealTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const transitionLock = useRef(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const settingsButton = useRef<HTMLButtonElement>(null);
  const revealedWinner = category ? getWinner(category) : undefined;
  const revealed = Boolean(category && revealedWinner && reveals[category.id] === revealedWinner.id);

  useEffect(() => { try { sessionStorage.setItem(REVEALS_KEY, JSON.stringify(reveals)); } catch { /* Private browser: in-memory state remains usable. */ } }, [reveals]);
  useEffect(() => { try { sessionStorage.setItem('camca63-low-effects', String(lowEffects)); } catch { /* optional preference */ } }, [lowEffects]);
  useEffect(() => { setNotice(''); setPhase('idle'); setViewer(null); clearTimeout(revealTimer.current); }, [current]);
  useEffect(() => () => clearTimeout(revealTimer.current), []);
  useEffect(() => {
    const update = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);
  useEffect(() => {
    if (settings) dialogRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, [settings]);

  const jump = useCallback((next: number) => {
    if (phase === 'revealing' || Date.now() < transitionLock.current) return;
    if (next < 0 || next >= scenes.length) return;
    transitionLock.current = Date.now() + 420;
    setParams({ scene: String(next + 1) });
  }, [phase, setParams]);
  const advance = useCallback(() => {
    if (phase === 'revealing') return;
    if (scene.type === 'winner' && !revealed) {
      setNotice('Сначала объявите победителя. Для репетиции без результата используйте «Пропустить сцену».');
      return;
    }
    jump(current + 1);
  }, [current, jump, revealed, scene.type, phase]);
  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch { setNotice('Полноэкранный режим недоступен. Используйте полноэкранный режим браузера.'); }
  }, []);
  const reveal = useCallback(() => {
    if (!category || scene.type !== 'winner' || revealed || phase === 'revealing') return;
    const winner = getWinner(category);
    if (!winner) { setNotice(rehearsal ? 'Репетиция: реальный победитель не загружен.' : 'Победитель не определён в зафиксированных результатах. Вернитесь в админ-панель.'); return; }
    setNotice(''); setPhase('revealing');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    revealTimer.current = setTimeout(() => {
      setReveals(prev => ({ ...prev, [category.id]: winner.id }));
      setNotice('');
      setPhase('idle');
    }, reduced || lowEffects ? 150 : 2000);
  }, [category, scene.type, revealed, phase, lowEffects]);
  const closeSettings = () => { setSettings(false); setConfirmReset(false); requestAnimationFrame(() => settingsButton.current?.focus()); };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (viewer) return;
      if (event.key === 'Escape') { setSettings(false); setConfirmReset(false); setClean(false); return; }
      if (settings || event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
      if (event.target instanceof HTMLElement && (event.target.closest('input, textarea, select, [contenteditable="true"]') || (event.target.closest('button, a, video') && [' ', 'Enter'].includes(event.key)))) return;
      const actions: Record<string, () => void> = {
        ArrowRight: advance, PageDown: advance, ' ': advance,
        ArrowLeft: () => jump(current - 1), PageUp: () => jump(current - 1),
        Home: () => jump(0), End: () => jump(scenes.length - 1),
        Enter: reveal, f: () => void toggleFullscreen(), F: () => void toggleFullscreen(),
        'а': () => void toggleFullscreen(), 'А': () => void toggleFullscreen(),
        h: () => setClean(c => !c), H: () => setClean(c => !c),
      };
      if (actions[event.key]) { event.preventDefault(); actions[event.key](); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [advance, current, jump, reveal, settings, toggleFullscreen, viewer]);

  function nomineeScene(c: Category) {
    if (c.kind === 'chatter') return <div className="nominees-scene chatter-scene">
      <div className="scene-heading"><div><div className="eyebrow">НОМИНАЦИЯ {number(awards.categories.indexOf(c) + 1)} <span>/ {number(awards.categories.length)}</span></div><h1 className="sport-title">{c.title}</h1><p>{c.intro}</p></div><div className="scene-category-mark"><CategoryIcon name={c.icon} size={44} /></div></div>
      <div className="chatter-stage" aria-label="Тематическая сцена Twitch-чата">
        <div className="chat-orbit" aria-hidden="true"><span /><span /><span /></div>
        <div className="chat-window" aria-hidden="true">
          <div className="chat-window-bar"><i /><i /><i /><b>CAMCA63 / CHAT</b></div>
          <div className="chat-lines"><span><i>01</i><b>КОМЬЮНИТИ</b><em>тот самый голос в чате</em></span><span><i>02</i><b>2026</b><em>история, которую пишем вместе</em></span><span><i>03</i><b>ЧАТТЕР ГОДА</b><em>выбор зрителей</em></span></div>
        </div>
        <div className="chatter-statement"><span className="eyebrow">ЧАТТЕР ГОДА / 2026</span><h2>ГЛАВНЫЙ ГОЛОС<br /><em>НАШЕГО ЧАТА</em></h2><p>Тот, кто сделал этот год частью истории комьюнити.</p></div>
      </div>
    </div>;
    const nominees = c.nominees;
    return <div className={`nominees-scene ${c.id}`}><div className="scene-heading"><div><div className="eyebrow">НОМИНАЦИЯ {number(awards.categories.indexOf(c) + 1)} <span>/ {number(awards.categories.length)}</span></div><h1 className="sport-title">{c.title}</h1><p>{c.intro}</p></div><div className="scene-category-mark"><CategoryIcon name={c.icon} size={44} /></div></div>
      <div className="nominees-meta"><span>НОМИНАНТЫ</span><span>{nominees.length} номинантов</span></div>
      <div className={`nominee-grid media-grid ${nominees.length > 4 ? 'many-items' : ''}`} style={{ '--count': nominees.length } as React.CSSProperties}>{nominees.map((n, i) => <NomineeCard key={n.id} nominee={n} category={c} index={i} playable={c.kind === 'clip'} onOpen={nominee => setViewer({ category: c, nominee })} />)}</div>
    </div>;
  }

  return <div className={`presentation ${lowEffects ? 'low-effects' : ''} ${clean ? 'clean-mode' : ''} ${phase}`}>
    <header className="present-header"><Brand /><span className="present-header-label">{scene.type === 'final' ? 'ДО ВСТРЕЧИ НА СТРИМАХ' : 'ИТОГИ ГОДА · ВЫБОР КОМЬЮНИТИ'}</span><span className="edition">2026 <span className="status-dot" /></span></header>
    <main className="scene-viewport" aria-label={`Сцена ${current + 1} из ${scenes.length}`}>
      <div className={`scene scene-${scene.type}`} key={scene.id}>
        {scene.type === 'cover' && <div className="present-cover"><div><div className="eyebrow"><span className="status-dot" /> ЭТО НАШ ГОД. ЭТО НАША ПРЕМИЯ.</div><h1 className="hero-title"><span>CAMCA63</span><span className="outlined">AWARDS</span><span className="year">2026</span></h1><div className="hero-tagline">ИТОГИ ГОДА <span> / </span> ВЫБОР КОМЬЮНИТИ</div><button className="button primary" onClick={advance}>Начать церемонию <ArrowRight size={19} /></button></div><Trophy /></div>}
        {scene.type === 'program' && <div className="program-scene"><div className="eyebrow">ПРОГРАММА ЦЕРЕМОНИИ</div><h1 className="sport-title">{awards.categories.length} НОМИНАЦИЙ. <em>НАШ ГОД.</em></h1><p>Люди, игры и моменты, которые сделали этот год особенным.</p><div className="program-grid">{awards.categories.map((c, i) => <button key={c.id} onClick={() => jump(scenes.findIndex(s => s.categoryId === c.id))}><span className="program-number">{number(i + 1)}</span><CategoryIcon name={c.icon} /><span>{c.title}</span><ArrowUpRightIcon /></button>)}</div></div>}
        {scene.type === 'nominees' && category && nomineeScene(category)}
        {scene.type === 'winner' && category && <div className={`winner-scene ${revealed ? 'is-revealed' : ''}`}><div className="winner-heading"><div className="eyebrow">ВЫБОР КОМЬЮНИТИ <span>/ {number(awards.categories.indexOf(category) + 1)}</span></div><h1 className="sport-title">{category.title}</h1></div>{revealed ? <div className="winner-result" data-testid="winner-result"><div className="winner-photo"><MediaView nominee={getWinner(category)!} contain={category.kind === 'chatter' || category.kind === 'meme' || category.kind === 'poster'} playable /><div className="winner-seal"><TrophyIcon size={24} /></div></div><div className="winner-copy"><span className="winner-label"><TrophyIcon size={18} /> ПОБЕДИТЕЛЬ 2026</span><h2>{getWinner(category)!.name}</h2><p>{getWinner(category)!.description || 'Этот момент — твой. Эта награда — от комьюнити.'}</p><span className="winner-signature">CAMCA63 AWARDS / ВЫБОР КОМЬЮНИТИ</span></div></div> : <div className="winner-waiting"><Trophy small /><p className="reveal-tease">{phase === 'revealing' ? 'И ПОБЕДИТЕЛЕМ СТАНОВИТСЯ…' : 'ОДНА НОМИНАЦИЯ. ОДНО ИМЯ.'}</p><button className="button primary reveal-button" onClick={reveal} disabled={phase === 'revealing'}><TrophyIcon size={20} />{phase === 'revealing' ? 'Момент триумфа…' : 'Объявить победителя'}<span className="keycap">↵</span></button>{phase === 'idle' && <button className="skip-button" onClick={() => jump(current + 1)}>Пропустить сцену</button>}</div>}</div>}
        {scene.type === 'final' && <div className="final-scene"><div className="eyebrow">CAMCA63 AWARDS / 2026</div><h1 className="hero-title"><span>ЭТО БЫЛ</span><span className="outlined">НАШ ГОД.</span></h1><p>Спасибо каждому, кто был частью camca63.</p><span className="final-signoff">ДО ВСТРЕЧИ НА СТРИМАХ <span>↗</span></span><div className="final-actions"><Link to="/" className="button outline"><ArrowLeft size={17} /> На главную</Link>{awards.ceremonyPublished && <Link to="/results" className="button primary">Итоги церемонии <ArrowRight size={17} /></Link>}</div></div>}
      </div>
    </main>
    {notice && <div className="present-notice" role="status">{notice}<button aria-label="Закрыть подсказку" onClick={() => setNotice('')}><X size={16} /></button></div>}
    <footer className="present-footer"><div className="progress-controls"><button className="icon-button" aria-label="Предыдущая сцена" onClick={() => jump(current - 1)} disabled={current === 0 || phase === 'revealing'}><ChevronLeft size={20} /></button><span className="scene-counter"><b>{number(current + 1)}</b> / {number(scenes.length)}</span><button className="icon-button" aria-label="Следующая сцена" onClick={advance} disabled={current === scenes.length - 1 || phase === 'revealing'}><ChevronRight size={20} /></button></div><div className="scene-track">{scenes.map((s, i) => <button key={s.id} className={`${i === current ? 'active' : ''} ${i < current ? 'visited' : ''}`} aria-label={`Сцена ${i + 1}: ${s.categoryId ? awards.categories.find(c => c.id === s.categoryId)?.title : s.type === 'cover' ? 'Обложка' : s.type === 'program' ? 'Программа' : 'Финал'}${s.type === 'winner' ? ' — победитель' : ''}`} aria-current={i === current ? 'step' : undefined} disabled={phase === 'revealing'} onClick={() => jump(i)} />)}</div><div className="presentation-tools"><button className="icon-button" aria-label="Скрыть управление" title="Скрыть управление (H)" onClick={() => setClean(true)}><EyeOff size={18} /></button><button className="icon-button" aria-label="Настройки церемонии" onClick={() => setSettings(true)} ref={settingsButton}><Settings2 size={18} /></button><button className="fullscreen-button" onClick={() => void toggleFullscreen()}>{fullscreen ? <Minimize size={17} /> : <Maximize size={17} />}<span>{fullscreen ? 'Выйти из полноэкранного' : 'На весь экран'}</span><kbd>F</kbd></button></div></footer>
    {clean && <button className="show-controls" aria-label="Показать управление" onClick={() => setClean(false)}><Settings2 size={18} /></button>}
    {viewer && <VideoPlayerModal category={viewer.category} nominee={viewer.nominee} onClose={() => setViewer(null)} />}
    {settings && <div className="modal-backdrop" onClick={closeSettings}><div className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title" ref={dialogRef} onClick={e => e.stopPropagation()} onKeyDown={e => {
      if (e.key !== 'Tab') return;
      const elements = dialogRef.current?.querySelectorAll<HTMLElement>('button, a, input');
      if (!elements?.length) return;
      const first = elements[0], last = elements[elements.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }}><div className="dialog-title"><h2 id="settings-title">Пульт церемонии</h2><button className="icon-button" aria-label="Закрыть настройки" onClick={closeSettings}><X size={20} /></button></div><p>Подготовьте эфир так, как удобно вам.</p><label className="setting-row"><span>Облегчённые эффекты<small>Меньше анимации для захвата в OBS</small></span><input type="checkbox" checked={lowEffects} onChange={e => setLowEffects(e.target.checked)} /></label><div className="keyboard-guide"><span>Следующая сцена <kbd>→ / Space</kbd></span><span>Предыдущая сцена <kbd>←</kbd></span><span>Объявить победителя <kbd>Enter</kbd></span><span>Начало / финал <kbd>Home / End</kbd></span><span>Полный экран <kbd>F</kbd></span><span>Скрыть управление <kbd>H</kbd></span></div><div className="settings-actions"><button className="button outline" onClick={() => { closeSettings(); jump(1); }}><Grid2X2 size={17} /> Программа</button><Link to="/" className="button outline"><ArrowLeft size={17} /> Обзор</Link></div>{confirmReset ? <div className="reset-confirm"><p>Сбросить все раскрытия и вернуться к началу? Победители в конфиге сохранятся.</p><button className="button primary" onClick={() => { setReveals({}); clearTimeout(revealTimer.current); setPhase('idle'); setParams({ scene: '1' }); closeSettings(); }}><Check size={17} /> Да, сбросить</button><button className="button text-button" onClick={() => setConfirmReset(false)}>Отмена</button></div> : <button className="reset-button" onClick={() => setConfirmReset(true)}><RotateCcw size={16} /> Сбросить раскрытия</button>}</div></div>}
  </div>;
}
function ArrowUpRightIcon() { return <ArrowRight className="program-arrow" size={17} />; }
