import { z } from 'zod';
export declare const CreateUserSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
    firstName: z.ZodString;
    lastName: z.ZodString;
    phone: z.ZodOptional<z.ZodString>;
    role: z.ZodEnum<["SUPER_ADMIN", "CLINIC_MANAGER", "RECEPTION", "SALES_CONSULTANT", "DENTIST"]>;
    specialization: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    role: "SUPER_ADMIN" | "CLINIC_MANAGER" | "RECEPTION" | "SALES_CONSULTANT" | "DENTIST";
    phone?: string | undefined;
    specialization?: string | undefined;
}, {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    role: "SUPER_ADMIN" | "CLINIC_MANAGER" | "RECEPTION" | "SALES_CONSULTANT" | "DENTIST";
    phone?: string | undefined;
    specialization?: string | undefined;
}>;
export type CreateUserDto = z.infer<typeof CreateUserSchema>;
export declare const UpdateUserSchema: z.ZodObject<Omit<{
    email: z.ZodOptional<z.ZodString>;
    password: z.ZodOptional<z.ZodString>;
    firstName: z.ZodOptional<z.ZodString>;
    lastName: z.ZodOptional<z.ZodString>;
    phone: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    role: z.ZodOptional<z.ZodEnum<["SUPER_ADMIN", "CLINIC_MANAGER", "RECEPTION", "SALES_CONSULTANT", "DENTIST"]>>;
    specialization: z.ZodOptional<z.ZodOptional<z.ZodString>>;
}, "password">, "strip", z.ZodTypeAny, {
    email?: string | undefined;
    firstName?: string | undefined;
    lastName?: string | undefined;
    phone?: string | undefined;
    role?: "SUPER_ADMIN" | "CLINIC_MANAGER" | "RECEPTION" | "SALES_CONSULTANT" | "DENTIST" | undefined;
    specialization?: string | undefined;
}, {
    email?: string | undefined;
    firstName?: string | undefined;
    lastName?: string | undefined;
    phone?: string | undefined;
    role?: "SUPER_ADMIN" | "CLINIC_MANAGER" | "RECEPTION" | "SALES_CONSULTANT" | "DENTIST" | undefined;
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
    email: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    role: "SUPER_ADMIN" | "CLINIC_MANAGER" | "RECEPTION" | "SALES_CONSULTANT" | "DENTIST";
    specialization: string | null;
    id: string;
    avatarUrl: string | null;
    isActive: boolean;
    createdAt: string;
}, {
    email: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    role: "SUPER_ADMIN" | "CLINIC_MANAGER" | "RECEPTION" | "SALES_CONSULTANT" | "DENTIST";
    specialization: string | null;
    id: string;
    avatarUrl: string | null;
    isActive: boolean;
    createdAt: string;
}>;
export type UserDto = z.infer<typeof UserSchema>;
//# sourceMappingURL=user.schema.d.ts.map