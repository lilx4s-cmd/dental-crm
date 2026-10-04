import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JwtPayload, canSeeAllLeads, canSupervise } from '@dental-crm/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
const PERSON = { id: true, firstName: true, lastName: true };
const LEAD = {
  id: true,
  firstName: true,
  lastName: true,
  stage: true,
  assignedToId: true,
  supervisorId: true,
  assignedTo: { select: PERSON },
  supervisor: { select: PERSON },
};
@Injectable()
export class SupervisionService {
  constructor(private readonly prisma: PrismaService) {}
  private scope(user: JwtPayload): Prisma.LeadWhereInput {
    if (canSeeAllLeads(user)) return {};
    return {
      OR: [{ assignedToId: user.sub }, ...(canSupervise(user) ? [{ supervisorId: user.sub }] : [])],
    };
  }
  private async lead(id: string, user: JwtPayload, supervise = false) {
    const lead = await this.prisma.lead.findFirst({
      where: { id, ...this.scope(user) },
      select: LEAD,
    });
    if (!lead) throw new NotFoundException('Lead not found');
    if (
      supervise &&
      (!canSupervise(user) || (!canSeeAllLeads(user) && lead.supervisorId !== user.sub))
    )
      throw new ForbiddenException('You are not the supervisor for this lead.');
    return lead;
  }
  async queue(user: JwtPayload, search?: string) {
    const scope = this.scope(user);
    const [reviews, leads, supervisors] = await Promise.all([
      this.prisma.leadReview.findMany({
        where: { lead: scope, status: { in: ['OPEN', 'READY'] } },
        include: { lead: { select: LEAD }, reviewer: { select: PERSON } },
        orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
        take: 100,
      }),
      this.prisma.lead.findMany({
        where: {
          AND: [
            scope,
            { status: 'ACTIVE', mergedIntoId: null },
            ...(search?.trim()
              ? [
                  {
                    OR: [
                      { firstName: { contains: search.trim(), mode: 'insensitive' as const } },
                      { lastName: { contains: search.trim(), mode: 'insensitive' as const } },
                      { phone: { contains: search.trim() } },
                    ],
                  },
                ]
              : []),
          ],
        },
        select: {
          ...LEAD,
          createdAt: true,
          tasks: {
            where: { completedAt: null, dueDate: { lt: new Date() } },
            select: { id: true, title: true, dueDate: true },
          },
          conversations: {
            select: {
              messages: {
                where: { direction: 'OUTBOUND', status: { in: ['SENT', 'DELIVERED', 'READ'] } },
                select: { createdAt: true },
                orderBy: { createdAt: 'desc' },
                take: 1,
              },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
        take: 100,
      }),
      canSupervise(user)
        ? this.prisma.user
            .findMany({
              where: { isActive: true },
              select: { ...PERSON, role: true, accessProfile: { select: { permissions: true } } },
            })
            .then((users) =>
              users
                .filter((u) =>
                  canSupervise({
                    role: u.role,
                    permissions: u.accessProfile?.permissions as
                      Record<string, boolean> | undefined,
                  }),
                )
                .map(({ id, firstName, lastName }) => ({ id, firstName, lastName })),
            )
        : Promise.resolve([]),
    ]);
    return {
      reviews,
      leads: leads.map(({ conversations, ...lead }) => ({
        ...lead,
        lastContactAt:
          conversations
            .flatMap((c) => c.messages)
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]?.createdAt ?? null,
      })),
      supervisors,
    };
  }
  async assign(id: string, supervisorId: string | null, user: JwtPayload) {
    await this.lead(id, user, true);
    const supervisor = supervisorId
      ? await this.prisma.user.findUnique({
          where: { id: supervisorId },
          include: { accessProfile: true },
        })
      : null;
    if (
      supervisorId &&
      (!supervisor?.isActive ||
        !canSupervise({
          role: supervisor.role,
          permissions: supervisor.accessProfile?.permissions as Record<string, boolean> | undefined,
        }))
    )
      throw new BadRequestException('Choose an active user with lead supervision access.');
    return this.prisma.$transaction(async (tx) => {
      const lead = await tx.lead.update({ where: { id }, data: { supervisorId }, select: LEAD });
      await tx.leadActivity.create({
        data: {
          leadId: id,
          userId: user.sub,
          note: supervisor
            ? `Lead supervisor assigned: ${supervisor.firstName} ${supervisor.lastName}`
            : 'Lead supervisor removed',
        },
      });
      return lead;
    });
  }
  async flag(dto: { leadId: string; note: string; dueAt?: string }, user: JwtPayload) {
    const lead = await this.lead(dto.leadId, user, true);
    if (!lead.assignedToId)
      throw new BadRequestException('Assign a salesperson before requesting a correction.');
    const note = dto.note.trim();
    if (note.length < 3) throw new BadRequestException('Describe what needs correcting.');
    const dueAt = dto.dueAt ? new Date(dto.dueAt) : new Date(Date.now() + 24 * 60 * 60 * 1000);
    if (!Number.isFinite(dueAt.getTime()) || dueAt <= new Date())
      throw new BadRequestException('Choose a future correction deadline.');
    return this.prisma.$transaction(async (tx) => {
      const review = await tx.leadReview.create({
        data: { leadId: lead.id, reviewerId: user.sub, note, dueAt },
      });
      const task = await tx.leadTask.create({
        data: {
          leadId: lead.id,
          title: `Supervisor correction: ${note.slice(0, 180)}`,
          dueDate: dueAt,
          assignedToId: lead.assignedToId,
          createdById: user.sub,
        },
      });
      await tx.leadActivity.create({
        data: { leadId: lead.id, userId: user.sub, note: `Supervisor flagged: ${note}` },
      });
      return tx.leadReview.update({ where: { id: review.id }, data: { taskId: task.id } });
    });
  }
  async submit(id: string, note: string, user: JwtPayload) {
    const review = await this.prisma.leadReview.findUnique({
      where: { id },
      include: { lead: { select: LEAD } },
    });
    if (!review || review.lead.assignedToId !== user.sub)
      throw new NotFoundException('Review not found');
    if (review.status !== 'OPEN')
      throw new BadRequestException('This review is not awaiting a correction.');
    if (note.trim().length < 3) throw new BadRequestException('Explain what you corrected.');
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.leadReview.updateMany({
        where: { id, status: 'OPEN', lead: { assignedToId: user.sub } },
        data: { status: 'READY', correction: note.trim(), submittedById: user.sub },
      });
      if (!result.count) throw new BadRequestException('Review changed. Refresh and try again.');
      await tx.leadActivity.create({
        data: {
          leadId: review.leadId,
          userId: user.sub,
          note: `Correction submitted: ${note.trim()}`,
        },
      });
      return { id, status: 'READY' };
    });
  }
  async decide(id: string, dto: { status: 'OPEN' | 'RESOLVED'; note: string }, user: JwtPayload) {
    const review = await this.prisma.leadReview.findUnique({ where: { id } });
    if (!review) throw new NotFoundException('Review not found');
    await this.lead(review.leadId, user, true);
    if (review.status !== 'READY')
      throw new BadRequestException('Wait for the salesperson to submit a correction.');
    if (dto.note.trim().length < 3) throw new BadRequestException('Explain your review decision.');
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.leadReview.updateMany({
        where: { id, status: 'READY' },
        data: { status: dto.status, resolvedAt: dto.status === 'RESOLVED' ? new Date() : null },
      });
      if (!result.count) throw new BadRequestException('Review changed. Refresh and try again.');
      if (review.taskId)
        await tx.leadTask.updateMany({
          where: { id: review.taskId },
          data: { completedAt: dto.status === 'RESOLVED' ? new Date() : null },
        });
      await tx.leadActivity.create({
        data: {
          leadId: review.leadId,
          userId: user.sub,
          note: `Supervisor ${dto.status === 'RESOLVED' ? 'accepted' : 'returned'} correction: ${dto.note.trim()}`,
        },
      });
      return { id, status: dto.status };
    });
  }
}
