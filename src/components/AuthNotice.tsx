import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

// Плашка с результатом входа через Twitch. Сервер добавляет ?auth=ok|cancelled|error(&reason=код) к адресу возврата.
const messages: Record<string, string> = {
  ok: 'Вы вошли через Twitch.',
  cancelled: 'Вход через Twitch отменён.',
  error: 'Не удалось войти через Twitch. Попробуйте ещё раз.',
};
const reasons: Record<string, string> = {
  oauth_state_failed: 'Ссылка входа устарела. Нажмите «Войти» ещё раз.',
  oauth_state_expired: 'Ссылка входа устарела. Нажмите «Войти» ещё раз.',
  rate_limited: 'Слишком много попыток входа. Подождите минуту.',
};

export function AuthNotice() {
  const location = useLocation();
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [isError, setIsError] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const status = params.get('auth');
    if (!status) return;
    const reason = params.get('reason') ?? '';
    setText((status === 'error' ? reasons[reason] : undefined) ?? messages[status] ?? messages.error);
    setIsError(status !== 'ok');
    params.delete('auth');
    params.delete('reason');
    const search = params.toString();
    // Убираем параметр из адресной строки, чтобы сообщение не появлялось снова при обновлении страницы.
    navigate({ pathname: location.pathname, search: search ? `?${search}` : '', hash: location.hash }, { replace: true });
  }, [location, navigate]);
  if (!text) return null;
  return <div className={`auth-notice ${isError ? 'error' : ''}`} role={isError ? 'alert' : 'status'} data-testid="auth-notice">
    <span>{text}</span><button type="button" aria-label="Закрыть" onClick={() => setText('')}>×</button>
  </div>;
}
