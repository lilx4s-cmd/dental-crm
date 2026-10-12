import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import {
  DocumentConfigurationSchema,
  Role,
  hasPermission,
  type JwtPayload,
} from '@dental-crm/shared';
import { CreateTreatmentPlanDto } from './dto/create-treatment-plan.dto';
import { UpdateTreatmentPlanDto } from './dto/update-treatment-plan.dto';

interface Terms {
  defaultCardFeePercent?: unknown;
  defaultCashDiscountPercent?: unknown;
  documentConfiguration?: unknown;
}
const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const procedure = (item: NonNullable<CreateTreatmentPlanDto['items']>[number]) =>
  item.procedureType ??
  (
    {
      IMPLANT: 'implant',
      CROWN: 'crown',
      VENEER: 'veneer',
      ROOT_CANAL: 'rootCanal',
      BONE_GRAFT: 'graft',
      SINUS_LIFT: 'sinus',
      EXTRACTION: 'extraction',
    } as Record<string, string>
  )[item.toothCondition ?? ''];
function assertPricePermission(user: JwtPayload | undefined): void {
  if (
    !user ||
    !hasPermission(
      user,
      'quotes.approve_discount',
      user.role === Role.SUPER_ADMIN || user.role === Role.CLINIC_MANAGER,
    )
  )
    throw new ForbiddenException('Price exceptions require price-approval permission');
}
export function assertPriceApproval(user: JwtPayload | undefined, reason?: string): void {
  assertPricePermission(user);
  if (!reason?.trim() || reason.trim().length < 3)
    throw new BadRequestException('Record the reason for the price exception');
}

export function validateCommercialCreate(
  dto: CreateTreatmentPlanDto,
  defaults: Terms | null,
  user?: JwtPayload,
  approved?: ReturnType<typeof DocumentConfigurationSchema.parse>,
): void {
  if (!user) throw new UnauthorizedException('An authenticated price author is required');
  const parsed = DocumentConfigurationSchema.safeParse(defaults?.documentConfiguration ?? {});
  if (!parsed.success) throw new BadRequestException('Clinic price configuration needs review');
  const catalog = (approved ?? parsed.data).priceList;
  for (const item of dto.items ?? []) {
    if (
      item.unitPrice !== undefined &&
      money(item.unitPrice * item.quantity - (item.discount ?? 0)) !== money(item.cost)
    )
      throw new BadRequestException('Line cost must equal quantity × unit price − discount');
    const type = procedure(item);
    const unit = item.unitPrice ?? (item.cost + (item.discount ?? 0)) / item.quantity;
    const candidates = catalog.filter(
      (p) => p.type === type && p.currency === (dto.currency ?? 'USD'),
    );
    const configured = candidates.find(
      (p) =>
        (!p.material || p.material.toLowerCase() === (item.material ?? '').toLowerCase()) &&
        (!p.brand || p.brand.toLowerCase() === (item.brand ?? '').toLowerCase()),
    );
    const exception =
      (item.discount ?? 0) > 0 ||
      (catalog.length > 0 && (!configured || money(unit) !== money(configured.unitPrice)));
    if (exception) assertPriceApproval(user, item.overrideReason ?? dto.overrideReason);
  }
  if ((dto.phases ?? []).some((p) => (p.discountAmount ?? 0) > 0 || (p.discountPercent ?? 0) > 0))
    assertPriceApproval(user, dto.overrideReason);
  for (const [field, defaultField] of [
    ['cardFeePercent', 'defaultCardFeePercent'],
    ['cashDiscountPercent', 'defaultCashDiscountPercent'],
  ] as const) {
    if (dto[field] !== undefined && Number(dto[field]) !== Number(defaults?.[defaultField] ?? 0))
      assertPricePermission(user);
  }
}

export function canonicalPlanItems(dto: CreateTreatmentPlanDto) {
  return dto.items?.map((item) => ({
    ...item,
    cost: money(
      item.unitPrice === undefined
        ? item.cost
        : item.unitPrice * item.quantity - (item.discount ?? 0),
    ),
  }));
}

export function validateCommercialUpdate(
  dto: UpdateTreatmentPlanDto,
  previous: { cardFeePercent?: unknown; cashDiscountPercent?: unknown },
  user?: JwtPayload,
): void {
  for (const field of ['cardFeePercent', 'cashDiscountPercent'] as const)
    if (dto[field] !== undefined && Number(dto[field] ?? 0) !== Number(previous[field] ?? 0))
      assertPricePermission(user);
}
