"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdatePatientSchema = exports.CreatePatientSchema = void 0;
const zod_1 = require("zod");
const enums_1 = require("../enums");
exports.CreatePatientSchema = zod_1.z.object({
    firstName: zod_1.z.string().min(1),
    lastName: zod_1.z.string().min(1),
    email: zod_1.z.string().email().optional().or(zod_1.z.literal('')),
    phone: zod_1.z.string().optional(),
    whatsappNumber: zod_1.z.string().optional(),
    dateOfBirth: zod_1.z.string().optional(),
    gender: zod_1.z.nativeEnum(enums_1.Gender).optional(),
    address: zod_1.z.string().optional(),
    city: zod_1.z.string().optional(),
    country: zod_1.z.string().optional(),
    nationalId: zod_1.z.string().optional(),
    notes: zod_1.z.string().optional(),
});
exports.UpdatePatientSchema = exports.CreatePatientSchema.partial();
//# sourceMappingURL=patient.schema.js.map