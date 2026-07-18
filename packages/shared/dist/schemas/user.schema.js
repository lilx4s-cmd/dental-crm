"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserSchema = exports.UpdateUserSchema = exports.CreateUserSchema = void 0;
const zod_1 = require("zod");
const enums_1 = require("../enums");
exports.CreateUserSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8, 'Password must be at least 8 characters'),
    firstName: zod_1.z.string().min(1),
    lastName: zod_1.z.string().min(1),
    phone: zod_1.z.string().optional(),
    role: zod_1.z.enum([
        enums_1.Role.SUPER_ADMIN,
        enums_1.Role.CLINIC_MANAGER,
        enums_1.Role.RECEPTION,
        enums_1.Role.SALES_CONSULTANT,
        enums_1.Role.DENTIST,
    ]),
    specialization: zod_1.z.string().optional(),
});
exports.UpdateUserSchema = exports.CreateUserSchema.partial().omit({ password: true });
exports.UserSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    email: zod_1.z.string().email(),
    firstName: zod_1.z.string(),
    lastName: zod_1.z.string(),
    phone: zod_1.z.string().nullable(),
    avatarUrl: zod_1.z.string().nullable(),
    role: zod_1.z.enum([
        enums_1.Role.SUPER_ADMIN,
        enums_1.Role.CLINIC_MANAGER,
        enums_1.Role.RECEPTION,
        enums_1.Role.SALES_CONSULTANT,
        enums_1.Role.DENTIST,
    ]),
    isActive: zod_1.z.boolean(),
    specialization: zod_1.z.string().nullable(),
    createdAt: zod_1.z.string().datetime(),
});
//# sourceMappingURL=user.schema.js.map