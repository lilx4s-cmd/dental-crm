"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LeadStatus = exports.PaymentMethod = exports.InvoiceStatus = exports.Gender = exports.AppointmentStatus = exports.LeadSource = exports.PipelineStage = exports.Role = void 0;
exports.Role = {
    SUPER_ADMIN: 'SUPER_ADMIN',
    CLINIC_MANAGER: 'CLINIC_MANAGER',
    RECEPTION: 'RECEPTION',
    SALES_CONSULTANT: 'SALES_CONSULTANT',
    DENTIST: 'DENTIST',
};
exports.PipelineStage = {
    NEW_LEAD: 'NEW_LEAD',
    CONTACTED: 'CONTACTED',
    QUALIFIED: 'QUALIFIED',
    CONSULTATION_SCHEDULED: 'CONSULTATION_SCHEDULED',
    CONSULTATION_DONE: 'CONSULTATION_DONE',
    TREATMENT_PROPOSED: 'TREATMENT_PROPOSED',
    NEGOTIATION: 'NEGOTIATION',
    WON: 'WON',
    LOST: 'LOST',
};
exports.LeadSource = {
    FACEBOOK_ADS: 'FACEBOOK_ADS',
    INSTAGRAM_ADS: 'INSTAGRAM_ADS',
    WHATSAPP: 'WHATSAPP',
    WEBSITE: 'WEBSITE',
    PHONE: 'PHONE',
    WALK_IN: 'WALK_IN',
    REFERRAL: 'REFERRAL',
    GOOGLE: 'GOOGLE',
    OTHER: 'OTHER',
};
exports.AppointmentStatus = {
    SCHEDULED: 'SCHEDULED',
    CONFIRMED: 'CONFIRMED',
    CHECKED_IN: 'CHECKED_IN',
    IN_PROGRESS: 'IN_PROGRESS',
    COMPLETED: 'COMPLETED',
    CANCELLED: 'CANCELLED',
    NO_SHOW: 'NO_SHOW',
    RESCHEDULED: 'RESCHEDULED',
};
exports.Gender = {
    MALE: 'MALE',
    FEMALE: 'FEMALE',
    OTHER: 'OTHER',
    UNKNOWN: 'UNKNOWN',
};
exports.InvoiceStatus = {
    DRAFT: 'DRAFT',
    SENT: 'SENT',
    PARTIALLY_PAID: 'PARTIALLY_PAID',
    PAID: 'PAID',
    OVERDUE: 'OVERDUE',
    CANCELLED: 'CANCELLED',
    REFUNDED: 'REFUNDED',
};
exports.PaymentMethod = {
    CASH: 'CASH',
    CARD: 'CARD',
    BANK_TRANSFER: 'BANK_TRANSFER',
    INSTALLMENT: 'INSTALLMENT',
    ONLINE: 'ONLINE',
    OTHER: 'OTHER',
};
exports.LeadStatus = {
    ACTIVE: 'ACTIVE',
    WON: 'WON',
    LOST: 'LOST',
    ARCHIVED: 'ARCHIVED',
};
//# sourceMappingURL=index.js.map