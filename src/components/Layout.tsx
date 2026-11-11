import { NavLink, Link } from 'react-router-dom';
import { ArrowUpRight, LogIn } from 'lucide-react';
import type { ReactNode } from 'react';
import { Brand } from './Brand';
import { useAuth } from './AuthProvider';
export function Layout({ children }: { children: ReactNode }) {
  const auth = useAuth();
  return <div className="site-shell"><header className="site-header"><Brand /><nav aria-label="Основная навигация"><NavLink to="/" end>Главная</NavLink><a href="/#nominations">Номинации</a><NavLink to="/vote">Голосование</NavLink><NavLink to="/results">Итоги</NavLink>{auth.isAdmin && <NavLink to="/admin">Админ</NavLink>}</nav>{auth.authenticated && auth.user ? <Link className="header-profile" to={auth.isAdmin ? '/admin' : '/vote'}><img src={auth.user.avatarUrl} alt="" /><span>{auth.user.displayName}</span></Link> : <a className="channel-link" href={auth.loginUrl('/vote')}><LogIn size={16} /> ВОЙТИ ЧЕРЕЗ TWITCH</a>}</header>{children}<footer className="site-footer"><Brand /><span>ЭТОТ ГОД МЫ СОЗДАЛИ ВМЕСТЕ.</span><Link to="/privacy">Данные и конфиденциальность <ArrowUpRight size={15} /></Link></footer></div>;
}
