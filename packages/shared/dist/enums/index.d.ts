export declare const Role: {
    readonly SUPER_ADMIN: "SUPER_ADMIN";
    readonly CLINIC_MANAGER: "CLINIC_MANAGER";
    readonly RECEPTION: "RECEPTION";
    readonly SALES_CONSULTANT: "SALES_CONSULTANT";
    readonly DENTIST: "DENTIST";
};
export type Role = (typeof Role)[keyof typeof Role];
export declare const PipelineStage: {
    readonly NEW_LEAD: "NEW_LEAD";
    readonly CONTACTED: "CONTACTED";
    readonly QUALIFIED: "QUALIFIED";
    readonly CONSULTATION_SCHEDULED: "CONSULTATION_SCHEDULED";
    readonly CONSULTATION_DONE: "CONSULTATION_DONE";
    readonly TREATMENT_PROPOSED: "TREATMENT_PROPOSED";
    readonly NEGOTIATION: "NEGOTIATION";
    readonly WON: "WON";
    readonly LOST: "LOST";
};
export type PipelineStage = (typeof PipelineStage)[keyof typeof PipelineStage];
export declare const LeadSource: {
    readonly FACEBOOK_ADS: "FACEBOOK_ADS";
    readonly INSTAGRAM_ADS: "INSTAGRAM_ADS";
    readonly WHATSAPP: "WHATSAPP";
    readonly WEBSITE: "WEBSITE";
    readonly PHONE: "PHONE";
    readonly WALK_IN: "WALK_IN";
    readonly REFERRAL: "REFERRAL";
    readonly GOOGLE: "GOOGLE";
    readonly OTHER: "OTHER";
};
export type LeadSource = (typeof LeadSource)[keyof typeof LeadSource];
export declare const AppointmentStatus: {
    readonly SCHEDULED: "SCHEDULED";
    readonly CONFIRMED: "CONFIRMED";
    readonly CHECKED_IN: "CHECKED_IN";
    readonly IN_PROGRESS: "IN_PROGRESS";
    readonly COMPLETED: "COMPLETED";
    readonly CANCELLED: "CANCELLED";
    readonly NO_SHOW: "NO_SHOW";
    readonly RESCHEDULED: "RESCHEDULED";
};
export type AppointmentStatus = (typeof AppointmentStatus)[keyof typeof AppointmentStatus];
export declare const Gender: {
    readonly MALE: "MALE";
    readonly FEMALE: "FEMALE";
    readonly OTHER: "OTHER";
    readonly UNKNOWN: "UNKNOWN";
};
export type Gender = (typeof Gender)[keyof typeof Gender];
export declare const InvoiceStatus: {
    readonly DRAFT: "DRAFT";
    readonly SENT: "SENT";
    readonly PARTIALLY_PAID: "PARTIALLY_PAID";
    readonly PAID: "PAID";
    readonly OVERDUE: "OVERDUE";
    readonly CANCELLED: "CANCELLED";
    readonly REFUNDED: "REFUNDED";
};
export type InvoiceStatus = (typeof InvoiceStatus)[keyof typeof InvoiceStatus];
export declare const PaymentMethod: {
    readonly CASH: "CASH";
    readonly CARD: "CARD";
    readonly BANK_TRANSFER: "BANK_TRANSFER";
    readonly INSTALLMENT: "INSTALLMENT";
    readonly ONLINE: "ONLINE";
    readonly OTHER: "OTHER";
};
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];
export declare const LeadStatus: {
    readonly ACTIVE: "ACTIVE";
    readonly WON: "WON";
    readonly LOST: "LOST";
    readonly ARCHIVED: "ARCHIVED";
};
export type LeadStatus = (typeof LeadStatus)[keyof typeof LeadStatus];
export declare const TreatmentStatus: {
    readonly PLANNED: "PLANNED";
    readonly IN_PROGRESS: "IN_PROGRESS";
    readonly COMPLETED: "COMPLETED";
    readonly CANCELLED: "CANCELLED";
};
export type TreatmentStatus = (typeof TreatmentStatus)[keyof typeof TreatmentStatus];
export declare const AttachableType: {
    readonly PATIENT: "PATIENT";
    readonly LEAD: "LEAD";
    readonly TREATMENT_PLAN: "TREATMENT_PLAN";
    readonly TREATMENT_PLAN_ITEM: "TREATMENT_PLAN_ITEM";
    readonly WARRANTY: "WARRANTY";
    readonly INVOICE: "INVOICE";
    readonly APPOINTMENT: "APPOINTMENT";
    readonly USER: "USER";
    readonly OTHER: "OTHER";
};
export type AttachableType = (typeof AttachableType)[keyof typeof AttachableType];
export declare const FileCategory: {
    readonly XRAY: "XRAY";
    readonly CT_SCAN: "CT_SCAN";
    readonly PHOTO: "PHOTO";
    readonly BEFORE_PHOTO: "BEFORE_PHOTO";
    readonly AFTER_PHOTO: "AFTER_PHOTO";
    readonly DOCUMENT: "DOCUMENT";
    readonly INVOICE_PDF: "INVOICE_PDF";
    readonly WARRANTY_PDF: "WARRANTY_PDF";
    readonly OTHER: "OTHER";
};
export type FileCategory = (typeof FileCategory)[keyof typeof FileCategory];
export declare const PatientApprovalStatus: {
    readonly PENDING: "PENDING";
    readonly APPROVED: "APPROVED";
    readonly REJECTED: "REJECTED";
};
export type PatientApprovalStatus = (typeof PatientApprovalStatus)[keyof typeof PatientApprovalStatus];
export declare const WarrantyStatus: {
    readonly ACTIVE: "ACTIVE";
    readonly EXPIRED: "EXPIRED";
    readonly VOIDED: "VOIDED";
    readonly CLAIMED: "CLAIMED";
};
export type WarrantyStatus = (typeof WarrantyStatus)[keyof typeof WarrantyStatus];
export declare const TimelineStepStatus: {
    readonly PENDING: "PENDING";
    readonly IN_PROGRESS: "IN_PROGRESS";
    readonly COMPLETED: "COMPLETED";
    readonly SKIPPED: "SKIPPED";
};
export type TimelineStepStatus = (typeof TimelineStepStatus)[keyof typeof TimelineStepStatus];
export declare const CommentAuthorType: {
    readonly STAFF: "STAFF";
    readonly PATIENT: "PATIENT";
};
export type CommentAuthorType = (typeof CommentAuthorType)[keyof typeof CommentAuthorType];
//# sourceMappingURL=index.d.ts.map