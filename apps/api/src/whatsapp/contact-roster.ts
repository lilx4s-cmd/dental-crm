import { PrismaService } from '../prisma/prisma.service';

export type ContactSnapshot = {
  id?: string | null; lid?: string | null; jid?: string | null;
  pnJid?: string | null; lidJid?: string | null;
  name?: string | null; notify?: string | null; verifiedName?: string | null;
  conversationTimestamp?: unknown;
};

const PREFIX = 'crm-contact:';

/** Normalize device addresses before matching saved names to phone and alternate-ID chats. */
export function contactJid(value?: string | null): string | undefined {
  const match = value?.trim().match(/^(\d+)(?::\d+)?@(s\.whatsapp\.net|c\.us|lid)$/);
  return match ? `${match[1]}@${match[2] === 'c.us' ? 's.whatsapp.net' : match[2]}` : undefined;
}

/** Names received before their chat must survive a CRM restart, just like linked credentials. */
export class ContactRoster {
  private readonly names = new Map<string, { name: string; saved: boolean }>();
  private readonly phones = new Map<string, string>();
  private readonly lids = new Map<string, Set<string>>();
  private readonly persisted = new Map<string, string>();

  constructor(private readonly prisma: PrismaService, private readonly sessionId: string) {}

  async restore() {
    const rows = await this.prisma.whatsAppSession.findMany({
      where: { sessionId: this.sessionId, key: { startsWith: PREFIX } }, select: { value: true }, orderBy: { updatedAt: 'asc' },
    });
    for (const { value } of rows) if (value && typeof value === 'object' && !Array.isArray(value)) this.remember(value as ContactSnapshot);
  }

  reset() { this.names.clear(); this.phones.clear(); this.lids.clear(); this.persisted.clear(); }

  remember(contact: ContactSnapshot): ContactSnapshot | undefined {
    const ids = [contact.id, contact.pnJid, contact.jid, contact.lidJid, contact.lid].map(contactJid).filter((id): id is string => !!id);
    if (!ids.length) return;
    const phone = ids.find(id => id.endsWith('@s.whatsapp.net'));
    const lid = ids.find(id => id.endsWith('@lid'));
    if (phone && lid) {
      this.phones.set(lid, phone);
      const aliases = this.lids.get(phone) ?? new Set<string>();
      aliases.add(lid); this.lids.set(phone, aliases);
    }
    const aliases = [...new Set(ids.flatMap(id => this.aliases(id)))];
    const savedName = contact.name?.trim();
    const profileName = contact.notify?.trim() || contact.verifiedName?.trim();
    const existing = aliases.map(id => this.names.get(id)).find(label => label?.saved)
      ?? aliases.map(id => this.names.get(id)).find(Boolean);
    const label = savedName ? { name: savedName, saved: true }
      : existing?.saved ? existing : profileName ? { name: profileName, saved: false } : existing;
    if (label) for (const id of aliases) this.names.set(id, label);
    const primary = phone ?? this.phones.get(ids[0]) ?? ids[0];
    return { id: primary, jid: primary.endsWith('@s.whatsapp.net') ? primary : undefined,
      lid: lid ?? [...(this.lids.get(primary) ?? [])][0],
      ...(label ? label.saved ? { name: label.name } : { notify: label.name } : {}) };
  }

  aliases(raw: string): string[] {
    const id = contactJid(raw);
    if (!id) return [];
    const phone = this.phones.get(id) ?? (id.endsWith('@s.whatsapp.net') ? id : undefined);
    return [...new Set([id, ...(phone ? [phone, ...(this.lids.get(phone) ?? [])] : [])])];
  }

  resolve(raw: string): string | undefined {
    const id = contactJid(raw);
    return id ? this.phones.get(id) ?? id : undefined;
  }

  label(raw: string) { return this.aliases(raw).map(id => this.names.get(id)).find(label => label?.saved) ?? this.aliases(raw).map(id => this.names.get(id)).find(Boolean); }

  async persist(contact: ContactSnapshot) {
    const value = this.remember(contact);
    if (!value?.id) return;
    if (!value.name && !value.notify && !(value.jid && value.lid)) return;
    const encoded = JSON.parse(JSON.stringify(value));
    const signature = JSON.stringify(encoded);
    if (this.persisted.get(value.id) === signature) return;
    const key = PREFIX + value.id;
    await this.prisma.whatsAppSession.upsert({
      where: { sessionId_key: { sessionId: this.sessionId, key } },
      create: { sessionId: this.sessionId, key, value: encoded }, update: { value: encoded },
    });
    this.persisted.set(value.id, signature);
  }
}
