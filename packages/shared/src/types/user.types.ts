import { Role } from '../enums';

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
  iat?: number;
  exp?: number;
}

export interface AuthTokens {
  accessToken: string;
  /**
   * The CSRF token to send as `X-CSRF-Token` on `/auth/refresh`.
   *
   * Delivered in the body rather than read from a cookie because the app and the API are on
   * different registrable domains, so the app cannot read a cookie the API set. CORS is what stops
   * an attacker reading this response and therefore forging the header.
   */
  csrfToken?: string;
}

/**
 * What `POST /auth/login` returns when the password was right but the account has 2FA on.
 *
 * A distinct shape rather than a nullable `accessToken`, so a client cannot accidentally treat an
 * unfinished sign-in as a finished one — the discriminant turns the wrong branch into a type error
 * instead of a runtime surprise.
 */
export interface TwoFactorChallenge {
  twoFactorRequired: true;
  /** Short-lived and single-purpose. Proves the password step passed; grants nothing on its own. */
  challengeToken: string;
}

export type LoginResult = AuthTokens | TwoFactorChallenge;

export function isTwoFactorChallenge(result: LoginResult): result is TwoFactorChallenge {
  return 'twoFactorRequired' in result;
}
