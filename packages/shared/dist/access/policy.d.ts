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
export declare const ALL_STAFF: readonly ["SUPER_ADMIN", "CLINIC_MANAGER", "RECEPTION", "SALES_CONSULTANT", "DENTIST"];
/** Runs the clinic. Sees everything, including money and other people's work. */
export declare const MANAGEMENT: readonly ["SUPER_ADMIN", "CLINIC_MANAGER"];
/**
 * Money: invoices, payments, revenue, margins, case economics.
 *
 * Reception raises invoices but does not need the clinic's revenue, and a sales consultant's
 * commission conversation should not open with them having read the P&L.
 */
export declare const FINANCE: readonly ["SUPER_ADMIN", "CLINIC_MANAGER"];
/**
 * Clinical records: medical history, allergies, diagnoses, insurance.
 *
 * Reception is included — they take the medical questionnaire at the desk and have to see what a
 * patient already answered. Sales is not: they sell the trip, and a patient's medical history is
 * not theirs to read.
 */
export declare const CLINICAL: readonly ["SUPER_ADMIN", "CLINIC_MANAGER", "DENTIST", "RECEPTION"];
/** The sales pipeline: deals, campaigns, lead reporting. */
export declare const PIPELINE: readonly ["SUPER_ADMIN", "CLINIC_MANAGER", "SALES_CONSULTANT"];
/** The pipeline plus the front desk, who enter the enquiries that walk in and ring. */
export declare const PIPELINE_WRITE: readonly ["SUPER_ADMIN", "CLINIC_MANAGER", "SALES_CONSULTANT", "RECEPTION"];
/**
 * Anyone who talks to patients, and so needs the conversation history.
 *
 * The dentist is out: they meet the patient in the chair, and the inbox is a front-desk and sales
 * tool carrying price negotiations.
 */
export declare const PATIENT_FACING: readonly ["SUPER_ADMIN", "CLINIC_MANAGER", "RECEPTION", "SALES_CONSULTANT"];
/**
 * Who is coming to the clinic, and when.
 *
 * Everyone, deliberately. An appointment carries a name and a time, not a diagnosis or a price,
 * and where patients fly in for treatment, knowing who lands on Thursday is ordinary operational
 * information rather than a privilege.
 */
export declare const SCHEDULING: readonly ["SUPER_ADMIN", "CLINIC_MANAGER", "RECEPTION", "SALES_CONSULTANT", "DENTIST"];
/**
 * Who may actually book and change appointments.
 *
 * Narrower than SCHEDULING, which only governs reading the diary. A sales consultant sees who is
 * coming and when, because they coordinate the trip, but the chair is booked by the desk and the
 * clinicians. Booking also needs a patient search, and patient records are not theirs to read —
 * so the button is hidden rather than offered and then refused halfway through.
 */
export declare const APPOINTMENT_WRITE: readonly ["SUPER_ADMIN", "CLINIC_MANAGER", "RECEPTION", "DENTIST"];
/** Treatment plans: the dentists who write them and the coordinators who quote them. */
export declare const PLAN_COORDINATION: readonly ["SUPER_ADMIN", "CLINIC_MANAGER", "DENTIST", "SALES_CONSULTANT"];
/** Changing how the clinic itself is configured, and moving deals between salespeople. */
export declare const CLINIC_ADMIN: readonly ["SUPER_ADMIN"];
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
export declare const FILE_OWNER_ACCESS: Record<string, readonly Role[]>;
/** Whether this role may read or write files hanging off this kind of record. */
export declare function canAccessFilesFor(ownerType: string, role: string | undefined): boolean;
/**
 * Which roles may open each page of the dashboard.
 *
 * Mirrors the @Roles on the endpoints each page depends on. A page listed for a role it cannot
 * actually load is worse than no page at all: it offers the work and then refuses it.
 */
export declare const ROUTE_ACCESS: Record<string, readonly Role[]>;
export declare function canAccessRoute(path: string, role: string | undefined): boolean;
/**
 * Where a role should land after logging in.
 *
 * The dashboard is management's, so sending everyone there greeted half the clinic with a page
 * they cannot load. Each role starts on the first page it can actually use.
 */
export declare function landingRoute(role: string | undefined): string;
//# sourceMappingURL=policy.d.ts.map