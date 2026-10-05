import { Prisma } from '@prisma/client';
import { InvoicesService } from './invoices.service';
function fixture() {
  const db = {
    invoice: {
      findUnique: jest
        .fn()
        .mockResolvedValue({
          total: new Prisma.Decimal('0.30'),
          currency: 'EUR',
          status: 'ISSUED',
          payments: [{ amount: new Prisma.Decimal('0.10'), currency: 'EUR', status: 'COMPLETED' }],
        }),
      update: jest.fn().mockResolvedValue({}),
    },
    payment: { create: jest.fn().mockResolvedValue({ id: 'payment' }) },
    $transaction: jest.fn().mockImplementation((v) => Promise.all(v)),
  };
  return { db, service: new InvoicesService(db as never) };
}
it('records the invoice currency and explicit visit, with an exact decimal paid balance', async () => {
  const f = fixture();
  await f.service.recordPayment(
    'invoice',
    { amount: 0.2, method: 'CASH', visitNumber: 2 },
    'employee',
  );
  const data = f.db.payment.create.mock.calls[0][0].data;
  expect(data.currency).toBe('EUR');
  expect(data.amount.toFixed(2)).toBe('0.20');
  expect(data.visitNumber).toBe(2);
  expect(f.db.invoice.update).toHaveBeenCalledWith({
    where: { id: 'invoice' },
    data: { status: 'PAID' },
  });
});
it('refuses to silently add a prior receipt in another currency', async () => {
  const f = fixture();
  f.db.invoice.findUnique.mockResolvedValue({
    total: new Prisma.Decimal('100'),
    currency: 'EUR',
    status: 'ISSUED',
    payments: [{ amount: new Prisma.Decimal('10'), currency: 'USD', status: 'COMPLETED' }],
  });
  await expect(
    f.service.recordPayment('invoice', { amount: 20, method: 'CASH' }, 'employee'),
  ).rejects.toThrow('exchange rate');
  expect(f.db.payment.create).not.toHaveBeenCalled();
});
