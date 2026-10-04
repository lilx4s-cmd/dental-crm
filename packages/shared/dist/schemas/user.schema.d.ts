import { z } from 'zod';
export declare const CreateUserSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodEffects<z.ZodString, string, string>;
    firstName: z.ZodString;
    lastName: z.ZodString;
    phone: z.ZodOptional<z.ZodString>;
    role: z.ZodEnum<["SUPER_ADMIN", "CLINIC_MANAGER", "RECEPTION", "SALES_CONSULTANT", "DENTIST"]>;
    specialization: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    role: "SUPER_ADMIN" | "CLINIC_MANAGER" | "RECEPTION" | "SALES_CONSULTANT" | "DENTIST";
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone?: string | undefined;
    specialization?: string | undefined;
}, {
    role: "SUPER_ADMIN" | "CLINIC_MANAGER" | "RECEPTION" | "SALES_CONSULTANT" | "DENTIST";
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone?: string | undefined;
    specialization?: string | undefined;
}>;
export type CreateUserDto = z.infer<typeof CreateUserSchema>;
export declare const UpdateUserSchema: z.ZodObject<Omit<{
    email: z.ZodOptional<z.ZodString>;
    password: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    firstName: z.ZodOptional<z.ZodString>;
    lastName: z.ZodOptional<z.ZodString>;
    phone: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    role: z.ZodOptional<z.ZodEnum<["SUPER_ADMIN", "CLINIC_MANAGER", "RECEPTION", "SALES_CONSULTANT", "DENTIST"]>>;
    specialization: z.ZodOptional<z.ZodOptional<z.ZodString>>;
}, "password">, "strip", z.ZodTypeAny, {
    role?: "SUPER_ADMIN" | "CLINIC_MANAGER" | "RECEPTION" | "SALES_CONSULTANT" | "DENTIST" | undefined;
    email?: string | undefined;
    firstName?: string | undefined;
    lastName?: string | undefined;
    phone?: string | undefined;
    specialization?: string | undefined;
}, {
    role?: "SUPER_ADMIN" | "CLINIC_MANAGER" | "RECEPTION" | "SALES_CONSULTANT" | "DENTIST" | undefined;
    email?: string | undefined;
    firstName?: string | undefined;
    lastName?: string | undefined;
    phone?: string | undefined;
    specialization?: string | undefined;
}>;
export type UpdateUserDto = z.infer<typeof UpdateUserSchema>;
export declare const UserSchema: z.ZodObject<{
    id: z.ZodString;
    email: z.ZodString;
    firstName: z.ZodString;
    lastName: z.ZodString;
    phone: z.ZodNullable<z.ZodString>;
    avatarUrl: z.ZodNullable<z.ZodString>;
    role: z.ZodEnum<["SUPER_ADMIN", "CLINIC_MANAGER", "RECEPTION", "SALES_CONSULTANT", "DENTIST"]>;
    isActive: z.ZodBoolean;
    specialization: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    role: "SUPER_ADMIN" | "CLINIC_MANAGER" | "RECEPTION" | "SALES_CONSULTANT" | "DENTIST";
    email: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    specialization: string | null;
    id: string;
    avatarUrl: string | null;
    isActive: boolean;
    createdAt: string;
}, {
    role: "SUPER_ADMIN" | "CLINIC_MANAGER" | "RECEPTION" | "SALES_CONSULTANT" | "DENTIST";
    email: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    specialization: string | null;
    id: string;
    avatarUrl: string | null;
    isActive: boolean;
    createdAt: string;
}>;
export type UserDto = z.infer<typeof UserSchema>;
//# sourceMappingURL=user.schema.d.ts.map