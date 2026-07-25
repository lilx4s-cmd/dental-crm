import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const SELECT_SAFE = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  avatarUrl: true,
  role: true,
  isActive: true,
  specialization: true,
  calendarColor: true,
  createdAt: true,
  updatedAt: true,
};

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already in use');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    return this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        role: dto.role,
        specialization: dto.specialization,
      },
      select: SELECT_SAFE,
    });
  }

  async findAll() {
    return this.prisma.user.findMany({ select: SELECT_SAFE, orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: SELECT_SAFE });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findOne(id);
    return this.prisma.user.update({ where: { id }, data: dto, select: SELECT_SAFE });
  }

  async deactivate(id: string, currentUserId?: string) {
    await this.findOne(id);
    // An admin deactivating themselves would be locked out with no way back in — jwt.strategy
    // rejects inactive users on the very next request, including the one that would undo it.
    if (id === currentUserId) {
      throw new BadRequestException('You cannot deactivate your own account');
    }
    const [user] = await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { isActive: false }, select: SELECT_SAFE }),
      // isActive is checked on every request, so access stops immediately either way. Revoking the
      // stored refresh tokens as well means reactivating later does not silently restore whatever
      // sessions were open when the account was switched off.
      this.revokeTokensTx(id),
    ]);
    return user;
  }

  async activate(id: string) {
    await this.findOne(id);
    return this.prisma.user.update({ where: { id }, data: { isActive: true }, select: SELECT_SAFE });
  }

  /** Marks every unrevoked refresh token for a user as revoked. */
  private revokeTokensTx(userId: string) {
    return this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Signs a user out of every device.
   *
   * Access tokens are stateless and live 15 minutes, so this closes the refresh path rather than
   * killing the current request instantly — the session dies at the next refresh. Deactivating the
   * account is the immediate lever, since isActive is checked on every request.
   */
  async revokeSessions(id: string) {
    await this.findOne(id);
    const { count } = await this.revokeTokensTx(id);
    return { revoked: count };
  }

  /**
   * Sets a new password on someone else's account.
   *
   * Always revokes their sessions too: a reset that leaves the old logged-in sessions working
   * does not actually take access away, which is usually the reason it is being done.
   */
  async adminResetPassword(id: string, newPassword: string) {
    await this.findOne(id);
    const passwordHash = await bcrypt.hash(newPassword, 10);
    const [, revoked] = await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { passwordHash } }),
      this.revokeTokensTx(id),
    ]);
    return { success: true, sessionsRevoked: revoked.count };
  }

  /** How many live sessions a user has, so an admin can see whether anyone is actually signed in. */
  async activeSessionCount(id: string) {
    return this.prisma.refreshToken.count({
      where: { userId: id, revokedAt: null, expiresAt: { gt: new Date() } },
    });
  }
}
