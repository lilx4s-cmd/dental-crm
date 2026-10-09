export declare const CLINIC_TIMEZONE = "Europe/Istanbul";
export type PatientTreatmentStatus = 'WORKING' | 'FINISHED';
export type PatientView = 'all' | 'working' | 'finished' | 'reservations';
export type PatientEventKind = 'APPOINTMENT' | 'ARRIVAL' | 'DEPARTURE';
export interface PatientCalendarEvent {
    id: string;
    kind: PatientEventKind;
    patientId: string;
    patientName: string;
    bookingId: string;
    leadId: string;
    visit: number;
    startTime: string;
    endTime: string;
    localTime: string;
    timezone: string;
    flightNumber: string;
    route: string;
}
export declare function patientMonth(at: Date | string): string;
export declare function patientMonthRange(month: string): {
    from: Date;
    to: Date;
};
/** Catch up to the most urgent band, rather than sending every missed reminder at once. */
export declare function patientReminderBand(at: Date, now: Date, hours?: readonly number[]): number | null;
//# sourceMappingURL=schedule.d.ts.map