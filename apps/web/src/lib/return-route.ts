import { PROTECTED_PATH_PREFIXES, matchesPrefix } from './route-config';
export function safeReturnRoute(from: string | null, fallback: string) {
  return from &&
    from.startsWith('/') &&
    !from.startsWith('//') &&
    !from.includes('\\') &&
    matchesPrefix(from.split('?')[0], PROTECTED_PATH_PREFIXES)
    ? from
    : fallback;
}
