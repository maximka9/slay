import { ApiError } from './types';

const securityHeaders = {
  'Cache-Control': 'no-store, max-age=0',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Referrer-Policy': 'no-referrer',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
};

export function json(data: unknown, status = 200, extra: HeadersInit = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...securityHeaders, ...extra },
  });
}

export function redirect(location: string, headers: HeadersInit = {}, setCookies: string[] = []) {
  const responseHeaders = new Headers({ Location: location, ...securityHeaders });
  new Headers(headers).forEach((value, key) => responseHeaders.append(key, value));
  for (const value of setCookies) responseHeaders.append('Set-Cookie', value);
  return new Response(null, { status: 302, headers: responseHeaders });
}

export async function body<T>(request: Request): Promise<T> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) throw new ApiError(415, 'Ожидался JSON.', 'unsupported_media_type');
  try { return await request.json() as T; }
  catch { throw new ApiError(400, 'Некорректный JSON.', 'invalid_json'); }
}

export function cookies(request: Request) {
  const value = request.headers.get('cookie') ?? '';
  return Object.fromEntries(value.split(';').map(item => item.trim()).filter(Boolean).map(item => {
    const index = item.indexOf('=');
    return index < 0 ? [item, ''] : [item.slice(0, index), decodeURIComponent(item.slice(index + 1))];
  }));
}

export function cookie(name: string, value: string, request: Request, maxAge: number) {
  const secure = new URL(request.url).protocol === 'https:';
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

export function apiError(error: unknown) {
  if (error instanceof ApiError) return json({ error: error.code, message: error.message }, error.status);
  console.error(error);
  return json({ error: 'internal_error', message: 'Внутренняя ошибка сервера.' }, 500);
}

export function integer(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}
