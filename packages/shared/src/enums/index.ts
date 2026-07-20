export const Role = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  CLINIC_MANAGER: 'CLINIC_MANAGER',
  RECEPTION: 'RECEPTION',
  SALES_CONSULTANT: 'SALES_CONSULTANT',
  DENTIST: 'DENTIST',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const PipelineStage = {
  NEW_LEAD: 'NEW_LEAD',
  CONTACTED: 'CONTACTED',
  QUALIFIED: 'QUALIFIED',
  CONSULTATION_SCHEDULED: 'CONSULTATION_SCHEDULED',
  CONSULTATION_DONE: 'CONSULTATION_DONE',
  TREATMENT_PROPOSED: 'TREATMENT_PROPOSED',
  NEGOTIATION: 'NEGOTIATION',
  WON: 'WON',
  LOST: 'LOST',
} as const;
export type PipelineStage = (typeof PipelineStage)[keyof typeof PipelineStage];

export const LeadSource = {
  FACEBOOK_ADS: 'FACEBOOK_ADS',
  INSTAGRAM_ADS: 'INSTAGRAM_ADS',
  WHATSAPP: 'WHATSAPP',
  WEBSITE: 'WEBSITE',
  PHONE: 'PHONE',
  WALK_IN: 'WALK_IN',
  REFERRAL: 'REFERRAL',
  GOOGLE: 'GOOGLE',
  OTHER: 'OTHER',
} as const;
export type LeadSource = (typeof LeadSource)[keyof typeof LeadSource];

export const AppointmentStatus = {
  SCHEDULED: 'SCHEDULED',
  CONFIRMED: 'CONFIRMED',
  CHECKED_IN: 'CHECKED_IN',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  NO_SHOW: 'NO_SHOW',
  RESCHEDULED: 'RESCHEDULED',
} as const;
export type AppointmentStatus = (typeof AppointmentStatus)[keyof typeof AppointmentStatus];

export const Gender = {
  MALE: 'MALE',
  FEMALE: 'FEMALE',
  OTHER: 'OTHER',
  UNKNOWN: 'UNKNOWN',
} as const;
export type Gender = (typeof Gender)[keyof typeof Gender];

export const InvoiceStatus = {
  DRAFT: 'DRAFT',
  SENT: 'SENT',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  PAID: 'PAID',
  OVERDUE: 'OVERDUE',
  CANCELLED: 'CANCELLED',
  REFUNDED: 'REFUNDED',
} as const;
export type InvoiceStatus = (typeof InvoiceStatus)[keyof typeof InvoiceStatus];

export const PaymentMethod = {
  CASH: 'CASH',
  CARD: 'CARD',
  BANK_TRANSFER: 'BANK_TRANSFER',
  INSTALLMENT: 'INSTALLMENT',
  ONLINE: 'ONLINE',
  OTHER: 'OTHER',
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const LeadStatus = {
  ACTIVE: 'ACTIVE',
  WON: 'WON',
  LOST: 'LOST',
  ARCHIVED: 'ARCHIVED',
} as const;
export type LeadStatus = (typeof LeadStatus)[keyof typeof LeadStatus];

// Backfilled — already existed in Prisma but was never mirrored here.
export const TreatmentStatus = {
  PLANNED: 'PLANNED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;
export type TreatmentStatus = (typeof TreatmentStatus)[keyof typeof TreatmentStatus];

// Backfilled + extended for the treatment-plan/warranty module.
export const AttachableType = {
  PATIENT: 'PATIENT',
  LEAD: 'LEAD',
  TREATMENT_PLAN: 'TREATMENT_PLAN',
  TREATMENT_PLAN_ITEM: 'TREATMENT_PLAN_ITEM',
  WARRANTY: 'WARRANTY',
  INVOICE: 'INVOICE',
  APPOINTMENT: 'APPOINTMENT',
  USER: 'USER',
  OTHER: 'OTHER',
} as const;
export type AttachableType = (typeof AttachableType)[keyof typeof AttachableType];

// Backfilled + extended for before/after clinical photos and warranty PDFs.
export const FileCategory = {
  XRAY: 'XRAY',
  CT_SCAN: 'CT_SCAN',
  PHOTO: 'PHOTO',
  BEFORE_PHOTO: 'BEFORE_PHOTO',
  AFTER_PHOTO: 'AFTER_PHOTO',
  DOCUMENT: 'DOCUMENT',
  INVOICE_PDF: 'INVOICE_PDF',
  WARRANTY_PDF: 'WARRANTY_PDF',
  OTHER: 'OTHER',
} as const;
export type FileCategory = (typeof FileCategory)[keyof typeof FileCategory];

export const PatientApprovalStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;
export type PatientApprovalStatus = (typeof PatientApprovalStatus)[keyof typeof PatientApprovalStatus];

export const WarrantyStatus = {
  ACTIVE: 'ACTIVE',
  EXPIRED: 'EXPIRED',
  VOIDED: 'VOIDED',
  CLAIMED: 'CLAIMED',
} as const;
export type WarrantyStatus = (typeof WarrantyStatus)[keyof typeof WarrantyStatus];

export const TimelineStepStatus = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  SKIPPED: 'SKIPPED',
} as const;
export type TimelineStepStatus = (typeof TimelineStepStatus)[keyof typeof TimelineStepStatus];

export const CommentAuthorType = {
  STAFF: 'STAFF',
  PATIENT: 'PATIENT',
} as const;
export type CommentAuthorType = (typeof CommentAuthorType)[keyof typeof CommentAuthorType];
