import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';

const INVOICE_SELECT = {
  id: true,
  invoiceNumber: true,
  status: true,
  subtotal: true,
  discount: true,
  tax: true,
  total: true,
  currency: true,
  dueDate: true,
  issuedAt: true,
  createdAt: true,
  updatedAt: true,
  patient: { select: { id: true, firstName: true, lastName: true, phone: true } },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  items: { select: { id: true, description: true, quantity: true, unitPrice: true, total: true } },
  payments: { select: { id: true, amount: true, method: true, status: true, paidAt: true, reference: true } },
} as const;

@Injectable()
export class InvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The next invoice number.
   *
   * Derived from a row count, which is wrong in two ways that only show up under load: two
   * concurrent creates read the same count and produce the same number, and `invoiceNumber` is
   * unique, so one of them fails with a constraint violation the caller sees as a 500. Deleting an
   * invoice would also make the next one reuse a number already issued to a patient.
   *
   * Kept as a count for now — introducing a Postgres sequence mid-life would need the current
   * maximum seeded into it — but the collision is caught and retried by the caller, so a clash
   * costs a round trip rather than a failed invoice.
   */
  private async generateInvoiceNumber(): Promise<string> {
    const count = await this.prisma.invoice.count();
    return `INV-${String(count + 1).padStart(5, '0')}`;
  }

  async findAll(patientId?: string, status?: string) {
    const where: Prisma.InvoiceWhereInput = {};
    if (patientId) where.patientId = patientId;
    if (status) where.status = status as $Enums.InvoiceStatus;

    return this.prisma.invoice.findMany({
      where,
      select: INVOICE_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id }, select: INVOICE_SELECT });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  async create(dto: CreateInvoiceDto, createdById: string) {
    const subtotal = dto.items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
    const discount = dto.discount ?? 0;
    const tax = dto.tax ?? 0;
    const total = subtotal - discount + tax;

    // Two receptionists raising an invoice at the same moment read the same count and generate the
    // same number; the unique constraint then fails one of them with a 500 and no invoice. Retry
    // on that specific collision — the second attempt reads a count that now includes the first.
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.invoice.create({
          data: {
            invoiceNumber: await this.generateInvoiceNumber(),
            patientId: dto.patientId,
            treatmentPlanId: dto.treatmentPlanId,
            createdById,
            status: $Enums.InvoiceStatus.DRAFT,
            subtotal,
            discount,
            tax,
            total,
            currency: dto.currency ?? 'USD',
            dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
            items: {
              create: dto.items.map((item) => ({
                description: item.description,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                total: item.unitPrice * item.quantity,
              })),
            },
          },
          select: INVOICE_SELECT,
        });
      } catch (e) {
        const isDuplicateNumber =
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002' &&
          String(e.meta?.target ?? '').includes('invoiceNumber');
        // Anything else is a real failure and must surface unchanged. Five attempts is far beyond
        // the contention this clinic will ever see; the bound exists so a persistent fault fails
        // loudly rather than spinning.
        if (!isDuplicateNumber || attempt >= 4) throw e;
      }
    }
  }

  async updateStatus(id: string, status: $Enums.InvoiceStatus) {
    await this.findOne(id);
    const data: Prisma.InvoiceUpdateInput = { status };
    if (status === $Enums.InvoiceStatus.SENT) data.issuedAt = new Date();
    return this.prisma.invoice.update({ where: { id }, data, select: INVOICE_SELECT });
  }

  async recordPayment(invoiceId: string, dto: RecordPaymentDto, createdById: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { total: true, status: true, payments: { select: { amount: true, status: true } } },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status === $Enums.InvoiceStatus.PAID) throw new BadRequestException('Invoice is already fully paid');

    const paidSoFar = invoice.payments
      .filter((p) => p.status === $Enums.PaymentStatus.COMPLETED)
      .reduce((sum, p) => sum + Number(p.amount), 0);

    const newTotal = paidSoFar + dto.amount;
    const invoiceTotal = Number(invoice.total);
    const newStatus = newTotal >= invoiceTotal ? $Enums.InvoiceStatus.PAID : $Enums.InvoiceStatus.PARTIALLY_PAID;

    // One transaction. These were two unsynchronised statements: a failure between them left the
    // money recorded against an invoice still marked unpaid, which is the worst of both — the
    // patient has paid, the ledger says they have, and the invoice says they have not.
    const [payment] = await this.prisma.$transaction([
      this.prisma.payment.create({
        data: {
          invoiceId,
          createdById,
          amount: dto.amount,
          method: dto.method as $Enums.PaymentMethod,
          status: $Enums.PaymentStatus.COMPLETED,
          paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
          reference: dto.reference,
        },
      }),
      this.prisma.invoice.update({ where: { id: invoiceId }, data: { status: newStatus } }),
    ]);

    return payment;
  }

  async getFinanceSummary() {
    const [totalRevenue, pendingAmount, invoiceCount] = await Promise.all([
      this.prisma.payment.aggregate({
        where: { status: $Enums.PaymentStatus.COMPLETED },
        _sum: { amount: true },
      }),
      this.prisma.invoice.aggregate({
        where: { status: { in: [$Enums.InvoiceStatus.SENT, $Enums.InvoiceStatus.PARTIALLY_PAID, $Enums.InvoiceStatus.OVERDUE] } },
        _sum: { total: true },
      }),
      this.prisma.invoice.count({ where: { status: { not: $Enums.InvoiceStatus.CANCELLED } } }),
    ]);

    return {
      totalRevenue: Number(totalRevenue._sum.amount ?? 0),
      pendingAmount: Number(pendingAmount._sum.total ?? 0),
      invoiceCount,
    };
  }
}
