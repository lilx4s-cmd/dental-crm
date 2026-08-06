import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { JwtPayload } from '@dental-crm/shared';

import { PrismaService } from '../prisma/prisma.service';
import { TagsService } from '../tags/tags.service';
import { CreateMessageTemplateDto, UpdateMessageTemplateDto } from './dto/message-template.dto';

const TEMPLATE_SELECT = {
  id: true,
  title: true,
  body: true,
  category: true,
  isActive: true,
  useCount: true,
  createdAt: true,
} satisfies Prisma.MessageTemplateSelect;

/**
 * The placeholders a template may carry.
 *
 * Deliberately tiny. A template language grows into a template *engine* — conditionals, loops,
 * formatting — and every one of those is a way to send a patient a message that says
 * `{{#if plan}}` because a field was empty. These four are the ones a canned reply genuinely needs
 * and all four are always resolvable to something sensible.
 */
export const TEMPLATE_PLACEHOLDERS = ['name', 'firstName', 'clinic', 'staffName'] as const;

@Injectable()
export class MessageTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    // Reused rather than duplicated: one place resolves which clinic a row belongs to.
    private readonly tags: TagsService,
  ) {}

  /**
   * The picker's list, most-used first.
   *
   * `useCount` before title, because a clinic that curates twenty templates uses six of them —
   * and alphabetical ordering buries those six among fourteen that are read once a quarter.
   */
  async findAll(includeInactive = false) {
    const organizationId = await this.tags.currentOrganizationId();
    return this.prisma.messageTemplate.findMany({
      where: { organizationId, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: [{ useCount: 'desc' }, { title: 'asc' }],
      select: TEMPLATE_SELECT,
    });
  }

  async create(dto: CreateMessageTemplateDto, currentUser: JwtPayload) {
    const organizationId = await this.tags.currentOrganizationId();
    const title = dto.title.trim();
    const body = dto.body.trim();
    if (!title || !body) throw new BadRequestException('A template needs a title and a body.');

    await this.assertTitleFree(organizationId, title);

    return this.prisma.messageTemplate.create({
      data: {
        organizationId,
        title,
        body,
        category: dto.category?.trim() || null,
        createdById: currentUser.sub,
      },
      select: TEMPLATE_SELECT,
    });
  }

  async update(id: string, dto: UpdateMessageTemplateDto) {
    const organizationId = await this.tags.currentOrganizationId();
    const existing = await this.prisma.messageTemplate.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Template not found');

    const title = dto.title === undefined ? undefined : dto.title.trim();
    if (title !== undefined) {
      if (!title) throw new BadRequestException('A template needs a title.');
      await this.assertTitleFree(organizationId, title, id);
    }

    const body = dto.body === undefined ? undefined : dto.body.trim();
    if (body !== undefined && !body) throw new BadRequestException('A template needs a body.');

    return this.prisma.messageTemplate.update({
      where: { id },
      data: {
        title,
        body,
        category: dto.category === undefined ? undefined : dto.category.trim() || null,
        isActive: dto.isActive,
      },
      select: TEMPLATE_SELECT,
    });
  }

  /**
   * Deactivates rather than deletes.
   *
   * A template dropped from the picker should not take its usage count with it, and reversing the
   * decision should not mean re-typing four thousand characters somebody wrote carefully. There is
   * no hard delete on purpose — a clinic that truly wants one gone has nothing to gain from the
   * row disappearing, and something to lose if they change their mind.
   */
  async deactivate(id: string) {
    const organizationId = await this.tags.currentOrganizationId();
    const existing = await this.prisma.messageTemplate.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Template not found');

    return this.prisma.messageTemplate.update({
      where: { id },
      data: { isActive: false },
      select: TEMPLATE_SELECT,
    });
  }

  /**
   * Fills a template in for one recipient.
   *
   * Resolved on the server rather than in the browser so the substitution rules exist once, and so
   * the clinic name comes from settings rather than from whatever the client happened to have
   * cached.
   *
   * A placeholder with nothing to fill it becomes an empty string, not the literal `{{name}}`.
   * Sending a patient a message containing their own name is good; sending one containing
   * `{{name}}` is worse than sending one that simply opens with "Hello,".
   */
  async render(id: string, recipient: { firstName?: string | null; lastName?: string | null }, currentUser: JwtPayload) {
    const organizationId = await this.tags.currentOrganizationId();
    const template = await this.prisma.messageTemplate.findFirst({
      where: { id, organizationId },
      select: { id: true, body: true },
    });
    if (!template) throw new NotFoundException('Template not found');

    const [settings, staff] = await Promise.all([
      this.prisma.clinicSettings.findFirst({ select: { clinicName: true } }),
      this.prisma.user.findUnique({ where: { id: currentUser.sub }, select: { firstName: true } }),
    ]);

    const firstName = recipient.firstName?.trim() ?? '';
    const values: Record<string, string> = {
      name: `${firstName} ${recipient.lastName?.trim() ?? ''}`.trim(),
      firstName,
      clinic: settings?.clinicName ?? '',
      staffName: staff?.firstName ?? '',
    };

    // Whitespace inside the braces is tolerated because people type `{{ name }}`; an unknown key is
    // left alone rather than blanked, so a typo is visible in the composer before it is sent.
    const body = template.body.replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, key: string) =>
      key in values ? values[key] : whole,
    );

    // Counted on render, which is when a template is inserted into a reply — not on send, because
    // the composer is where the choice is made and a draft abandoned afterwards still tells us
    // this was the one reached for.
    await this.prisma.messageTemplate.update({
      where: { id },
      data: { useCount: { increment: 1 } },
    });

    return { body };
  }

  /** Case-insensitive, so two people cannot create "Price list" and "price list" side by side. */
  private async assertTitleFree(organizationId: string, title: string, exceptId?: string) {
    const clash = await this.prisma.messageTemplate.findFirst({
      where: {
        organizationId,
        title: { equals: title, mode: 'insensitive' },
        ...(exceptId ? { NOT: { id: exceptId } } : {}),
      },
      select: { title: true },
    });
    if (clash) throw new ConflictException(`There is already a template called "${clash.title}".`);
  }
}
