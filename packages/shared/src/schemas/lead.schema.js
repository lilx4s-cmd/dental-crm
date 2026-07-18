"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateLeadStatusSchema = exports.UpdateLeadStageSchema = exports.UpdateLeadSchema = exports.CreateLeadSchema = void 0;
const zod_1 = require("zod");
const enums_1 = require("../enums");
exports.CreateLeadSchema = zod_1.z.object({
    firstName: zod_1.z.string().min(1),
    lastName: zod_1.z.string().min(1),
    email: zod_1.z.string().email().optional().or(zod_1.z.literal('')),
    phone: zod_1.z.string().optional(),
    whatsappNumber: zod_1.z.string().optional(),
    source: zod_1.z.nativeEnum(enums_1.LeadSource),
    campaignId: zod_1.z.string().uuid().optional(),
    estimatedValue: zod_1.z.number().positive().optional(),
    currency: zod_1.z.string().length(3).default('USD'),
    notes: zod_1.z.string().optional(),
    assignedToId: zod_1.z.string().uuid().optional(),
});
exports.UpdateLeadSchema = exports.CreateLeadSchema.partial();
exports.UpdateLeadStageSchema = zod_1.z.object({
    stage: zod_1.z.nativeEnum(enums_1.PipelineStage),
    note: zod_1.z.string().optional(),
});
exports.UpdateLeadStatusSchema = zod_1.z.object({
    status: zod_1.z.nativeEnum(enums_1.LeadStatus),
    lostReason: zod_1.z.string().optional(),
});
//# sourceMappingURL=lead.schema.js.map