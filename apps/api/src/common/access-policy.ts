/**
 * The clinic's access policy, re-exported for the controllers.
 *
 * The decisions themselves live in `packages/shared` because the sidebar has to make the same ones
 * — the API decides whether a request is answered, the nav decides whether a page is offered, and
 * two copies of that judgement drift into a link that answers 403. This file exists only so a
 * controller can write `from '../common/access-policy'` alongside its other local imports.
 */
export {
  ALL_STAFF,
  MANAGEMENT,
  FINANCE,
  CLINICAL,
  PIPELINE,
  PIPELINE_WRITE,
  PATIENT_FACING,
  SCHEDULING,
  PLAN_COORDINATION,
  APPOINTMENT_WRITE,
  CLINIC_ADMIN,
} from '@dental-crm/shared';

/** Changing how the clinic is configured. Named for the act rather than the group. */
export { CLINIC_ADMIN as CLINIC_SETTINGS_WRITE } from '@dental-crm/shared';
