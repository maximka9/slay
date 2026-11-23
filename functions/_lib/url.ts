// Разбор адресов и cookie. Файл без зависимостей от Cloudflare, чтобы его можно было тестировать в Vitest.

export function safeDecode(value: string) {
  try { return decodeURIComponent(value); } catch { return null; }
}

// Битая cookie (например, `%E0` от расширения браузера) не должна ронять API — просто пропускаем её.
export function parseCookieHeader(header: string | null | undefined) {
  const result: Record<string, string> = {};
  for (const item of (header ?? '').split(';').map(part => part.trim()).filter(Boolean)) {
    const index = item.indexOf('=');
    const name = index < 0 ? item : item.slice(0, index);
    const decoded = index < 0 ? '' : safeDecode(item.slice(index + 1));
    if (decoded !== null) result[name] = decoded;
  }
  return result;
}

// Разрешённые адреса возврата после входа. Всё остальное → /vote.
const RETURN_PATHS = ['/', '/awards', '/vote', '/results', '/admin', '/present', '/privacy'];

export function safeReturnTo(value: string | null | undefined): string {
  const fallback = '/vote';
  if (!value || value.length > 300) return fallback;
  // Запрещаем обратный слэш (браузер считает его за `/`), управляющие символы и протокол-относительные адреса.
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\') || /[\u0000-\u001f\u007f]/.test(value)) return fallback;
  let parsed: URL;
  try { parsed = new URL(value, 'https://return.invalid'); } catch { return fallback; }
  if (parsed.origin !== 'https://return.invalid') return fallback;
  if (!RETURN_PATHS.includes(parsed.pathname)) return fallback;
  return parsed.pathname + parsed.search + parsed.hash;
}

// Целое из query-параметра. Отсутствующий или пустой параметр → значение по умолчанию
// (раньше Number(null) === 0 обрезался до минимума, и список голосов отдавался по 1 записи).
export function integer(value: string | null | undefined, fallback: number, min: number, max: number) {
  if (value === null || value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}
