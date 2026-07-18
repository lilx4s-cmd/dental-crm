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

    return this.prisma.invoice.create({
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

    const payment = await this.prisma.payment.create({
      data: {
        invoiceId,
        createdById,
        amount: dto.amount,
        method: dto.method as $Enums.PaymentMethod,
        status: $Enums.PaymentStatus.COMPLETED,
        paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
        reference: dto.reference,
      },
    });

    const newTotal = paidSoFar + dto.amount;
    const invoiceTotal = Number(invoice.total);
    const newStatus = newTotal >= invoiceTotal ? $Enums.InvoiceStatus.PAID : $Enums.InvoiceStatus.PARTIALLY_PAID;

    await this.prisma.invoice.update({ where: { id: invoiceId }, data: { status: newStatus } });

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
