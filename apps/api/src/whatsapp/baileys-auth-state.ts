import { proto } from '@whiskeysockets/baileys';
import type { AuthenticationCreds, AuthenticationState, SignalDataTypeMap } from '@whiskeysockets/baileys';
import { BufferJSON, initAuthCreds } from '@whiskeysockets/baileys';

import { PrismaService } from '../prisma/prisma.service';

/**
 * Baileys auth state backed by Postgres.
 *
 * Baileys ships `useMultiFileAuthState`, which writes to the local filesystem. That is fine on a
 * laptop and useless on Render, where the disk is thrown away on every deploy — the session would
 * die each time and somebody would have to physically re-scan a QR code. Since that failure is
 * silent until a patient complains that nobody replied, the state lives in the database instead.
 *
 * Values pass through Baileys' own BufferJSON reviver/replacer: the state contains raw Buffers
 * (keys, signatures) which JSON would otherwise flatten into unusable objects.
 */
export async function usePrismaAuthState(
  prisma: PrismaService,
  sessionId = 'default',
): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void>; clear: () => Promise<void> }> {
  const read = async <T>(key: string): Promise<T | null> => {
    const row = await prisma.whatsAppSession.findUnique({
      where: { sessionId_key: { sessionId, key } },
      select: { value: true },
    });
    if (!row) return null;
    return JSON.parse(JSON.stringify(row.value), BufferJSON.reviver) as T;
  };

  const write = async (key: string, value: unknown) => {
    const encoded = JSON.parse(JSON.stringify(value, BufferJSON.replacer));
    await prisma.whatsAppSession.upsert({
      where: { sessionId_key: { sessionId, key } },
      create: { sessionId, key, value: encoded },
      update: { value: encoded },
    });
  };

  const remove = async (key: string) => {
    await prisma.whatsAppSession.deleteMany({ where: { sessionId, key } });
  };

  const creds: AuthenticationCreds = (await read<AuthenticationCreds>('creds')) ?? initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const result: { [id: string]: SignalDataTypeMap[typeof type] } = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await read<SignalDataTypeMap[typeof type]>(`${type}-${id}`);
              // App-state sync keys are the one type Baileys expects back as a decoded protobuf
              // rather than a plain object.
              if (type === 'app-state-sync-key' && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(
                  value as never,
                ) as unknown as SignalDataTypeMap[typeof type];
              }
              if (value) result[id] = value;
            }),
          );
          return result;
        },
        set: async (data) => {
          // Baileys batches writes and signals a deletion with a null value; both shapes arrive
          // through this one call.
          const jobs: Promise<unknown>[] = [];
          for (const type in data) {
            for (const id in data[type as keyof typeof data]) {
              const value = data[type as keyof typeof data]![id];
              const key = `${type}-${id}`;
              jobs.push(value ? write(key, value) : remove(key));
            }
          }
          await Promise.all(jobs);
        },
      },
    },
    saveCreds: () => write('creds', creds),
    // Used on logout, and whenever WhatsApp tells us the session is dead — leaving stale
    // credentials behind would make the next connect fail in a way that looks like a bug.
    clear: async () => {
      await prisma.whatsAppSession.deleteMany({ where: { sessionId } });
    },
  };
}
