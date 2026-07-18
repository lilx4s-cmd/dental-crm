import { z } from 'zod';
export declare const CreateLeadSchema: z.ZodObject<{
    firstName: z.ZodString;
    lastName: z.ZodString;
    email: z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>;
    phone: z.ZodOptional<z.ZodString>;
    whatsappNumber: z.ZodOptional<z.ZodString>;
    source: z.ZodNativeEnum<Record<string, string>>;
    campaignId: z.ZodOptional<z.ZodString>;
    estimatedValue: z.ZodOptional<z.ZodNumber>;
    currency: z.ZodDefault<z.ZodString>;
    notes: z.ZodOptional<z.ZodString>;
    assignedToId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    firstName: string;
    lastName: string;
    source: string;
    currency: string;
    email?: string | undefined;
    phone?: string | undefined;
    whatsappNumber?: string | undefined;
    notes?: string | undefined;
    campaignId?: string | undefined;
    estimatedValue?: number | undefined;
    assignedToId?: string | undefined;
}, {
    firstName: string;
    lastName: string;
    source: string;
    email?: string | undefined;
    phone?: string | undefined;
    whatsappNumber?: string | undefined;
    notes?: string | undefined;
    campaignId?: string | undefined;
    estimatedValue?: number | undefined;
    currency?: string | undefined;
    assignedToId?: string | undefined;
}>;
export declare const UpdateLeadSchema: z.ZodObject<{
    firstName: z.ZodOptional<z.ZodString>;
    lastName: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>>;
    phone: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    whatsappNumber: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    source: z.ZodOptional<z.ZodNativeEnum<Record<string, string>>>;
    campaignId: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    estimatedValue: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
    currency: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    notes: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    assignedToId: z.ZodOptional<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    email?: string | undefined;
    firstName?: string | undefined;
    lastName?: string | undefined;
    phone?: string | undefined;
    whatsappNumber?: string | undefined;
    notes?: string | undefined;
    source?: string | undefined;
    campaignId?: string | undefined;
    estimatedValue?: number | undefined;
    currency?: string | undefined;
    assignedToId?: string | undefined;
}, {
    email?: string | undefined;
    firstName?: string | undefined;
    lastName?: string | undefined;
    phone?: string | undefined;
    whatsappNumber?: string | undefined;
    notes?: string | undefined;
    source?: string | undefined;
    campaignId?: string | undefined;
    estimatedValue?: number | undefined;
    currency?: string | undefined;
    assignedToId?: string | undefined;
}>;
export declare const UpdateLeadStageSchema: z.ZodObject<{
    stage: z.ZodNativeEnum<Record<string, string>>;
    note: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    stage: string;
    note?: string | undefined;
}, {
    stage: string;
    note?: string | undefined;
}>;
export declare const UpdateLeadStatusSchema: z.ZodObject<{
    status: z.ZodNativeEnum<Record<string, string>>;
    lostReason: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    status: string;
    lostReason?: string | undefined;
}, {
    status: string;
    lostReason?: string | undefined;
}>;
export type CreateLeadInput = z.infer<typeof CreateLeadSchema>;
export type UpdateLeadInput = z.infer<typeof UpdateLeadSchema>;
export type UpdateLeadStageInput = z.infer<typeof UpdateLeadStageSchema>;
//# sourceMappingURL=lead.schema.d.ts.map