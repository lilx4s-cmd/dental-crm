import { hasPermission, canSupervise, Role, type JwtPayload } from '@dental-crm/shared';
import type { Prisma } from '@prisma/client';

/** Shared by inbox reads and WhatsApp-to-deal creation; neither may widen account access. */
export function conversationAccessWhere(user?: JwtPayload): Prisma.ConversationWhereInput {
  if (!user || hasPermission(user, 'conversations.all', user.role === Role.SUPER_ADMIN || user.role === Role.CLINIC_MANAGER)) return {};
  return { AND: [{ OR: [
    { whatsappSessionId: 'default' }, { whatsappSessionId: `user:${user.sub}` },
    ...(canSupervise(user) ? [{ lead: { supervisorId: user.sub } }] : []),
  ] }] };
}
