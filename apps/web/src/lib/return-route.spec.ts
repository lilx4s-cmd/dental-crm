import { safeReturnRoute } from './return-route';
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
