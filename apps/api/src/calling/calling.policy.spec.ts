import { callableNumber, canPlaceCalls } from './calling.policy';
import { JwtPayload, Role } from '@dental-crm/shared';
const user = (role: Role, permissions?: Record<string, boolean>) => ({ sub: 'staff', role, permissions } as JwtPayload);
describe('patient calling access and destinations', () => {
  it('allows authorized sales and reception, keeps management read-only', () => {
    expect(canPlaceCalls(user(Role.SALES_CONSULTANT))).toBe(true);
    expect(canPlaceCalls(user(Role.RECEPTION))).toBe(true);
    for (const role of [Role.SUPER_ADMIN, Role.CLINIC_MANAGER, Role.DENTIST]) expect(canPlaceCalls(user(role, { 'calls.place': true }))).toBe(false);
  });
  it.each(['calls.place', 'calls.read', 'leads.read'])('honors denial of %s', key => {
    expect(canPlaceCalls(user(Role.SALES_CONSULTANT, { [key]: false }))).toBe(false);
  });
  it('accepts actual US and Canadian numbers', () => {
    expect(callableNumber('+1 202 555 0100')).toBe('+12025550100');
    expect(callableNumber('(416) 555-0100', 'CA')).toBe('+14165550100');
  });
  it('does not guess a country or treat all +1 numbers as Canada/US', () => {
    for (const phone of ['2025550100', '+12425550100', '+905551234567', 'sip:someone@sip.telnyx.com', '+19005550100']) expect(callableNumber(phone)).toBeNull();
  });
});
