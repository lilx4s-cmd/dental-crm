import { Prisma } from '@prisma/client';
const D = Prisma.Decimal;
type CaseTotals = {
  currency: string;
  revenue: string | null;
  estimatedCost: string | null;
  actualCost: string | null;
  commission: string | null;
  missing: string[];
};
type Expense = {
  currency: string;
  kind: string;
  status: string;
  _sum: { amount: Prisma.Decimal | null };
};
type Commission = { currency: string; _sum: { amount: Prisma.Decimal | null } };
/** Accrual report: recognition month is explicit; cash receipts are reported separately. */
export function monthlyFinance(
  cases: CaseTotals[],
  expenses: Expense[],
  commissions: Commission[],
  truncated: boolean,
) {
  const currencies = new Set([
    ...cases.map((c) => c.currency),
    ...expenses.map((e) => e.currency),
    ...commissions.map((c) => c.currency),
  ]);
  return [...currencies].map((currency) => {
    const rows = cases.filter((c) => c.currency === currency);
    const missing = rows.flatMap((c) => c.missing.filter((m) => !m.startsWith('Actual cost')));
    if (rows.some((c) => c.actualCost === null)) missing.push('Actual case costs incomplete');
    if (rows.some((c) => c.revenue === null)) missing.push('Recognized case revenue incomplete');
    if (rows.some((c) => c.commission === null)) missing.push('Case commission not defined');
    if (truncated) missing.push('Report limit reached');
    const sum = (key: 'revenue' | 'estimatedCost' | 'actualCost') =>
      rows.some((c) => c[key] === null) ? null : rows.reduce((s, c) => s.add(c[key]!), new D(0));
    const revenue = sum('revenue'),
      estimated = sum('estimatedCost'),
      actual = sum('actualCost');
    const earnedCommission = commissions
      .filter((c) => c.currency === currency)
      .reduce((s, c) => s.add(c._sum.amount ?? 0), new D(0));
    const expenseTotal = expenses
      .filter((e) => e.currency === currency)
      .reduce((s, e) => s.add(e._sum.amount ?? 0), new D(0));
    const salaries = expenses
      .filter((e) => e.currency === currency && e.kind === 'SALARY')
      .reduce((s, e) => s.add(e._sum.amount ?? 0), new D(0));
    const unpaid = expenses
      .filter((e) => e.currency === currency && e.status === 'UNPAID')
      .reduce((s, e) => s.add(e._sum.amount ?? 0), new D(0));
    return {
      currency,
      recognizedQuotedRevenue: revenue?.toFixed(2) ?? null,
      estimatedCaseCosts: estimated?.toFixed(2) ?? null,
      actualCaseCosts: actual?.toFixed(2) ?? null,
      earnedCommission: earnedCommission.toFixed(2),
      salaries: salaries.toFixed(2),
      businessExpensesIncludingSalary: expenseTotal.toFixed(2),
      unpaidBusinessExpenses: unpaid.toFixed(2),
      monthlyOperatingProfit:
        !missing.length && revenue && actual
          ? revenue.minus(actual).minus(earnedCommission).minus(expenseTotal).toFixed(2)
          : null,
      missing: [...new Set(missing)],
      definition:
        'Accrual: confirmed case revenue recognized in this month minus actual case costs, earned commission and monthly business expenses. Collected cash is a separate measure. Enter only business expenses not already included in case cost lines.',
    };
  });
}
