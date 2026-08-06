import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';
import { JwtPayload, normaliseTagName, TAG_CATEGORY_ORDER } from '@dental-crm/shared';

import { PrismaService } from '../prisma/prisma.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';

/**
 * The clinic every tag belongs to, until there is more than one.
 *
 * Resolved by slug rather than hardcoded as an id, so a database seeded independently — a staging
 * copy, a fresh developer environment — still works. The row is created by the tags migration.
 *
 * This is the single place the system assumes one organisation. When a second clinic exists, this
 * is what gets replaced by reading `organizationId` off the authenticated user; nothing else in the
 * tags code changes, because everything below takes the id as a parameter.
 */
export const DEFAULT_ORGANIZATION_SLUG = 'kerem-clinic';

const TAG_SELECT = {
  id: true,
  name: true,
  color: true,
  category: true,
  createdAt: true,
} satisfies Prisma.TagSelect;

@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Cached for the process's life: one row, never edited, read on nearly every tag operation. */
  private organizationId: string | null = null;

  async currentOrganizationId(): Promise<string> {
    if (this.organizationId) return this.organizationId;
    const org = await this.prisma.organization.findUnique({
      where: { slug: DEFAULT_ORGANIZATION_SLUG },
      select: { id: true },
    });
    if (!org) {
      // Not a NotFoundException: this is not a missing record somebody asked for, it is the
      // database being in a state the application cannot work in.
      throw new Error(
        `No organization with slug "${DEFAULT_ORGANIZATION_SLUG}". The tags migration seeds it — ` +
          'run `prisma migrate deploy`.',
      );
    }
    this.organizationId = org.id;
    return org.id;
  }

  /**
   * Every tag, in the order the UI groups them.
   *
   * Sorted here rather than in the browser so the tag picker, the filter bar and the deal sheet
   * cannot each choose a different order for the same list.
   */
  async findAll() {
    const organizationId = await this.currentOrganizationId();
    const tags = await this.prisma.tag.findMany({
      where: { organizationId },
      select: { ...TAG_SELECT, _count: { select: { leads: true, patients: true } } },
      orderBy: { name: 'asc' },
    });

    return tags
      .map(({ _count, ...tag }) => ({
        ...tag,
        // What deleting it would cost, shown next to the delete button rather than discovered
        // afterwards.
        usageCount: _count.leads + _count.patients,
      }))
      .sort(
        (a, b) =>
          TAG_CATEGORY_ORDER.indexOf(a.category) - TAG_CATEGORY_ORDER.indexOf(b.category) ||
          a.name.localeCompare(b.name),
      );
  }

  async create(dto: CreateTagDto, currentUser: JwtPayload) {
    const organizationId = await this.currentOrganizationId();
    const name = normaliseTagName(dto.name);
    if (!name) throw new BadRequestException('A tag needs a name.');

    await this.assertNameFree(organizationId, name);

    return this.prisma.tag.create({
      data: {
        organizationId,
        name,
        color: (dto.color as $Enums.TagColor) ?? $Enums.TagColor.SLATE,
        category: (dto.category as $Enums.TagCategory) ?? $Enums.TagCategory.GENERAL,
        createdById: currentUser.sub,
      },
      select: TAG_SELECT,
    });
  }

  /**
   * Rename, recolour or recategorise.
   *
   * A rename changes the label everywhere it is shown, including on deals tagged months ago — that
   * is the point of a shared vocabulary, and why `LeadTagHistory` snapshots the name it used at the
   * time instead of resolving it through this row.
   */
  async update(id: string, dto: UpdateTagDto) {
    const organizationId = await this.currentOrganizationId();
    const existing = await this.prisma.tag.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Tag not found');

    const name = dto.name === undefined ? undefined : normaliseTagName(dto.name);
    if (name !== undefined) {
      if (!name) throw new BadRequestException('A tag needs a name.');
      await this.assertNameFree(organizationId, name, id);
    }

    return this.prisma.tag.update({
      where: { id },
      data: {
        name,
        color: dto.color as $Enums.TagColor | undefined,
        category: dto.category as $Enums.TagCategory | undefined,
      },
      select: TAG_SELECT,
    });
  }

  /**
   * Deletes a tag and takes it off everything it was on.
   *
   * The joins cascade. `LeadTagHistory.tagId` is SetNull, so the record that somebody once applied
   * this tag survives with the name it had at the time — deleting a tag should not rewrite what
   * happened.
   */
  async remove(id: string) {
    const organizationId = await this.currentOrganizationId();
    const tag = await this.prisma.tag.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });
    if (!tag) throw new NotFoundException('Tag not found');
    await this.prisma.tag.delete({ where: { id } });
  }

  /**
   * Uniqueness is enforced case-insensitively while the stored name keeps its casing.
   *
   * The database index on (organizationId, name) is exact, so "VIP" and "vip" would both satisfy
   * it and then sit next to each other in the picker as two tags nobody can tell apart. Checking
   * here means the tag still displays the way whoever created it wrote it.
   */
  private async assertNameFree(organizationId: string, name: string, exceptId?: string) {
    const clash = await this.prisma.tag.findFirst({
      where: {
        organizationId,
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId ? { NOT: { id: exceptId } } : {}),
      },
      select: { name: true },
    });
    if (clash) throw new ConflictException(`There is already a tag called "${clash.name}".`);
  }
}
