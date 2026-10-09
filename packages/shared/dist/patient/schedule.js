"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CLINIC_TIMEZONE = void 0;
exports.patientMonth = patientMonth;
exports.patientMonthRange = patientMonthRange;
exports.patientReminderBand = patientReminderBand;
exports.CLINIC_TIMEZONE = 'Europe/Istanbul';
function patientMonth(at) {
    const parts = new Intl.DateTimeFormat('en', {
        timeZone: exports.CLINIC_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
    }).formatToParts(new Date(at));
    return `${parts.find((p) => p.type === 'year').value}-${parts.find((p) => p.type === 'month').value}`;
}
function patientMonthRange(month) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
        throw new Error('Choose a month and year');
    const [year, number] = month.split('-').map(Number);
    if (year < 1970 || year > 2199)
        throw new Error('Choose a year between 1970 and 2199');
    const from = new Date(`${month}-01T00:00:00+03:00`);
    const next = number === 12 ? `${year + 1}-01` : `${year}-${String(number + 1).padStart(2, '0')}`;
    return { from, to: new Date(`${next}-01T00:00:00+03:00`) };
}
/** Catch up to the most urgent band, rather than sending every missed reminder at once. */
function patientReminderBand(at, now, hours = [168, 24, 2]) {
    const remaining = (at.getTime() - now.getTime()) / 3600000;
    if (remaining <= 0)
        return null;
    return [...hours].sort((a, b) => a - b).find((h) => remaining <= h) ?? null;
}
//# sourceMappingURL=schedule.js.map