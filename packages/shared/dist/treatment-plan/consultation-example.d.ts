import { type Consultation } from './consultation';
/** Fictional demonstration only. Never creates a patient, payment, share link or clinic record. */
export declare function consultationExample(language?: Consultation['language']): {
    plan: {
        currency: string;
        language: "tr" | "de" | "fr" | "ru" | "ar" | "en" | "es" | "it" | "pl" | "hr";
        version: 1;
        treatmentText: string;
        lines: {
            type: "implant" | "crown" | "veneer" | "bridge" | "extraction" | "sinus" | "graft" | "rootCanal" | "temporary" | "implantCrown";
            id: string;
            quantity: number;
            unitPrice: number | null;
            positions: string[];
            visit: number;
            discount: number;
            description?: string | undefined;
            overrideReason?: string | undefined;
            jaw?: "upper" | "lower" | undefined;
            material?: string | undefined;
            brand?: string | undefined;
        }[];
        visits: {
            number: number;
            nights: number;
            hotelRate: number;
            hotelIncluded: boolean;
            transfer: "included" | "excluded" | "paid";
            transferPrice: number;
            itinerary: {
                text: string;
                day: number;
            }[];
            treatmentDays?: number | undefined;
        }[];
        healing: {
            minMonths: number;
            maxMonths: number;
        } | null;
        includedServices: string[];
        findings: Record<string, "missing" | "unknown" | "healthy" | "existingCrown">;
    };
    patient: {
        id: string;
        firstName: string;
        lastName: string;
    };
    clinic: {
        clinicName: string;
        city: string;
        country: string;
        email: string;
        website: string;
    };
    config: {
        healing: {
            minMonths: number;
            maxMonths: number;
        } | null;
        department: string;
        accentColor: string;
        priceList: {
            type: "implant" | "crown" | "veneer" | "bridge" | "extraction" | "sinus" | "graft" | "rootCanal" | "temporary" | "implantCrown";
            currency: string;
            unitPrice: number;
            material?: string | undefined;
            brand?: string | undefined;
        }[];
        defaultNights: number[];
        defaultHotelRate: number;
        defaultHotelIncluded: boolean;
        services: string[];
        warranties: {
            type: "implant" | "crown" | "veneer" | "bridge" | "extraction" | "sinus" | "graft" | "rootCanal" | "temporary" | "implantCrown";
            duration: "months" | "lifetime";
            summary: string;
            months?: number | undefined;
        }[];
        signature?: string | undefined;
        representative?: string | undefined;
        billingLegalName?: string | undefined;
        billingTaxId?: string | undefined;
        invoicePaymentInstructions?: string | undefined;
        stamp?: string | undefined;
        logo?: string | undefined;
        coverPhoto?: string | undefined;
    };
    payment: {
        cardFee: number;
        cashDiscount: number;
        depositAmount: number;
        terms: string;
    };
    generatedAt: string;
    documentId: string;
    version: number;
    title: string;
};
//# sourceMappingURL=consultation-example.d.ts.map