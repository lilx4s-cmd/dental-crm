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
}
//# sourceMappingURL=user.types.d.ts.map