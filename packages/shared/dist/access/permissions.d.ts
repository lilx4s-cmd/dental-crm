import { JwtPayload } from '../types/user.types';
export declare const ACCESS_MODULES: readonly [readonly ["leads", "Deals and follow-ups"], readonly ["conversations", "Conversations"], readonly ["patients", "Patient records"], readonly ["appointments", "Appointments"], readonly ["plans", "Treatment plans"], readonly ["finance", "Finance"], readonly ["reports", "Reports"], readonly ["campaigns", "Campaigns"], readonly ["settings", "Clinic settings"]];
export declare const SPECIAL_PERMISSIONS: readonly [readonly ["leads.all", "See all salespeople’s leads"], readonly ["leads.assign", "Reassign leads"], readonly ["leads.review", "Supervise leads and review corrections"], readonly ["conversations.all", "See all work-account conversations"], readonly ["conversations.supervise", "Inspect and disconnect team WhatsApp sessions"], readonly ["conversations.send", "Send and retry WhatsApp messages"]];
export declare const PERMISSION_KEYS: string[];
export declare function hasPermission(user: Pick<JwtPayload, 'role' | 'permissions'> | null | undefined, key: string, fallback?: boolean): boolean;
export declare function canSupervise(user: Pick<JwtPayload, 'role' | 'permissions'> | null | undefined): boolean;
export declare function canSeeAllLeads(user: Pick<JwtPayload, 'role' | 'permissions'> | null | undefined): boolean;
export declare const ROUTE_PERMISSIONS: Record<string, string>;
//# sourceMappingURL=permissions.d.ts.map