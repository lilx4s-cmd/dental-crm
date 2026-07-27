/**
 * What the conversation layer needs from a messaging transport, and nothing more.
 *
 * Deliberately a token and an interface rather than an import of WhatsAppSenderService. Importing
 * the class would close a module cycle at file level — WhatsApp writes inbound messages through
 * ConversationsService, which would then import its way back to WhatsApp — and a TypeScript import
 * cycle leaves one of the two classes `undefined` when Nest reads its constructor metadata. The
 * failure surfaces as "can't resolve dependency at index [1]" in a service that looks unrelated.
 *
 * It is also the honest dependency: replying to a conversation needs a way to deliver text. That
 * it is WhatsApp today, and might be SMS or Messenger tomorrow, is not the conversation layer's
 * concern.
 *
 * This file must import nothing.
 */
export const OUTBOUND_SENDER = 'OUTBOUND_SENDER';

export interface OutboundSender {
  /** Which route a message would take right now, and whether one exists at all. */
  status(): { transport: string; label: string; canSend: boolean };
  /** Delivers text, resolving with the transport used and rejecting when it did not go out. */
  sendText(toPhone: string, text: string): Promise<string>;
}
