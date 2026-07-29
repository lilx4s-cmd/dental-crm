import { Role } from '@dental-crm/shared';
import {
  ALL_STAFF,
  APPOINTMENT_WRITE,
  CLINICAL,
  CLINIC_ADMIN,
  FINANCE,
  MANAGEMENT,
  PATIENT_FACING,
  PIPELINE,
  ROUTE_ACCESS,
  SCHEDULING,
  canAccessRoute,
  landingRoute,
} from '@dental-crm/shared';

// These assertions are the clinic's decisions about who sees what, written down where a change has
// to break something visible. The API and the sidebar both read this policy, so a quiet edit here
// would widen access in two places at once and neither would complain.

const EVERY_ROLE = Object.values(Role) as string[];

describe('access policy groups', () => {
  it('keeps a patient\'s medical record away from sales', () => {
    // A sales consultant sells the trip. Allergies and diagnoses are not theirs to read, and the
    // patient list carries both.
    expect(CLINICAL).not.toContain(Role.SALES_CONSULTANT);
    expect(CLINICAL).toContain(Role.DENTIST);
    expect(CLINICAL).toContain(Role.RECEPTION);
  });

  it('keeps clinic revenue to management', () => {
    expect(FINANCE).toEqual(expect.arrayContaining([Role.SUPER_ADMIN, Role.CLINIC_MANAGER]));
    expect(FINANCE).not.toContain(Role.RECEPTION);
    expect(FINANCE).not.toContain(Role.SALES_CONSULTANT);
    expect(FINANCE).not.toContain(Role.DENTIST);
  });

  it('gives clinic configuration to exactly one role', () => {
    expect([...CLINIC_ADMIN]).toEqual([Role.SUPER_ADMIN]);
  });

  it('keeps the price-negotiation inbox away from the dentist', () => {
    expect(PATIENT_FACING).not.toContain(Role.DENTIST);
  });

  it('lets everyone read the diary but not everyone book it', () => {
    // Sales coordinates the trip and needs to know who lands on Thursday; the chair is booked by
    // the desk and the clinicians. Booking also needs a patient search, which sales cannot make.
    expect(SCHEDULING).toContain(Role.SALES_CONSULTANT);
    expect(APPOINTMENT_WRITE).not.toContain(Role.SALES_CONSULTANT);
    expect(APPOINTMENT_WRITE).toContain(Role.RECEPTION);
    expect(APPOINTMENT_WRITE).toContain(Role.DENTIST);
  });

  it('never lets a role write something it cannot read', () => {
    // A right to change what you cannot see is a bug in the policy, not a feature.
    for (const role of APPOINTMENT_WRITE) expect(SCHEDULING).toContain(role);
  });

  it('leaves the pipeline to the people selling', () => {
    expect(PIPELINE).not.toContain(Role.DENTIST);
  });

  it('includes every role in ALL_STAFF, so adding one cannot be forgotten here', () => {
    expect([...ALL_STAFF].sort()).toEqual([...EVERY_ROLE].sort());
  });

  it('never grants more than management', () => {
    for (const group of [MANAGEMENT, FINANCE, CLINIC_ADMIN]) {
      expect(group).toContain(Role.SUPER_ADMIN);
    }
  });
});

describe('canAccessRoute', () => {
  it('refuses an unknown route rather than opening it', () => {
    // Fail closed: adding a page should require saying who it is for.
    expect(canAccessRoute('/some-new-page', Role.SUPER_ADMIN)).toBe(false);
  });

  it('refuses when there is no role at all', () => {
    expect(canAccessRoute('/dashboard', undefined)).toBe(false);
  });

  it('keeps reception off the reports and finance pages', () => {
    expect(canAccessRoute('/reports', Role.RECEPTION)).toBe(false);
    expect(canAccessRoute('/finance', Role.RECEPTION)).toBe(false);
    // But they still run the front desk.
    expect(canAccessRoute('/appointments', Role.RECEPTION)).toBe(true);
    expect(canAccessRoute('/patients', Role.RECEPTION)).toBe(true);
  });

  it('keeps a sales consultant out of patient records', () => {
    expect(canAccessRoute('/patients', Role.SALES_CONSULTANT)).toBe(false);
    expect(canAccessRoute('/pipeline', Role.SALES_CONSULTANT)).toBe(true);
    expect(canAccessRoute('/inbox', Role.SALES_CONSULTANT)).toBe(true);
  });

  it('lets a dentist see who is coming without seeing the money', () => {
    expect(canAccessRoute('/appointments', Role.DENTIST)).toBe(true);
    expect(canAccessRoute('/patients', Role.DENTIST)).toBe(true);
    expect(canAccessRoute('/finance', Role.DENTIST)).toBe(false);
    expect(canAccessRoute('/reports', Role.DENTIST)).toBe(false);
  });

  it('gives the super admin every page', () => {
    for (const route of Object.keys(ROUTE_ACCESS)) {
      expect(canAccessRoute(route, Role.SUPER_ADMIN)).toBe(true);
    }
  });

  it('leaves no route unreachable by everyone', () => {
    // A page no role can open is a page that should not be in the nav at all.
    for (const [route, allowed] of Object.entries(ROUTE_ACCESS)) {
      expect(allowed.length).toBeGreaterThan(0);
      expect(route.startsWith('/')).toBe(true);
    }
  });
});

describe('landingRoute', () => {
  it('sends every role somewhere it is actually allowed', () => {
    // The dashboard is management's; sending everyone there greeted half the clinic with a page
    // they could not load.
    for (const role of EVERY_ROLE) {
      const route = landingRoute(role);
      expect(canAccessRoute(route, role)).toBe(true);
    }
  });

  it('starts management on the dashboard', () => {
    expect(landingRoute(Role.SUPER_ADMIN)).toBe('/dashboard');
    expect(landingRoute(Role.CLINIC_MANAGER)).toBe('/dashboard');
  });

  it('starts the front desk and sales on their own work', () => {
    expect(landingRoute(Role.RECEPTION)).toBe('/my-day');
    expect(landingRoute(Role.SALES_CONSULTANT)).toBe('/my-day');
  });

  it('starts the dentist on the day\'s appointments', () => {
    expect(landingRoute(Role.DENTIST)).toBe('/appointments');
  });
});
