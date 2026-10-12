import { BadRequestException } from '@nestjs/common';
import { DocumentConfigurationSchema } from '@dental-crm/shared';
import { PrismaService } from '../prisma/prisma.service';

/** Same effective catalogue for both old plans and visual proposals. */
export async function approvedPriceConfiguration(prisma: PrismaService, raw: unknown) {
  const parsed = DocumentConfigurationSchema.safeParse(raw ?? {});
  if (!parsed.success) throw new BadRequestException('Clinic price configuration needs review');
  const config = parsed.data;
  const catalog = await prisma.costCatalogVersion.findMany({
    where: { effectiveAt: { lte: new Date() } },
    orderBy: [{ key: 'asc' }, { version: 'desc' }],
    take: 1000,
  });
  const latest = new Map<string, (typeof catalog)[number]>();
  for (const entry of catalog) if (!latest.has(entry.key)) latest.set(entry.key, entry);
  const types: Record<string, (typeof config.priceList)[number]['type']> = {
    IMPLANT: 'implant',
    CROWN: 'crown',
    VENEER: 'veneer',
    EXTRACTION: 'extraction',
    GRAFT: 'graft',
    SINUS: 'sinus',
    TEMPORARY: 'temporary',
  };
  for (const entry of latest.values()) {
    const c = entry.details as {
      category: string;
      currency: string;
      sellingPrice: string | null;
      material?: string;
      brand?: string;
    };
    if (!entry.active || !types[c.category] || c.sellingPrice === null) continue;
    const unitPrice = Number(c.sellingPrice);
    if (!Number.isFinite(unitPrice) || unitPrice < 0)
      throw new BadRequestException('Approved catalogue price is invalid');
    const price = {
      type: types[c.category],
      currency: c.currency,
      unitPrice,
      material: c.material ?? '',
      brand: c.brand ?? '',
    };
    config.priceList = config.priceList.filter(
      (p) =>
        !(
          p.type === price.type &&
          p.currency === price.currency &&
          p.material === price.material &&
          p.brand === price.brand
        ),
    );
    config.priceList.push(price);
  }
  return config;
}
