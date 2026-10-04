"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ROUTE_PERMISSIONS = exports.PERMISSION_KEYS = exports.SPECIAL_PERMISSIONS = exports.ACCESS_MODULES = void 0;
exports.hasPermission = hasPermission;
exports.canSupervise = canSupervise;
exports.canSeeAllLeads = canSeeAllLeads;
const enums_1 = require("../enums");
exports.ACCESS_MODULES = [
    ['leads', 'Deals and follow-ups'], ['conversations', 'Conversations'],
    ['patients', 'Patient records'], ['appointments', 'Appointments'],
    ['plans', 'Treatment plans'], ['finance', 'Finance'], ['reports', 'Reports'],
    ['campaigns', 'Campaigns'], ['settings', 'Clinic settings'],
];
exports.SPECIAL_PERMISSIONS = [
    ['leads.all', 'See all salespeople’s leads'], ['leads.assign', 'Reassign leads'],
    ['leads.review', 'Supervise leads and review corrections'],
    ['conversations.all', 'See all work-account conversations'],
    ['conversations.supervise', 'Inspect and disconnect team WhatsApp sessions'],
    ['conversations.send', 'Send and retry WhatsApp messages'],
];
exports.PERMISSION_KEYS = [...exports.ACCESS_MODULES.flatMap(([key]) => [`${key}.read`, `${key}.write`]), ...exports.SPECIAL_PERMISSIONS.map(([key]) => key)];
function hasPermission(user, key, fallback = false) {
    if (!user)
        return false;
    const override = user.permissions?.[key];
    return typeof override === 'boolean' ? override : fallback;
}
function canSupervise(user) {
    return hasPermission(user, 'leads.review', user?.role === enums_1.Role.SUPER_ADMIN);
}
function canSeeAllLeads(user) {
    return hasPermission(user, 'leads.all', user?.role === enums_1.Role.SUPER_ADMIN);
}
exports.ROUTE_PERMISSIONS = {
    '/team': 'leads.assign', '/dashboard': 'reports.read', '/pipeline': 'leads.read', '/my-day': 'leads.read', '/patients': 'patients.read',
    '/inbox': 'conversations.read', '/whatsapp': 'conversations.read',
    '/appointments': 'appointments.read', '/finance': 'finance.read', '/reports': 'reports.read',
    '/campaigns': 'campaigns.read', '/settings': 'settings.read', '/supervision': 'leads.read',
};
//# sourceMappingURL=permissions.js.map