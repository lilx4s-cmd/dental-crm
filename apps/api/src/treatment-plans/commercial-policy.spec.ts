import { Role, JwtPayload, DocumentConfigurationSchema } from '@dental-crm/shared';
import {
  canonicalPlanItems,
  validateCommercialCreate,
  validateCommercialUpdate,
} from './commercial-policy';
const sales: JwtPayload = {
  sub: 'sales',
  email: 'sales@example.test',
  role: Role.SALES_CONSULTANT,
  permissions: { 'quotes.approve_discount': false },
};
const defaults = {
  defaultCardFeePercent: 16,
  defaultCashDiscountPercent: 0,
  documentConfiguration: { priceList: [{ type: 'implant', currency: 'USD', unitPrice: 1000 }] },
};
const item = {
  procedureType: 'implant' as const,
  description: 'Test implant',
  quantity: 2,
  unitPrice: 1000,
  discount: 0,
  cost: 2000,
};
const dto = { patientId: 'fixture', title: 'Test plan', currency: 'USD', items: [item] };
describe('Authoritative plan pricing', () => {
  it('accepts an approved catalogue price without changing clinic terms', () =>
    expect(() => validateCommercialCreate(dto, defaults, sales)).not.toThrow());
  it('rejects a tampered line total even for the owner', () =>
    expect(() =>
      validateCommercialCreate({ ...dto, items: [{ ...item, cost: 1 }] }, defaults, {
        ...sales,
        role: Role.SUPER_ADMIN,
        permissions: undefined,
      }),
    ).toThrow('Line cost'));
  it.each([
    { ...item, unitPrice: 1, cost: 2 },
    { ...item, discount: 100, cost: 1900 },
  ])('rejects an unapproved price or discount', (line) =>
    expect(() => validateCommercialCreate({ ...dto, items: [line] }, defaults, sales)).toThrow(
      'price-approval',
    ),
  );
  it('requires approval for an unconfigured material, currency or procedure', () => {
    const branded = {
      ...defaults,
      documentConfiguration: {
        priceList: [{ type: 'implant', currency: 'USD', unitPrice: 1000, brand: 'Approved brand' }],
      },
    };
    expect(() => validateCommercialCreate(dto, branded, sales)).toThrow('price-approval');
    expect(() => validateCommercialCreate({ ...dto, currency: 'EUR' }, defaults, sales)).toThrow(
      'price-approval',
    );
    expect(() =>
      validateCommercialCreate(
        { ...dto, items: [{ ...item, procedureType: 'bridge' }] },
        defaults,
        sales,
      ),
    ).toThrow('price-approval');
  });
  it('requires approval for phase discounts and payment-method exceptions', () => {
    expect(() =>
      validateCommercialCreate(
        { ...dto, phases: [{ phaseNumber: 1, discountPercent: 5 }] },
        defaults,
        sales,
      ),
    ).toThrow('price-approval');
    expect(() => validateCommercialCreate({ ...dto, cardFeePercent: 0 }, defaults, sales)).toThrow(
      'price-approval',
    );
    expect(() =>
      validateCommercialUpdate({ cashDiscountPercent: 10 }, { cashDiscountPercent: 0 }, sales),
    ).toThrow('price-approval');
  });
  it('requires a reason, not just a grant, for an exception', () => {
    const approver = { ...sales, permissions: { 'quotes.approve_discount': true } };
    const discounted = { ...dto, items: [{ ...item, discount: 100, cost: 1900 }] };
    expect(() => validateCommercialCreate(discounted, defaults, approver)).toThrow('reason');
    expect(() =>
      validateCommercialCreate(
        { ...discounted, overrideReason: 'Approved commercial exception' },
        defaults,
        approver,
      ),
    ).not.toThrow();
    expect(() =>
      validateCommercialUpdate({ cardFeePercent: 0 }, { cardFeePercent: 16 }, approver),
    ).not.toThrow();
  });
  it('does not allow an internal caller to omit the author', () =>
    expect(() => validateCommercialCreate(dto, defaults)).toThrow('authenticated'));
  it('uses the effective catalogue supplied by the common configuration resolver', () => {
    const effective = DocumentConfigurationSchema.parse({
      priceList: [{ type: 'implant', currency: 'USD', unitPrice: 900 }],
    });
    expect(() =>
      validateCommercialCreate(
        { ...dto, items: [{ ...item, unitPrice: 900, cost: 1800 }] },
        defaults,
        sales,
        effective,
      ),
    ).not.toThrow();
  });
  it('recomputes persisted line totals at monetary precision', () =>
    expect(
      canonicalPlanItems({
        ...dto,
        items: [{ ...item, unitPrice: 0.1, quantity: 3, cost: 0.30000000001 }],
      }),
    ).toEqual([expect.objectContaining({ cost: 0.3, quantity: 3 })]));
});
