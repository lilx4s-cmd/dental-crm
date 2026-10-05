import { clearSessionCookies, setRememberSession, writeAccessCookie, writeSessionCookie, rememberSession } from './session-cookies';

beforeEach(() => { clearSessionCookies(); });
afterEach(() => { jest.restoreAllMocks(); clearSessionCookies(); });

it('remembers the chosen device and makes login and CSRF survive browser restarts', () => {
  const writes = jest.spyOn(document, 'cookie', 'set');
  setRememberSession(true);
  const token = 'fixture.' + btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 900 })) + '.fixture';
  writeAccessCookie(token);
  writeSessionCookie('csrf_token', 'fixture-csrf');
  expect(rememberSession()).toBe(true);
  expect(writes.mock.calls.filter(([value]) => value.startsWith('access_token='))[0][0]).toMatch(/Max-Age=8[0-9]{2}|Max-Age=900/);
  expect(writes.mock.calls.filter(([value]) => value.startsWith('csrf_token='))[0][0]).toContain('Max-Age=604800');
});

it('uses session-only cookies when the device is not remembered', () => {
  const writes = jest.spyOn(document, 'cookie', 'set');
  setRememberSession(false);
  writeAccessCookie('fixture-token');
  writeSessionCookie('csrf_token', 'fixture-csrf');
  expect(writes.mock.calls.every(([value]) => !value.includes('Max-Age='))).toBe(true);
});

it('removes all local session markers on logout', () => {
  setRememberSession(true); writeAccessCookie('fixture-token'); writeSessionCookie('csrf_token', 'fixture-csrf');
  clearSessionCookies();
  expect(document.cookie).not.toMatch(/access_token=|csrf_token=|crm_remember=/);
});
