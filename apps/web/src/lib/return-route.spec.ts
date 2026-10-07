import { safeReturnRoute } from './return-route';
import { matchesPrefix, PROTECTED_PATH_PREFIXES } from './route-config';
it('requires sign-in for calling and preserves its return link', () => {
  expect(matchesPrefix('/calling', PROTECTED_PATH_PREFIXES)).toBe(true);
  expect(safeReturnRoute('/calling?leadId=lead-42', '/my-day')).toBe('/calling?leadId=lead-42');
});
it('preserves the exact lead link across login', () =>
  expect(safeReturnRoute('/pipeline?leadId=lead-42', '/my-day')).toBe('/pipeline?leadId=lead-42'));
it.each([
  '//evil.example/path',
  'https://evil.example',
  '/\\evil.example',
  '/login?from=/pipeline',
])('refuses unsafe or non-workspace redirects %s', (route) =>
  expect(safeReturnRoute(route, '/my-day')).toBe('/my-day'),
);
