import { ArrowLeft, Database, ShieldCheck, Trash2, Twitch } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Layout } from '../components/Layout';

export function Privacy() {
  return <Layout><main className="privacy-page"><span className="eyebrow"><ShieldCheck size={16} /> ДАННЫЕ И ГОЛОСОВАНИЕ</span><h1>КАК МЫ ИСПОЛЬЗУЕМ <em>ДАННЫЕ</em></h1><p className="page-intro">Краткая информация о Twitch-авторизации и хранении голосов CAMCA63 AWARDS 2026.</p>
    <div className="privacy-grid"><section><Twitch /><h2>Что получаем от Twitch</h2><p>Twitch User ID, логин, отображаемое имя, аватар и дату создания аккаунта. Пароль, email, сообщения, подписки и права управления каналом не запрашиваются.</p></section><section><Database /><h2>Для чего и как долго</h2><p>Данные используются для авторизации, ограничения одного голоса в номинации и ручной проверки. Сессия действует до 7 дней. Данные голосования хранятся до завершения премии и административной проверки.</p></section><section><ShieldCheck /><h2>Кто имеет доступ</h2><p>Индивидуальные голоса и Twitch ID доступны только владельцу канала camca63 в защищённой админ-панели. Публично показываются только опубликованные итоговые результаты.</p></section><section><Trash2 /><h2>Удаление данных</h2><p>Чтобы запросить удаление персональных данных после премии, свяжитесь с владельцем через Twitch-канал camca63. Итоговая обезличенная статистика может быть сохранена.</p></section></div>
    <a className="privacy-contact" href="https://www.twitch.tv/camca63" target="_blank" rel="noreferrer">Связаться с владельцем: twitch.tv/camca63</a><Link className="button outline" to="/vote"><ArrowLeft size={17} /> Вернуться к голосованию</Link>
  </main></Layout>;
}
