/** A WhatsApp LID/group identifier is never a telephone number. */
export function whatsappContactPhone(threadId?: string | null): string | undefined {
  if (!threadId) return undefined;
  const match = /^(\+?[1-9]\d{6,14})(?:@(s\.whatsapp\.net|c\.us))?$/.exec(threadId);
  return match ? `+${match[1].replace(/^\+/, '')}` : undefined;
}
