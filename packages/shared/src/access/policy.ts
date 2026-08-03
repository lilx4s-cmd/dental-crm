import { Role } from '../enums';

/**
 * Who may reach what.
 *
 * A review found 29 API endpoints with no role restriction at all, which meant any staff login
 * reached every one: a sales consultant could list every patient's allergies and diagnosis, anyone
 * could read clinic-wide revenue, and any logged-in user could rewrite the clinic's settings.
 * Nest's RolesGuard is fail-open by design — a handler with no @Roles is allowed for every
 * authenticated caller — so an endpoint written without one was open by omission, not by decision.
 *
 * This lives in shared rather than in the API because both surfaces have to agree. The API decides
 * whether a request is answered; the sidebar decides whether a page is offered. Two copies of that
 * judgement drift, and the way it shows up is a nav link that answers 403 — the app telling
 * somebody they may do a thing and then refusing when they try.
 *
 * The groups are named for the answer they give rather than the roles they hold, so a decision
 * reads as "invoices are FINANCE" instead of a list to decode. Adding a role to the clinic means
 * revisiting this file, and nowhere else.
 */

/** Everyone with a staff login. For anything carrying no clinical or financial detail. */
export const ALL_STAFF = [
  Role.SUPER_ADMIN,
  Role.CLINIC_MANAGER,
  Role.RECEPTION,
  Role.SALES_CONSULTANT,
  Role.DENTIST,
] as const;

/** Runs the clinic. Sees everything, including money and other people's work. */
export const MANAGEMENT = [Role.SUPER_ADMIN, Role.CLINIC_MANAGER] as const;

/**
 * Money: invoices, payments, revenue, margins, case economics.
 *
 * Reception raises invoices but does not need the clinic's revenue, and a sales consultant's
 * commission conversation should not open with them having read the P&L.
 */
export const FINANCE = MANAGEMENT;

/**
 * Clinical records: medical history, allergies, diagnoses, insurance.
 *
 * Reception is included — they take the medical questionnaire at the desk and have to see what a
 * patient already answered. Sales is not: they sell the trip, and a patient's medical history is
 * not theirs to read.
 */
export const CLINICAL = [Role.SUPER_ADMIN, Role.CLINIC_MANAGER, Role.DENTIST, Role.RECEPTION] as const;

/** The sales pipeline: deals, campaigns, lead reporting. */
export const PIPELINE = [Role.SUPER_ADMIN, Role.CLINIC_MANAGER, Role.SALES_CONSULTANT] as const;

/** The pipeline plus the front desk, who enter the enquiries that walk in and ring. */
export const PIPELINE_WRITE = [...PIPELINE, Role.RECEPTION] as const;

/**
 * Anyone who talks to patients, and so needs the conversation history.
 *
 * The dentist is out: they meet the patient in the chair, and the inbox is a front-desk and sales
 * tool carrying price negotiations.
 */
export const PATIENT_FACING = [
  Role.SUPER_ADMIN,
  Role.CLINIC_MANAGER,
  Role.RECEPTION,
  Role.SALES_CONSULTANT,
] as const;

/**
 * Who is coming to the clinic, and when.
 *
 * Everyone, deliberately. An appointment carries a name and a time, not a diagnosis or a price,
 * and where patients fly in for treatment, knowing who lands on Thursday is ordinary operational
 * information rather than a privilege.
 */
export const SCHEDULING = ALL_STAFF;

/**
 * Who may actually book and change appointments.
 *
 * Narrower than SCHEDULING, which only governs reading the diary. A sales consultant sees who is
 * coming and when, because they coordinate the trip, but the chair is booked by the desk and the
 * clinicians. Booking also needs a patient search, and patient records are not theirs to read —
 * so the button is hidden rather than offered and then refused halfway through.
 */
export const APPOINTMENT_WRITE = [
  Role.SUPER_ADMIN,
  Role.CLINIC_MANAGER,
  Role.RECEPTION,
  Role.DENTIST,
] as const;

/** Treatment plans: the dentists who write them and the coordinators who quote them. */
export const PLAN_COORDINATION = [
  Role.SUPER_ADMIN,
  Role.CLINIC_MANAGER,
  Role.DENTIST,
  Role.SALES_CONSULTANT,
] as const;

/** Changing how the clinic itself is configured, and moving deals between salespeople. */
export const CLINIC_ADMIN = [Role.SUPER_ADMIN] as const;

/**
 * Who may reach the files attached to a given kind of record.
 *
 * Files are stored polymorphically — one endpoint serves radiographs on a patient and passport
 * scans on a deal — so a single role list on the controller is necessarily wrong in one direction
 * or the other. Gating the whole module to the treatment-plan roles gave a sales consultant access
 * to X-rays through the API while locking reception out of the passport they had just scanned.
 *
 * The rule is that a record's files answer to the same people as the record itself.
 */
export const FILE_OWNER_ACCESS: Record<string, readonly Role[]> = {
  // Radiographs, CT scans and clinical photographs are the medical record.
  PATIENT: CLINICAL,
  TREATMENT_PLAN: PLAN_COORDINATION,
  TREATMENT_PLAN_ITEM: PLAN_COORDINATION,
  WARRANTY: PLAN_COORDINATION,
  // A deal's paperwork is passports and flight tickets, collected by sales and the front desk.
  LEAD: PIPELINE_WRITE,
  INVOICE: FINANCE,
  APPOINTMENT: SCHEDULING,
  USER: MANAGEMENT,
  OTHER: MANAGEMENT,
};

/** Whether this role may read or write files hanging off this kind of record. */
export function canAccessFilesFor(ownerType: string, role: string | undefined): boolean {
  if (!role) return false;
  const allowed = FILE_OWNER_ACCESS[ownerType];
  // An owner type nobody has classified is refused rather than waved through: adding a new
  // attachable thing should require saying whose it is.
  if (!allowed) return false;
  return (allowed as readonly string[]).includes(role);
}

/**
 * Which roles may open each page of the dashboard.
 *
 * Mirrors the @Roles on the endpoints each page depends on. A page listed for a role it cannot
 * actually load is worse than no page at all: it offers the work and then refuses it.
 */
export const ROUTE_ACCESS: Record<string, readonly Role[]> = {
  '/dashboard': MANAGEMENT,
  '/my-day': PIPELINE_WRITE,
  '/patients': CLINICAL,
  '/pipeline': PIPELINE,
  '/team': CLINIC_ADMIN,
  '/campaigns': PIPELINE,
  '/inbox': PATIENT_FACING,
  '/appointments': SCHEDULING,
  '/finance': FINANCE,
  '/reports': MANAGEMENT,
  // Readable by all — the clinic's name and currency are wanted product-wide. Writing is Super
  // Admin only, enforced on the endpoint and reflected in the form.
  '/settings': ALL_STAFF,
};

export function canAccessRoute(path: string, role: string | undefined): boolean {
  if (!role) return false;
  const allowed = ROUTE_ACCESS[path];
  // An unlisted route is not silently opened: someone adding a page has to say who it is for.
  if (!allowed) return false;
  return (allowed as readonly string[]).includes(role);
}

/**
 * Where a role should land after logging in.
 *
 * The dashboard is management's, so sending everyone there greeted half the clinic with a page
 * they cannot load. Each role starts on the first page it can actually use.
 */
export function landingRoute(role: string | undefined): string {
  const order = ['/dashboard', '/my-day', '/pipeline', '/appointments', '/patients', '/inbox', '/settings'];
  return order.find((r) => canAccessRoute(r, role)) ?? '/settings';
}
