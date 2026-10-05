const REMEMBER_COOKIE = 'crm_remember';
const SESSION_SECONDS = 7 * 24 * 60 * 60;

export function rememberSession(): boolean {
  return typeof document !== 'undefined' && document.cookie.split('; ').includes(`${REMEMBER_COOKIE}=1`);
}

export function setRememberSession(remember: boolean): void {
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${REMEMBER_COOKIE}=${remember ? '1' : '0'}; path=/; SameSite=Lax${remember ? `; Max-Age=${SESSION_SECONDS}` : ''}${secure}`;
}

export function writeSessionCookie(name: string, value: string, maxAge = SESSION_SECONDS): void {
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; SameSite=Lax${rememberSession() ? `; Max-Age=${maxAge}` : ''}${secure}`;
}

export function writeAccessCookie(token: string): void {
  let seconds = 15 * 60;
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (Number.isFinite(payload.exp)) seconds = Math.max(0, Math.floor(payload.exp - Date.now() / 1000));
  } catch { /* The API validates the token; the fallback only bounds cookie persistence. */ }
  writeSessionCookie('access_token', token, seconds);
}

export function clearSessionCookies(): void {
  for (const name of ['access_token', 'csrf_token', REMEMBER_COOKIE]) {
    document.cookie = `${name}=; path=/; Max-Age=0`;
  }
}
