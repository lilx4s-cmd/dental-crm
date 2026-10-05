import { Prisma } from '@prisma/client';
import { monthlyFinance } from './monthly-finance';
const D = Prisma.Decimal;
const caseRow = {
  currency: 'EUR',
  revenue: '2000.00',
  estimatedCost: '700.00',
  actualCost: '800.00',
  commission: '100.00',
  missing: [],
};
it('subtracts monthly salary once and uses earned commission without double subtraction', () => {
  const rows = monthlyFinance(
    [caseRow, caseRow],
    [{ currency: 'EUR', kind: 'SALARY', status: 'UNPAID', _sum: { amount: new D('1000') } }],
    [{ currency: 'EUR', _sum: { amount: new D('200') } }],
    false,
  );
  expect(rows[0].monthlyOperatingProfit).toBe('1200.00');
  expect(rows[0].unpaidBusinessExpenses).toBe('1000.00');
});
it('keeps currencies separate and does not imply cash equals quoted revenue', () => {
  const rows = monthlyFinance([caseRow, { ...caseRow, currency: 'USD' }], [], [], false);
  expect(rows.map((r) => r.currency)).toEqual(['EUR', 'USD']);
  expect(rows[0].recognizedQuotedRevenue).toBe('2000.00');
});
it.each([
  { ...caseRow, actualCost: null },
  { ...caseRow, commission: null },
  { ...caseRow, revenue: null },
])('withholds operating profit when the financial picture is incomplete', (row) => {
  expect(monthlyFinance([row], [], [], false)[0].monthlyOperatingProfit).toBeNull();
});
it('never reports partial report totals as complete operating profit', () => {
  expect(monthlyFinance([caseRow], [], [], true)[0].monthlyOperatingProfit).toBeNull();
});
