import { AuditAction } from '@prisma/client';

/**
 * Which routes write to the audit trail, and what they touched.
 *
 * `AuditLog` has carried `oldValues` and `newValues` columns since the schema was written and was
 * populated at exactly two places, both in `AuthService` — it was a login journal, not an audit
 * trail. Nothing recorded who changed a diagnosis, who moved a price, or who edited a medication
 * list on a record a dentist treats from. For a system holding medical data that is a liability
 * before it is a missing feature.
 *
 * A registry rather than blanket coverage of all 77 mutating routes, for two reasons. Auditing
 * everything makes the log unreadable — a trail nobody can search is not evidence of anything —
 * and it would capture bodies that must never be persisted twice, like the password on
 * `POST /users`. So this lists what a regulator, an insurer or an argument with a patient would
 * actually need: the clinical record, the money, and who can reach them.
 *
 * Deliberately *not* audited, and why:
 *   - `/auth/*`        — already audited inside AuthService, which has the user before the guard does.
 *   - `/ai/*`          — generates drafts; nothing is persisted until a human saves it elsewhere.
 *   - `/whatsapp/*`, `/conversations/*` — every message is already a durable row with a sender.
 *   - `/intake`, `/portal/*` — public, unauthenticated; there is no actor to attribute.
 *   - `/facebook/webhook` — machine-to-machine.
 */

export interface AuditRule {
  /** Express path with parameters, as Nest reports it — e.g. `patients/:id`. */
  readonly path: RegExp;
  readonly methods: readonly string[];
  /** What was touched, in the language a person would use when searching the trail. */
  readonly entityType: string;
  /** Which route parameter carries the entity's id, when the URL has one. */
  readonly idParam?: string;
  /**
   * Overrides the verb-derived action for endpoints where POST does not mean "created".
   *
   * Plenty of routes here are commands rather than creations — resetting a password, merging
   * duplicates, converting a lead. Deriving the action from the HTTP verb alone labelled all of
   * them CREATE, so the production trail recorded seven password resets as "CREATE User". A trail
   * that describes the wrong thing is worse than a gap, because a gap is visibly a gap.
   */
  readonly action?: AuditAction;
}

const ID = ':id';

export const AUDIT_RULES: readonly AuditRule[] = [
  // Commands first: `ruleFor` takes the first match, so anything more specific than the
  // entity-wide rules below has to be listed above them.
  {
    path: /^users\/[^/]+\/(reset-password|revoke-sessions|activate)$/,
    methods: ['POST', 'PATCH'],
    entityType: 'User',
    idParam: ID,
    action: 'UPDATE',
  },
  { path: /^leads\/duplicates\/merge$/, methods: ['POST'], entityType: 'Lead', action: 'UPDATE' },
  /**
   * Bulk actions carry no `:id` — the ids are in the body, which the interceptor already records
   * as `newValues`. So the row names the act and the selection, which is the question anyone
   * actually asks of a bulk edit: not "what happened to this deal" but "who archived forty".
   *
   * The export rule is the one entry here that exists for a legal reason rather than an
   * operational one. Downloading names, phone numbers and countries is a disclosure of personal
   * data under KVKK and GDPR, and both expect the clinic to be able to say who took a copy and
   * when. EXPORT is a distinct action for exactly that, and was unused until now.
   */
  { path: /^leads\/bulk\/export$/, methods: ['POST'], entityType: 'Lead', action: 'EXPORT' },
  { path: /^leads\/bulk\/(archive|note)$/, methods: ['POST'], entityType: 'Lead', action: 'UPDATE' },
  { path: /^leads\/bulk$/, methods: ['DELETE'], entityType: 'Lead', action: 'DELETE' },
  // Tagging edits the deal; it does not create or destroy one. Without these the verb-derived
  // action would file "took the VIP tag off" under DELETE Lead, which reads as a deleted record.
  { path: /^leads\/bulk\/tags$/, methods: ['POST'], entityType: 'Lead', action: 'UPDATE' },
  // A bulk reminder creates tasks, but what it changes is the deals — and CREATE Lead would read
  // as forty new deals appearing.
  { path: /^leads\/bulk\/tasks$/, methods: ['POST'], entityType: 'Lead', action: 'UPDATE' },
  { path: /^leads\/[^/]+\/tags\//, methods: ['POST', 'DELETE'], entityType: 'Lead', idParam: ID, action: 'UPDATE' },
  // A conversion is the moment a lead becomes a patient record — the most consequential single
  // write in the pipeline, and not a creation of the lead it names.
  { path: /^leads\/[^/]+\/convert$/, methods: ['POST'], entityType: 'Lead', idParam: ID, action: 'UPDATE' },
  { path: /^patients\/[^/]+\/tags\//, methods: ['POST', 'DELETE'], entityType: 'Patient', idParam: ID, action: 'UPDATE' },
  { path: /^invoices\/[^/]+\/payments$/, methods: ['POST'], entityType: 'Invoice', idParam: ID, action: 'UPDATE' },
  {
    path: /^treatment-plans\/[^/]+\/(share-link|schedule-items)/,
    methods: ['POST'],
    entityType: 'TreatmentPlan',
    idParam: ID,
    action: 'UPDATE',
  },

  // The clinical record.
  { path: /^patients(\/[^/]+)?$/, methods: ['POST', 'PATCH', 'DELETE'], entityType: 'Patient', idParam: ID },
  { path: /^patients\/[^/]+\/(economics|case)/, methods: ['POST', 'PATCH'], entityType: 'Patient', idParam: ID },
  { path: /^treatment-plans/, methods: ['POST', 'PATCH', 'DELETE'], entityType: 'TreatmentPlan', idParam: ID },
  { path: /^appointments/, methods: ['POST', 'PATCH', 'DELETE'], entityType: 'Appointment', idParam: ID },
  { path: /^warranties/, methods: ['POST', 'PATCH', 'DELETE'], entityType: 'Warranty', idParam: ID },
  { path: /^lab-orders/, methods: ['POST', 'PATCH', 'DELETE'], entityType: 'LabOrder', idParam: ID },

  // Money.
  { path: /^invoices/, methods: ['POST', 'PATCH', 'DELETE'], entityType: 'Invoice', idParam: ID },

  // Who can reach any of it. A role change is the single most consequential edit in the system.
  { path: /^users/, methods: ['POST', 'PATCH', 'DELETE'], entityType: 'User', idParam: ID },
  { path: /^settings/, methods: ['POST', 'PATCH'], entityType: 'ClinicSettings' },
  // The shared vocabulary. Renaming or deleting a tag changes what every card and every saved
  // filter shows, across both the pipeline and the patient list, in one request.
  { path: /^tags/, methods: ['POST', 'PATCH', 'DELETE'], entityType: 'Tag', idParam: ID },
  /**
   * Saved replies. A wrong price in one of these goes out repeatedly before anyone notices, which
   * makes "who changed it and when" the question that follows.
   *
   * Anchored to the collection and the item, so `POST message-templates/:id/render` matches
   * nothing here and is not audited. There is no exclusion mechanism — a rule that matches *is*
   * the instruction to audit — so leaving the pattern open-ended would have recorded every time
   * anybody opened a picker, and buried the handful of real edits under thousands of uses.
   */
  {
    path: /^message-templates(\/[^/]+)?$/,
    methods: ['POST', 'PATCH', 'DELETE'],
    entityType: 'MessageTemplate',
    idParam: ID,
  },

  // The pipeline. Lower stakes clinically, but a merge is destructive and a reassignment decides
  // whose commission a case counts towards.
  { path: /^leads/, methods: ['POST', 'PATCH', 'DELETE'], entityType: 'Lead', idParam: ID },

  // Files are radiographs and passport scans. Deletion especially needs a name against it.
  { path: /^files/, methods: ['POST', 'DELETE'], entityType: 'File', idParam: ID },
];

export function ruleFor(path: string, method: string): AuditRule | undefined {
  const normalised = path.replace(/^\/?(api\/)?/, '').replace(/\/$/, '');
  return AUDIT_RULES.find((rule) => rule.methods.includes(method) && rule.path.test(normalised));
}

export function actionFor(method: string, rule?: AuditRule): AuditAction {
  if (rule?.action) return rule.action;
  if (method === 'POST') return 'CREATE';
  if (method === 'DELETE') return 'DELETE';
  return 'UPDATE';
}

/**
 * Keys never written to the trail, whatever route they arrive on.
 *
 * The audit log is read by more people than the tables it describes — that is its purpose — so a
 * secret copied into it has been widened, not recorded. `password` is the obvious one:
 * `POST /users` carries a plaintext password that is bcrypt-hashed before storage, and echoing it
 * into an audit row would undo that entirely.
 */
const REDACTED_KEYS = [
  'password',
  'newpassword',
  'currentpassword',
  'passwordhash',
  'token',
  'accesstoken',
  'refreshtoken',
  'secret',
  'apikey',
  'authorization',
];

/** Replaces sensitive values with a marker, recursively, preserving the shape of the change. */
export function redact(value: unknown, depth = 0): unknown {
  // Bodies are user input. A hostile or accidental deeply-nested object should cost a truncated
  // audit row, not a stack overflow inside an interceptor that runs on every write.
  if (depth > 6) return '[truncated]';
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, val]) => [
        key,
        REDACTED_KEYS.includes(key.toLowerCase()) ? '[redacted]' : redact(val, depth + 1),
      ]),
    );
  }
  return value;
}
