"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RefreshTokenSchema = exports.LoginSchema = void 0;
const zod_1 = require("zod");
exports.LoginSchema = zod_1.z.object({
    email: zod_1.z.string().email('Invalid email address'),
    // Deliberately *not* the password policy. This is a shape check on what someone typed, not a
    // judgement on it — the policy applies when a password is set, and applying it here would lock
    // out every existing account whose password predates the policy. It only needs to be non-empty
    // for the request to be worth making.
    password: zod_1.z.string().min(1, 'Enter your password'),
});
exports.RefreshTokenSchema = zod_1.z.object({
    refreshToken: zod_1.z.string().min(1),
});
//# sourceMappingURL=auth.schema.js.map