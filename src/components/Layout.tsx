import { NavLink, Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Brand } from './Brand';
export function Layout({ children }: { children: ReactNode }) {
  return <div className="site-shell"><header className="site-header"><Brand /><nav aria-label="Основная навигация"><NavLink to="/" end>Главная</NavLink><a href="/#nominations">Номинации</a><NavLink to="/results">Итоги</NavLink></nav><a className="channel-link" href="https://www.twitch.tv/camca63" target="_blank" rel="noreferrer"><span className="status-dot" /> TWITCH / CAMCA63 <ArrowUpRight size={16} /></a></header>{children}<footer className="site-footer"><Brand /><span>ЭТОТ ГОД МЫ СОЗДАЛИ ВМЕСТЕ.</span><Link to="/present">Перейти к церемонии <ArrowUpRight size={15} /></Link></footer></div>;
}
