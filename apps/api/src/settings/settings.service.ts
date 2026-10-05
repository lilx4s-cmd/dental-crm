import { DocumentConfigurationSchema } from '@dental-crm/shared';
import { Prisma } from '@prisma/client';
import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get() {
    return this.prisma.clinicSettings.findUnique({ where: { id: 'singleton' } });
  }

  async update(data: {
    documentConfiguration?: Record<string, unknown>;
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
    if (data.documentConfiguration) {
      const check = DocumentConfigurationSchema.safeParse(data.documentConfiguration);
      if (!check.success) throw new BadRequestException(check.error.issues.map((i) => i.message));
      data.documentConfiguration = check.data;
    }
    return this.prisma.clinicSettings.update({
      where: { id: 'singleton' },
      data: {
        ...data,
        documentConfiguration: data.documentConfiguration as Prisma.InputJsonValue | undefined,
      },
    });
  }
}
