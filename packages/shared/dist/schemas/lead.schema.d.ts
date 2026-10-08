import { z } from 'zod';
export declare const CreateLeadSchema: z.ZodObject<{
    conversationId: z.ZodOptional<z.ZodString>;
    firstName: z.ZodString;
    lastName: z.ZodOptional<z.ZodString>;
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
    source: string;
    firstName: string;
    currency: string;
    assignedToId?: string | undefined;
    email?: string | undefined;
    lastName?: string | undefined;
    phone?: string | undefined;
    whatsappNumber?: string | undefined;
    notes?: string | undefined;
    conversationId?: string | undefined;
    campaignId?: string | undefined;
    estimatedValue?: number | undefined;
}, {
    source: string;
    firstName: string;
    assignedToId?: string | undefined;
    email?: string | undefined;
    lastName?: string | undefined;
    phone?: string | undefined;
    whatsappNumber?: string | undefined;
    notes?: string | undefined;
    conversationId?: string | undefined;
    campaignId?: string | undefined;
    estimatedValue?: number | undefined;
    currency?: string | undefined;
}>;
export declare const UpdateLeadSchema: z.ZodObject<{
    assignedToId: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    source: z.ZodOptional<z.ZodNativeEnum<Record<string, string>>>;
    email: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>>;
    firstName: z.ZodOptional<z.ZodString>;
    lastName: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    phone: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    whatsappNumber: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    notes: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    campaignId: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    estimatedValue: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
    currency: z.ZodOptional<z.ZodDefault<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    assignedToId?: string | undefined;
    source?: string | undefined;
    email?: string | undefined;
    firstName?: string | undefined;
    lastName?: string | undefined;
    phone?: string | undefined;
    whatsappNumber?: string | undefined;
    notes?: string | undefined;
    campaignId?: string | undefined;
    estimatedValue?: number | undefined;
    currency?: string | undefined;
}, {
    assignedToId?: string | undefined;
    source?: string | undefined;
    email?: string | undefined;
    firstName?: string | undefined;
    lastName?: string | undefined;
    phone?: string | undefined;
    whatsappNumber?: string | undefined;
    notes?: string | undefined;
    campaignId?: string | undefined;
    estimatedValue?: number | undefined;
    currency?: string | undefined;
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