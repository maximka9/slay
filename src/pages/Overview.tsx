import { Link } from 'react-router-dom';
import { ArrowRight, ArrowDown, ArrowUpRight, Play, Sparkles } from 'lucide-react';
import { useEffect, useRef, type CSSProperties } from 'react';
import { awards } from '../data/awards';
import { createScenes } from '../data/scenes';
import { Layout } from '../components/Layout';
import { Trophy } from '../components/Trophy';
import { CategoryIcon } from '../components/Icons';
export function Overview() {
  const scenes = createScenes(awards);
  const nominationsRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const cards = [...(nominationsRef.current?.querySelectorAll<HTMLElement>('[data-reveal-card]') ?? [])];
    if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      cards.forEach(card => card.classList.add('is-visible'));
      return;
    }
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        (entry.target as HTMLElement).classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.14, rootMargin: '0px 0px -7% 0px' });
    cards.forEach(card => observer.observe(card));
    return () => observer.disconnect();
  }, []);
  return <Layout><main>
    <section className="hero">
      <div className="hero-grid" aria-hidden="true" /><span className="hero-side-label">COMMUNITY. MOMENTS. LEGENDS.</span>
      <div className="hero-copy"><div className="eyebrow"><span className="status-dot" /> ГЛАВНАЯ ПРЕМИЯ КОМЬЮНИТИ</div>
        <h1 className="hero-title"><span>CAMCA63</span><span className="outlined">AWARDS<span className="title-star">✦</span></span><span className="year">2026<span className="year-line" /></span></h1>
        <div className="hero-tagline">ИТОГИ ГОДА <span> / </span> ВЫБОР КОМЬЮНИТИ</div>
        <p className="hero-description">Люди, игры и моменты, ради которых<br className="desktop-break" /> мы снова нажимали «Смотреть».</p>
        <div className="hero-actions"><Link className="button primary" to="/vote"><Play size={17} fill="currentColor" /> Перейти к голосованию <ArrowUpRight size={19} /></Link><a className="button text-button" href="#nominations">Все номинации <ArrowDown size={17} /></a></div>
        <div className="hero-note"><span className="mini-line" /> ОДИН КАНАЛ. ОДНО КОМЬЮНИТИ. НАШ ГОД.</div>
      </div>
      <div className="hero-visual"><div className="visual-corner">ЕЖЕГОДНАЯ ПРЕМИЯ<span>EST. BY COMMUNITY</span></div><Trophy /><div className="trophy-caption"><span>ВЫБОР ТЕХ, КТО БЫЛ РЯДОМ</span><b>THE COMMUNITY AWARD</b></div></div>
    </section>
    <div className="ribbon"><span><Sparkles size={17} /> ВСПОМНИМ ЛУЧШЕЕ</span><i /><span>{awards.categories.length} НОМИНАЦИЙ</span><i /><span>ОДИН НЕЗАБЫВАЕМЫЙ ГОД</span><i /><span>CAMCA63 AWARDS 2026</span><i /><span className="ribbon-extra">ЭТО НАША ИСТОРИЯ</span></div>
    <section className="nominations-section" id="nominations" ref={nominationsRef}><div className="section-heading"><div><div className="eyebrow muted">ПРОГРАММА ЦЕРЕМОНИИ <span>/ 01—{String(awards.categories.length).padStart(2, '0')}</span></div><h2>ГЕРОИ ЭТОГО <em>ГОДА</em></h2></div><p>{awards.categories.length} номинаций.<br />Каждая — часть нашей истории.</p></div>
      <div className="category-grid">{awards.categories.map((category, i) => <Link to={`/present?scene=${scenes.findIndex(s => s.categoryId === category.id) + 1}`} className={`category-tile category-${category.id}`} key={category.id} data-reveal-card style={{ '--reveal-order': i % 3 } as CSSProperties}>
        <div className="category-top"><span className="category-icon"><CategoryIcon name={category.icon} size={27} /></span><span className="category-number">{String(i + 1).padStart(2, '0')} / {String(awards.categories.length).padStart(2, '0')}</span></div>
        <h3>{category.title}</h3><p>{category.intro}</p><div className="category-bottom"><span className="category-label">{category.kind === 'chatter' ? 'ГОЛОС КОМЬЮНИТИ' : category.kind === 'poster' ? 'ИГРЫ, КОТОРЫЕ ЗАПОМНИЛИСЬ' : 'МОМЕНТЫ, КОТОРЫЕ ОСТАЛИСЬ'}</span><ArrowUpRight size={19} /></div>
      </Link>)}</div>
    </section>
    <section className="closing-strip"><span className="eyebrow">СПАСИБО, ЧТО БЫЛИ РЯДОМ</span><h2>БЕЗ ВАС НЕ БЫЛО БЫ <em>ЭТОГО ГОДА.</em></h2><Link to="/present" className="button outline">Вспомним его вместе <ArrowRight size={18} /></Link></section>
  </main></Layout>;
}
