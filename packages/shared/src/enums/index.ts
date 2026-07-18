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
