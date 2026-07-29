import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get() {
    return this.prisma.clinicSettings.findUnique({ where: { id: 'singleton' } });
  }

  async update(data: {
    clinicName?: string;
    address?: string;
    city?: string;
    country?: string;
    timezone?: string;
    currency?: string;
    logoUrl?: string;
    phone?: string;
    email?: string;
    whatsapp?: string;
    website?: string;
    defaultPackageIncludes?: string[];
    defaultCardFeePercent?: number;
    defaultCashDiscountPercent?: number;
    defaultDepositPercent?: number;
    defaultPaymentTerms?: string;
    defaultWarrantyTerms?: string;
  }) {
    return this.prisma.clinicSettings.update({
      where: { id: 'singleton' },
      data,
    });
  }
}
