import { Link, useLocation } from 'react-router-dom';
import { ArrowUpRight, LogIn } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Brand } from './Brand';
import { useAuth } from './AuthProvider';
export function Layout({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const location = useLocation();
  const navRef = useRef<HTMLElement>(null);
  const [indicator, setIndicator] = useState({ x: 0, width: 0, ready: false });
  const activeItem = location.pathname === '/vote' ? 'vote'
    : location.pathname === '/results' ? 'results'
      : location.pathname === '/admin' ? 'admin'
        : location.pathname === '/awards' || (location.pathname === '/' && location.hash === '#nominations') ? 'nominations'
          : location.pathname === '/' ? 'home' : '';
  const measureIndicator = useCallback(() => {
    const nav = navRef.current;
    const active = nav?.querySelector<HTMLElement>('[data-nav-active="true"]');
    if (!nav || !active) { setIndicator(value => ({ ...value, ready: false })); return; }
    const navRect = nav.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    const next = { x: activeRect.left - navRect.left + nav.scrollLeft, width: activeRect.width, ready: true };
    setIndicator(value => value.x === next.x && value.width === next.width && value.ready ? value : next);
  }, [activeItem]);
  useLayoutEffect(() => {
    measureIndicator();
    const nav = navRef.current;
    if (!nav) return;
    const observer = new ResizeObserver(measureIndicator);
    observer.observe(nav);
    nav.querySelectorAll('a').forEach(link => observer.observe(link));
    nav.addEventListener('scroll', measureIndicator, { passive: true });
    window.addEventListener('resize', measureIndicator);
    return () => { observer.disconnect(); nav.removeEventListener('scroll', measureIndicator); window.removeEventListener('resize', measureIndicator); };
  }, [auth.isAdmin, measureIndicator]);
  useEffect(() => {
    if (location.pathname !== '/') return;
    const timer = window.requestAnimationFrame(() => {
      if (location.hash === '#nominations') document.getElementById('nominations')?.scrollIntoView();
      else window.scrollTo({ top: 0, left: 0 });
    });
    return () => window.cancelAnimationFrame(timer);
  }, [location.hash, location.pathname]);
  const navLink = (id: string, to: string, label: string) => <Link to={to} className={activeItem === id ? 'active' : ''} data-nav-active={activeItem === id} aria-current={activeItem === id ? 'page' : undefined}>{label}</Link>;
  return <div className="site-shell"><header className="site-header"><Brand /><nav ref={navRef} aria-label="Основная навигация">{navLink('home', '/', 'Главная')}{navLink('nominations', '/#nominations', 'Номинации')}{navLink('vote', '/vote', 'Голосование')}{navLink('results', '/results', 'Итоги')}{auth.isAdmin && navLink('admin', '/admin', 'Админ')}<span className={`nav-indicator ${indicator.ready ? 'ready' : ''}`} style={{ '--nav-x': `${indicator.x}px`, '--nav-width': `${indicator.width}px` } as CSSProperties} aria-hidden="true" /></nav>{auth.authenticated && auth.user ? <Link className="header-profile" to={auth.isAdmin ? '/admin' : '/vote'}><img src={auth.user.avatarUrl} alt="" /><span>{auth.user.displayName}</span></Link> : <a className="channel-link" href={auth.loginUrl('/vote')}><LogIn size={16} /> ВОЙТИ ЧЕРЕЗ TWITCH</a>}</header>{children}<footer className="site-footer"><Brand /><span>ЭТОТ ГОД МЫ СОЗДАЛИ ВМЕСТЕ.</span><Link to="/privacy">Данные и конфиденциальность <ArrowUpRight size={15} /></Link></footer></div>;
}
