"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ROUTE_ACCESS = exports.FILE_OWNER_ACCESS = exports.CLINIC_ADMIN = exports.PLAN_COORDINATION = exports.APPOINTMENT_WRITE = exports.SCHEDULING = exports.PATIENT_FACING = exports.PIPELINE_WRITE = exports.PIPELINE = exports.CLINICAL = exports.FINANCE = exports.MANAGEMENT = exports.ALL_STAFF = void 0;
exports.canAccessFilesFor = canAccessFilesFor;
exports.canAccessRoute = canAccessRoute;
exports.landingRoute = landingRoute;
const enums_1 = require("../enums");
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
exports.ALL_STAFF = [
    enums_1.Role.SUPER_ADMIN,
    enums_1.Role.CLINIC_MANAGER,
    enums_1.Role.RECEPTION,
    enums_1.Role.SALES_CONSULTANT,
    enums_1.Role.DENTIST,
];
/** Runs the clinic. Sees everything, including money and other people's work. */
exports.MANAGEMENT = [enums_1.Role.SUPER_ADMIN, enums_1.Role.CLINIC_MANAGER];
/**
 * Money: invoices, payments, revenue, margins, case economics.
 *
 * Reception raises invoices but does not need the clinic's revenue, and a sales consultant's
 * commission conversation should not open with them having read the P&L.
 */
exports.FINANCE = exports.MANAGEMENT;
/**
 * Clinical records: medical history, allergies, diagnoses, insurance.
 *
 * Reception is included — they take the medical questionnaire at the desk and have to see what a
 * patient already answered. Sales is not: they sell the trip, and a patient's medical history is
 * not theirs to read.
 */
exports.CLINICAL = [enums_1.Role.SUPER_ADMIN, enums_1.Role.CLINIC_MANAGER, enums_1.Role.DENTIST, enums_1.Role.RECEPTION];
/** The sales pipeline: deals, campaigns, lead reporting. */
exports.PIPELINE = [enums_1.Role.SUPER_ADMIN, enums_1.Role.CLINIC_MANAGER, enums_1.Role.SALES_CONSULTANT];
/** The pipeline plus the front desk, who enter the enquiries that walk in and ring. */
exports.PIPELINE_WRITE = [...exports.PIPELINE, enums_1.Role.RECEPTION];
/**
 * Anyone who talks to patients, and so needs the conversation history.
 *
 * The dentist is out: they meet the patient in the chair, and the inbox is a front-desk and sales
 * tool carrying price negotiations.
 */
exports.PATIENT_FACING = [
    enums_1.Role.SUPER_ADMIN,
    enums_1.Role.CLINIC_MANAGER,
    enums_1.Role.RECEPTION,
    enums_1.Role.SALES_CONSULTANT,
];
/**
 * Who is coming to the clinic, and when.
 *
 * Everyone, deliberately. An appointment carries a name and a time, not a diagnosis or a price,
 * and where patients fly in for treatment, knowing who lands on Thursday is ordinary operational
 * information rather than a privilege.
 */
exports.SCHEDULING = exports.ALL_STAFF;
/**
 * Who may actually book and change appointments.
 *
 * Narrower than SCHEDULING, which only governs reading the diary. A sales consultant sees who is
 * coming and when, because they coordinate the trip, but the chair is booked by the desk and the
 * clinicians. Booking also needs a patient search, and patient records are not theirs to read —
 * so the button is hidden rather than offered and then refused halfway through.
 */
exports.APPOINTMENT_WRITE = [
    enums_1.Role.SUPER_ADMIN,
    enums_1.Role.CLINIC_MANAGER,
    enums_1.Role.RECEPTION,
    enums_1.Role.DENTIST,
];
/** Treatment plans: the dentists who write them and the coordinators who quote them. */
exports.PLAN_COORDINATION = [
    enums_1.Role.SUPER_ADMIN,
    enums_1.Role.CLINIC_MANAGER,
    enums_1.Role.DENTIST,
    enums_1.Role.SALES_CONSULTANT,
];
/** Changing how the clinic itself is configured, and moving deals between salespeople. */
exports.CLINIC_ADMIN = [enums_1.Role.SUPER_ADMIN];
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
exports.FILE_OWNER_ACCESS = {
    // Radiographs, CT scans and clinical photographs are the medical record.
    PATIENT: exports.CLINICAL,
    TREATMENT_PLAN: exports.PLAN_COORDINATION,
    TREATMENT_PLAN_ITEM: exports.PLAN_COORDINATION,
    WARRANTY: exports.PLAN_COORDINATION,
    // A deal's paperwork is passports and flight tickets, collected by sales and the front desk.
    LEAD: exports.PIPELINE_WRITE,
    /**
     * Whatever was sent or received in a thread.
     *
     * PATIENT_FACING, matching who can read the thread — not CLINICAL like `PATIENT`. A sales
     * consultant can already read every message in a conversation; refusing them the photo attached
     * to one of those messages would be incoherent, and would mean the attachment button worked for
     * some of the people the inbox is built for and not others.
     *
     * The consequence is deliberate and worth naming: a file a patient sends in chat is reachable by
     * sales, where a radiograph filed against the patient record is not. They are different acts —
     * the patient chose to put one in a conversation sales is part of.
     */
    CONVERSATION: exports.PATIENT_FACING,
    INVOICE: exports.FINANCE,
    APPOINTMENT: exports.SCHEDULING,
    USER: exports.MANAGEMENT,
    OTHER: exports.MANAGEMENT,
};
/** Whether this role may read or write files hanging off this kind of record. */
function canAccessFilesFor(ownerType, role) {
    if (!role)
        return false;
    const allowed = exports.FILE_OWNER_ACCESS[ownerType];
    // An owner type nobody has classified is refused rather than waved through: adding a new
    // attachable thing should require saying whose it is.
    if (!allowed)
        return false;
    return allowed.includes(role);
}
/**
 * Which roles may open each page of the dashboard.
 *
 * Mirrors the @Roles on the endpoints each page depends on. A page listed for a role it cannot
 * actually load is worse than no page at all: it offers the work and then refuses it.
 */
exports.ROUTE_ACCESS = {
    '/dashboard': exports.MANAGEMENT,
    '/my-day': exports.PIPELINE_WRITE,
    '/patients': exports.CLINICAL,
    '/pipeline': exports.PIPELINE,
    '/team': exports.CLINIC_ADMIN,
    '/campaigns': exports.PIPELINE,
    '/inbox': exports.PATIENT_FACING,
    '/appointments': exports.SCHEDULING,
    '/finance': exports.FINANCE,
    '/reports': exports.MANAGEMENT,
    // Readable by all — the clinic's name and currency are wanted product-wide. Writing is Super
    // Admin only, enforced on the endpoint and reflected in the form.
    '/settings': exports.ALL_STAFF,
};
function canAccessRoute(path, role) {
    if (!role)
        return false;
    const allowed = exports.ROUTE_ACCESS[path];
    // An unlisted route is not silently opened: someone adding a page has to say who it is for.
    if (!allowed)
        return false;
    return allowed.includes(role);
}
/**
 * Where a role should land after logging in.
 *
 * The dashboard is management's, so sending everyone there greeted half the clinic with a page
 * they cannot load. Each role starts on the first page it can actually use.
 */
function landingRoute(role) {
    const order = ['/dashboard', '/my-day', '/pipeline', '/appointments', '/patients', '/inbox', '/settings'];
    return order.find((r) => canAccessRoute(r, role)) ?? '/settings';
}
//# sourceMappingURL=policy.js.map