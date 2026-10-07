import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PERMISSION_KEYS } from '@dental-crm/shared';
import { JwtPayload } from '@dental-crm/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}
  list() {
    return this.prisma.accessProfile.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { users: true } } },
    });
  }
  validate(permissions: Record<string, boolean>) {
    for (const [key, value] of Object.entries(permissions)) {
      if (!PERMISSION_KEYS.includes(key) || typeof value !== 'boolean')
        throw new BadRequestException('Unknown permission or non-boolean access setting.');
    }
    for (const key of PERMISSION_KEYS) {
      if (
        permissions[key] &&
        key.endsWith('.write') &&
        permissions[key.replace('.write', '.read')] !== true
      )
        throw new BadRequestException('Editing requires view access.');
    }
    for (const key of ['leads.all', 'leads.assign', 'leads.review']) {
      if (permissions[key] && !permissions['leads.read'])
        throw new BadRequestException('Lead supervision requires lead view access.');
    }
    if (permissions['leads.assign'] && !permissions['leads.all'])
      throw new BadRequestException('Lead reassignment requires access to all leads.');
    for (const key of ['conversations.all', 'conversations.supervise', 'conversations.send']) {
      if (permissions[key] && !permissions['conversations.read'])
        throw new BadRequestException('Conversation actions require view access.');
    }
    if (permissions['calls.place'] && (!permissions['calls.read'] || !permissions['leads.read']))
      throw new BadRequestException('Patient calling requires calling and lead view access.');
    if (permissions['conversations.supervise'] && !permissions['conversations.all'])
      throw new BadRequestException('Team supervision requires all-conversation access.');
  }
  async save(
    dto: { name: string; permissions: Record<string, boolean> },
    actor: JwtPayload,
    id?: string,
  ) {
    this.validate(dto.permissions);
    const name = dto.name.trim();
    if (name.length < 2) throw new BadRequestException('Enter a profile name.');
    if (id && !(await this.prisma.accessProfile.findUnique({ where: { id } })))
      throw new NotFoundException('Profile not found');
    return this.prisma
      .$transaction(async (tx) => {
        const profile = id
          ? await tx.accessProfile.update({
              where: { id },
              data: { name, permissions: dto.permissions },
            })
          : await tx.accessProfile.create({ data: { name, permissions: dto.permissions } });
        await tx.auditLog.create({
          data: {
            userId: actor.sub,
            action: id ? 'UPDATE' : 'CREATE',
            entityType: 'AccessProfile',
            entityId: profile.id,
            newValues: { name, permissions: dto.permissions },
          },
        });
        return profile;
      })
      .catch((error) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
          throw new ConflictException(
            'A profile with that name already exists. Edit it or choose a different name.',
          );
        throw error;
      });
  }
  async assign(id: string, profileId: string | null, actor: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { role: true, accessProfileId: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.role === 'SUPER_ADMIN')
      throw new BadRequestException(
        'Owner accounts retain full access and cannot receive a custom profile.',
      );
    if (profileId && !(await this.prisma.accessProfile.findUnique({ where: { id: profileId } })))
      throw new NotFoundException('Profile not found');
    return this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { accessProfileId: profileId } });
      await tx.auditLog.create({
        data: {
          userId: actor.sub,
          action: 'UPDATE',
          entityType: 'UserAccess',
          entityId: id,
          oldValues: { profileId: user.accessProfileId },
          newValues: { profileId },
        },
      });
      return { id, accessProfileId: profileId };
    });
  }
}
