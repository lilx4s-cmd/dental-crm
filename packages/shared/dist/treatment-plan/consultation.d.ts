import { z } from 'zod';
import { type ToothLayers } from '../dental/tooth-geometry';
export declare const DOCUMENT_LANGUAGES: readonly ["en", "ar", "fr", "tr", "de", "es", "it", "pl", "hr", "ru"];
export declare const PROCEDURES: readonly ["implant", "crown", "veneer", "extraction", "sinus", "graft", "rootCanal", "bridge", "temporary", "implantCrown"];
export type Procedure = (typeof PROCEDURES)[number];
export declare const ConsultationLineSchema: z.ZodEffects<z.ZodObject<{
    id: z.ZodString;
    type: z.ZodEnum<["implant", "crown", "veneer", "extraction", "sinus", "graft", "rootCanal", "bridge", "temporary", "implantCrown"]>;
    quantity: z.ZodNumber;
    unitPrice: z.ZodNullable<z.ZodEffects<z.ZodNumber, number, number>>;
    overrideReason: z.ZodOptional<z.ZodString>;
    positions: z.ZodDefault<z.ZodArray<z.ZodEffects<z.ZodString, string, string>, "many">>;
    jaw: z.ZodOptional<z.ZodEnum<["upper", "lower"]>>;
    visit: z.ZodNumber;
    material: z.ZodOptional<z.ZodString>;
    brand: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    discount: z.ZodDefault<z.ZodEffects<z.ZodNumber, number, number>>;
}, "strip", z.ZodTypeAny, {
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
}, {
    type: "implant" | "crown" | "veneer" | "bridge" | "extraction" | "sinus" | "graft" | "rootCanal" | "temporary" | "implantCrown";
    id: string;
    quantity: number;
    unitPrice: number | null;
    visit: number;
    description?: string | undefined;
    overrideReason?: string | undefined;
    positions?: string[] | undefined;
    jaw?: "upper" | "lower" | undefined;
    material?: string | undefined;
    brand?: string | undefined;
    discount?: number | undefined;
}>, {
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
}, {
    type: "implant" | "crown" | "veneer" | "bridge" | "extraction" | "sinus" | "graft" | "rootCanal" | "temporary" | "implantCrown";
    id: string;
    quantity: number;
    unitPrice: number | null;
    visit: number;
    description?: string | undefined;
    overrideReason?: string | undefined;
    positions?: string[] | undefined;
    jaw?: "upper" | "lower" | undefined;
    material?: string | undefined;
    brand?: string | undefined;
    discount?: number | undefined;
}>;
export declare const ConsultationVisitSchema: z.ZodObject<{
    number: z.ZodNumber;
    nights: z.ZodNumber;
    hotelRate: z.ZodEffects<z.ZodNumber, number, number>;
    hotelIncluded: z.ZodBoolean;
    transfer: z.ZodEnum<["included", "excluded", "paid"]>;
    transferPrice: z.ZodEffects<z.ZodNumber, number, number>;
    itinerary: z.ZodDefault<z.ZodArray<z.ZodObject<{
        day: z.ZodNumber;
        text: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        text: string;
        day: number;
    }, {
        text: string;
        day: number;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
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
}, {
    number: number;
    nights: number;
    hotelRate: number;
    hotelIncluded: boolean;
    transfer: "included" | "excluded" | "paid";
    transferPrice: number;
    itinerary?: {
        text: string;
        day: number;
    }[] | undefined;
}>;
export declare const ConsultationSchema: z.ZodEffects<z.ZodObject<{
    version: z.ZodLiteral<1>;
    language: z.ZodEnum<["en", "ar", "fr", "tr", "de", "es", "it", "pl", "hr", "ru"]>;
    currency: z.ZodEffects<z.ZodString, string, string>;
    treatmentText: z.ZodString;
    lines: z.ZodArray<z.ZodEffects<z.ZodObject<{
        id: z.ZodString;
        type: z.ZodEnum<["implant", "crown", "veneer", "extraction", "sinus", "graft", "rootCanal", "bridge", "temporary", "implantCrown"]>;
        quantity: z.ZodNumber;
        unitPrice: z.ZodNullable<z.ZodEffects<z.ZodNumber, number, number>>;
        overrideReason: z.ZodOptional<z.ZodString>;
        positions: z.ZodDefault<z.ZodArray<z.ZodEffects<z.ZodString, string, string>, "many">>;
        jaw: z.ZodOptional<z.ZodEnum<["upper", "lower"]>>;
        visit: z.ZodNumber;
        material: z.ZodOptional<z.ZodString>;
        brand: z.ZodOptional<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
        discount: z.ZodDefault<z.ZodEffects<z.ZodNumber, number, number>>;
    }, "strip", z.ZodTypeAny, {
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
    }, {
        type: "implant" | "crown" | "veneer" | "bridge" | "extraction" | "sinus" | "graft" | "rootCanal" | "temporary" | "implantCrown";
        id: string;
        quantity: number;
        unitPrice: number | null;
        visit: number;
        description?: string | undefined;
        overrideReason?: string | undefined;
        positions?: string[] | undefined;
        jaw?: "upper" | "lower" | undefined;
        material?: string | undefined;
        brand?: string | undefined;
        discount?: number | undefined;
    }>, {
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
    }, {
        type: "implant" | "crown" | "veneer" | "bridge" | "extraction" | "sinus" | "graft" | "rootCanal" | "temporary" | "implantCrown";
        id: string;
        quantity: number;
        unitPrice: number | null;
        visit: number;
        description?: string | undefined;
        overrideReason?: string | undefined;
        positions?: string[] | undefined;
        jaw?: "upper" | "lower" | undefined;
        material?: string | undefined;
        brand?: string | undefined;
        discount?: number | undefined;
    }>, "many">;
    visits: z.ZodArray<z.ZodObject<{
        number: z.ZodNumber;
        nights: z.ZodNumber;
        hotelRate: z.ZodEffects<z.ZodNumber, number, number>;
        hotelIncluded: z.ZodBoolean;
        transfer: z.ZodEnum<["included", "excluded", "paid"]>;
        transferPrice: z.ZodEffects<z.ZodNumber, number, number>;
        itinerary: z.ZodDefault<z.ZodArray<z.ZodObject<{
            day: z.ZodNumber;
            text: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            text: string;
            day: number;
        }, {
            text: string;
            day: number;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
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
    }, {
        number: number;
        nights: number;
        hotelRate: number;
        hotelIncluded: boolean;
        transfer: "included" | "excluded" | "paid";
        transferPrice: number;
        itinerary?: {
            text: string;
            day: number;
        }[] | undefined;
    }>, "many">;
    healing: z.ZodNullable<z.ZodObject<{
        minMonths: z.ZodNumber;
        maxMonths: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        minMonths: number;
        maxMonths: number;
    }, {
        minMonths: number;
        maxMonths: number;
    }>>;
    includedServices: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    findings: z.ZodDefault<z.ZodRecord<z.ZodEffects<z.ZodString, string, string>, z.ZodEnum<["unknown", "healthy", "missing", "existingCrown"]>>>;
}, "strip", z.ZodTypeAny, {
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
    }[];
    healing: {
        minMonths: number;
        maxMonths: number;
    } | null;
    includedServices: string[];
    findings: Record<string, "missing" | "unknown" | "healthy" | "existingCrown">;
}, {
    currency: string;
    language: "tr" | "de" | "fr" | "ru" | "ar" | "en" | "es" | "it" | "pl" | "hr";
    version: 1;
    treatmentText: string;
    lines: {
        type: "implant" | "crown" | "veneer" | "bridge" | "extraction" | "sinus" | "graft" | "rootCanal" | "temporary" | "implantCrown";
        id: string;
        quantity: number;
        unitPrice: number | null;
        visit: number;
        description?: string | undefined;
        overrideReason?: string | undefined;
        positions?: string[] | undefined;
        jaw?: "upper" | "lower" | undefined;
        material?: string | undefined;
        brand?: string | undefined;
        discount?: number | undefined;
    }[];
    visits: {
        number: number;
        nights: number;
        hotelRate: number;
        hotelIncluded: boolean;
        transfer: "included" | "excluded" | "paid";
        transferPrice: number;
        itinerary?: {
            text: string;
            day: number;
        }[] | undefined;
    }[];
    healing: {
        minMonths: number;
        maxMonths: number;
    } | null;
    includedServices?: string[] | undefined;
    findings?: Record<string, "missing" | "unknown" | "healthy" | "existingCrown"> | undefined;
}>, {
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
    }[];
    healing: {
        minMonths: number;
        maxMonths: number;
    } | null;
    includedServices: string[];
    findings: Record<string, "missing" | "unknown" | "healthy" | "existingCrown">;
}, {
    currency: string;
    language: "tr" | "de" | "fr" | "ru" | "ar" | "en" | "es" | "it" | "pl" | "hr";
    version: 1;
    treatmentText: string;
    lines: {
        type: "implant" | "crown" | "veneer" | "bridge" | "extraction" | "sinus" | "graft" | "rootCanal" | "temporary" | "implantCrown";
        id: string;
        quantity: number;
        unitPrice: number | null;
        visit: number;
        description?: string | undefined;
        overrideReason?: string | undefined;
        positions?: string[] | undefined;
        jaw?: "upper" | "lower" | undefined;
        material?: string | undefined;
        brand?: string | undefined;
        discount?: number | undefined;
    }[];
    visits: {
        number: number;
        nights: number;
        hotelRate: number;
        hotelIncluded: boolean;
        transfer: "included" | "excluded" | "paid";
        transferPrice: number;
        itinerary?: {
            text: string;
            day: number;
        }[] | undefined;
    }[];
    healing: {
        minMonths: number;
        maxMonths: number;
    } | null;
    includedServices?: string[] | undefined;
    findings?: Record<string, "missing" | "unknown" | "healthy" | "existingCrown"> | undefined;
}>;
export type Consultation = z.infer<typeof ConsultationSchema>;
export type ConsultationLine = z.infer<typeof ConsultationLineSchema>;
export declare const DocumentConfigurationSchema: z.ZodEffects<z.ZodObject<{
    department: z.ZodDefault<z.ZodString>;
    representative: z.ZodOptional<z.ZodString>;
    billingLegalName: z.ZodOptional<z.ZodString>;
    billingTaxId: z.ZodOptional<z.ZodString>;
    invoicePaymentInstructions: z.ZodOptional<z.ZodString>;
    signature: z.ZodOptional<z.ZodString>;
    stamp: z.ZodOptional<z.ZodString>;
    logo: z.ZodOptional<z.ZodString>;
    coverPhoto: z.ZodOptional<z.ZodString>;
    priceList: z.ZodDefault<z.ZodArray<z.ZodObject<{
        type: z.ZodEnum<["implant", "crown", "veneer", "extraction", "sinus", "graft", "rootCanal", "bridge", "temporary", "implantCrown"]>;
        currency: z.ZodEffects<z.ZodString, string, string>;
        unitPrice: z.ZodEffects<z.ZodNumber, number, number>;
        material: z.ZodOptional<z.ZodString>;
        brand: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        type: "implant" | "crown" | "veneer" | "bridge" | "extraction" | "sinus" | "graft" | "rootCanal" | "temporary" | "implantCrown";
        currency: string;
        unitPrice: number;
        material?: string | undefined;
        brand?: string | undefined;
    }, {
        type: "implant" | "crown" | "veneer" | "bridge" | "extraction" | "sinus" | "graft" | "rootCanal" | "temporary" | "implantCrown";
        currency: string;
        unitPrice: number;
        material?: string | undefined;
        brand?: string | undefined;
    }>, "many">>;
    healing: z.ZodDefault<z.ZodNullable<z.ZodObject<{
        minMonths: z.ZodNumber;
        maxMonths: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        minMonths: number;
        maxMonths: number;
    }, {
        minMonths: number;
        maxMonths: number;
    }>>>;
    defaultNights: z.ZodDefault<z.ZodArray<z.ZodNumber, "many">>;
    defaultHotelRate: z.ZodDefault<z.ZodEffects<z.ZodNumber, number, number>>;
    defaultHotelIncluded: z.ZodDefault<z.ZodBoolean>;
    services: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    warranties: z.ZodDefault<z.ZodArray<z.ZodObject<{
        type: z.ZodEnum<["implant", "crown", "veneer", "extraction", "sinus", "graft", "rootCanal", "bridge", "temporary", "implantCrown"]>;
        duration: z.ZodEnum<["lifetime", "months"]>;
        months: z.ZodOptional<z.ZodNumber>;
        summary: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        type: "implant" | "crown" | "veneer" | "bridge" | "extraction" | "sinus" | "graft" | "rootCanal" | "temporary" | "implantCrown";
        duration: "months" | "lifetime";
        summary: string;
        months?: number | undefined;
    }, {
        type: "implant" | "crown" | "veneer" | "bridge" | "extraction" | "sinus" | "graft" | "rootCanal" | "temporary" | "implantCrown";
        duration: "months" | "lifetime";
        summary: string;
        months?: number | undefined;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    healing: {
        minMonths: number;
        maxMonths: number;
    } | null;
    department: string;
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
}, {
    healing?: {
        minMonths: number;
        maxMonths: number;
    } | null | undefined;
    department?: string | undefined;
    signature?: string | undefined;
    representative?: string | undefined;
    billingLegalName?: string | undefined;
    billingTaxId?: string | undefined;
    invoicePaymentInstructions?: string | undefined;
    stamp?: string | undefined;
    logo?: string | undefined;
    coverPhoto?: string | undefined;
    priceList?: {
        type: "implant" | "crown" | "veneer" | "bridge" | "extraction" | "sinus" | "graft" | "rootCanal" | "temporary" | "implantCrown";
        currency: string;
        unitPrice: number;
        material?: string | undefined;
        brand?: string | undefined;
    }[] | undefined;
    defaultNights?: number[] | undefined;
    defaultHotelRate?: number | undefined;
    defaultHotelIncluded?: boolean | undefined;
    services?: string[] | undefined;
    warranties?: {
        type: "implant" | "crown" | "veneer" | "bridge" | "extraction" | "sinus" | "graft" | "rootCanal" | "temporary" | "implantCrown";
        duration: "months" | "lifetime";
        summary: string;
        months?: number | undefined;
    }[] | undefined;
}>, {
    healing: {
        minMonths: number;
        maxMonths: number;
    } | null;
    department: string;
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
}, {
    healing?: {
        minMonths: number;
        maxMonths: number;
    } | null | undefined;
    department?: string | undefined;
    signature?: string | undefined;
    representative?: string | undefined;
    billingLegalName?: string | undefined;
    billingTaxId?: string | undefined;
    invoicePaymentInstructions?: string | undefined;
    stamp?: string | undefined;
    logo?: string | undefined;
    coverPhoto?: string | undefined;
    priceList?: {
        type: "implant" | "crown" | "veneer" | "bridge" | "extraction" | "sinus" | "graft" | "rootCanal" | "temporary" | "implantCrown";
        currency: string;
        unitPrice: number;
        material?: string | undefined;
        brand?: string | undefined;
    }[] | undefined;
    defaultNights?: number[] | undefined;
    defaultHotelRate?: number | undefined;
    defaultHotelIncluded?: boolean | undefined;
    services?: string[] | undefined;
    warranties?: {
        type: "implant" | "crown" | "veneer" | "bridge" | "extraction" | "sinus" | "graft" | "rootCanal" | "temporary" | "implantCrown";
        duration: "months" | "lifetime";
        summary: string;
        months?: number | undefined;
    }[] | undefined;
}>;
export type DocumentConfiguration = z.infer<typeof DocumentConfigurationSchema>;
export declare function consultationTotals(plan: Consultation): {
    visits: {
        number: number;
        treatments: number;
        hotel: number;
        transfer: number;
        total: number;
        unpriced: boolean;
    }[];
    total: number;
    unpriced: boolean;
};
/** Deterministic parsing. Quantities/jaws are read; positions are never inferred. */
export declare function parseConsultation(text: string, currency: string, config: DocumentConfiguration): {
    lines: ConsultationLine[];
    warnings: string[];
};
export type ConsultationTooth = 'unknown' | 'healthy' | 'missing' | 'existingCrown' | 'bridgePontic' | Procedure;
export declare function consultationChart(plan: Consultation, visit: number): Record<string, ConsultationTooth>;
/** Layer bone procedures and treated canals without replacing their recorded restoration. */
export declare function consultationToothLayers(plan: Consultation, visit: number, fdi: string): ToothLayers;
export declare function consultationBridgeConnectors(plan: Consultation, visit: number): {
    x1: number;
    x2: number;
    y: number;
}[];
export declare function consultationToothGeometry(fdi: string, state: ConsultationTooth): ToothLayers;
export type ItineraryKey = 'arrival' | 'assessment' | 'surgery' | 'review' | 'preparation' | 'laboratory' | 'fitting' | 'departure' | 'rootCanal';
/** N nights means N+1 days. Short stays warn; they never silently compress clinical work. */
export declare function consultationItinerary(plan: Consultation, visit: number): {
    day: number;
    key?: ItineraryKey;
    text?: string;
}[];
export declare function consultationWarnings(plan: Consultation): string[];
export declare function unassignedConsultationUnits(plan: Consultation, visit: number): {
    count: number;
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
//# sourceMappingURL=consultation.d.ts.map