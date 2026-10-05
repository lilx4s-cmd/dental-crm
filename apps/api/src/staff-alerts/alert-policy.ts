import { z } from 'zod';
export const StaffPreferencesSchema = z
  .object({
    whatsapp: z.boolean().default(false),
    push: z.boolean().default(false),
    optIn: z.boolean().default(false),
    language: z.enum(['en', 'ar', 'fr', 'de', 'es', 'it', 'tr', 'pl', 'hr', 'ru']).default('en'),
    timezone: z
      .string()
      .refine((v) => {
        try {
          new Intl.DateTimeFormat('en', { timeZone: v });
          return true;
        } catch {
          return false;
        }
      }, 'Choose an IANA timezone')
      .default('Europe/Istanbul'),
    days: z.array(z.number().int().min(0).max(6)).min(1).max(7).default([1, 2, 3, 4, 5]),
    start: z.number().int().min(0).max(1439).default(540),
    end: z.number().int().min(1).max(1440).default(1080),
  })
  .refine((v) => v.start !== v.end, 'Working hours cannot be empty');
export const AlertSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  enabledSince: z.string().datetime().nullable().default(null),
  supervisorId: z.string().nullable().default(null),
  reminderMinutes: z.number().int().min(1).max(1440).default(15),
  escalationMinutes: z.number().int().min(1).max(10080).default(30),
  excludedStages: z.array(z.string()).default(['LOST', 'DONE', 'UNQUALIFIED']),
});
export type StaffPreferences = z.infer<typeof StaffPreferencesSchema>;
export function isWorking(at: Date, p: StaffPreferences) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: p.timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const value = (name: string) => parts.find((x) => x.type === name)!.value;
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(value('weekday')),
    minute = Number(value('hour')) * 60 + Number(value('minute'));
  if (p.end > p.start) return p.days.includes(day) && minute >= p.start && minute < p.end;
  return (
    (p.days.includes(day) && minute >= p.start) ||
    (p.days.includes((day + 6) % 7) && minute < p.end)
  );
}
export function workingDeadline(from: Date, minutes: number, p: StaffPreferences) {
  let cursor = new Date(Math.ceil(from.getTime() / 60000) * 60000),
    remaining = minutes;
  for (let count = 0; count < 40 * 1440; count++) {
    if (isWorking(cursor, p)) {
      if (remaining === 0) return cursor;
      remaining--;
    }
    cursor = new Date(cursor.getTime() + 60000);
  }
  throw new Error('Working-hour deadline exceeds 40 days');
}
export function alertText(
  kind: string,
  language: string,
  leadLanguage: string | null,
  source: string,
  url: string,
  minutes: number,
) {
  const text: Record<string, [string, string, string]> = {
    en: ['A new lead has been assigned to you.', 'Please contact the patient.', 'Open lead'],
    ar: ['تم تعيين عميل جديد لك.', 'يرجى التواصل مع المريض.', 'افتح العميل'],
    fr: [
      'Un nouveau prospect vous est attribué.',
      'Veuillez contacter le patient.',
      'Ouvrir le prospect',
    ],
    de: [
      'Ein neuer Kontakt wurde Ihnen zugewiesen.',
      'Bitte kontaktieren Sie den Patienten.',
      'Kontakt öffnen',
    ],
    es: ['Se le ha asignado un nuevo contacto.', 'Contacte con el paciente.', 'Abrir contacto'],
    it: ['Ti è stato assegnato un nuovo contatto.', 'Contatta il paziente.', 'Apri contatto'],
    tr: ['Size yeni bir müşteri atandı.', 'Lütfen hastayla iletişime geçin.', 'Müşteriyi aç'],
    pl: ['Przydzielono Ci nowy kontakt.', 'Skontaktuj się z pacjentem.', 'Otwórz kontakt'],
    hr: ['Dodijeljen vam je novi kontakt.', 'Kontaktirajte pacijenta.', 'Otvori kontakt'],
    ru: ['Вам назначен новый контакт.', 'Свяжитесь с пациентом.', 'Открыть контакт'],
  };
  const t = text[language] ?? text.en;
  return kind === 'TEST'
    ? `🔔 CRM notification test\n${url}`
    : `🔔 ${kind === 'ASSIGNMENT' ? t[0] : t[1]}\n${leadLanguage ?? '—'} · ${source}\n${minutes} min · ${t[1]}\n${t[2]}: ${url}`;
}
