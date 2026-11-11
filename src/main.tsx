import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import '@fontsource/exo-2/cyrillic-900-italic.css';
import '@fontsource/exo-2/latin-900-italic.css';
import '@fontsource/manrope/cyrillic-400.css';
import '@fontsource/manrope/latin-400.css';
import '@fontsource/manrope/cyrillic-600.css';
import '@fontsource/manrope/latin-600.css';
import '@fontsource/manrope/cyrillic-800.css';
import '@fontsource/manrope/latin-800.css';
import './styles/main.css';
import { awards } from './data/awards';
import { validateConfig } from './data/scenes';
import { Overview } from './pages/Overview';
import { Present } from './pages/Present';
import { Results } from './pages/Results';
import { Vote } from './pages/Vote';
import { Admin } from './pages/Admin';
import { Privacy } from './pages/Privacy';
import { AuthProvider } from './components/AuthProvider';
const errors = validateConfig(awards);
function PageTransition({ children }: { children: ReactNode }) {
  const location = useLocation();
  return <div className="page-transition" key={location.pathname}>{children}</div>;
}
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><BrowserRouter><AuthProvider>{errors.length ? <main className="config-error"><h1>Проверьте конфигурацию церемонии</h1><ul>{errors.map((e, i) => <li key={i}>{e}</li>)}</ul><p>Исправьте данные в src/data/awards.ts и обновите страницу.</p></main> : <Routes><Route path="/" element={<PageTransition><Overview /></PageTransition>} /><Route path="/awards" element={<PageTransition><Overview /></PageTransition>} /><Route path="/vote" element={<PageTransition><Vote /></PageTransition>} /><Route path="/admin" element={<Admin />} /><Route path="/privacy" element={<PageTransition><Privacy /></PageTransition>} /><Route path="/present" element={<Present />} /><Route path="/results" element={<PageTransition><Results /></PageTransition>} /><Route path="*" element={<main className="not-found"><span className="eyebrow">CAMCA63 / 404</span><h1>Этой сцены нет в программе</h1><Link className="button primary" to="/">На главную</Link></main>} /></Routes>}</AuthProvider></BrowserRouter></React.StrictMode>);
