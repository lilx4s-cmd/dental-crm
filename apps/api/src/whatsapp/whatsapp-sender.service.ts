import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

import { EvolutionService } from './evolution.service';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppWebService } from './whatsapp-web.service';

export type WhatsAppTransport = 'evolution' | 'cloud_api' | 'web' | 'none';

export const TRANSPORT_LABELS: Record<WhatsAppTransport, string> = {
  evolution: 'Evolution gateway',
  cloud_api: 'WhatsApp Cloud API',
  web: 'Linked phone session',
  none: 'Not connected',
};

/**
 * Picks a way to actually deliver an outbound WhatsApp message.
 *
 * Three transports can exist at once and the CRM should not care which one is live — the inbox is
 * the same inbox either way. Keeping the choice here rather than in ConversationsService means the
 * conversation layer stays about conversations, and adding a fourth transport later touches one
 * file.
 *
 * Order is deliberate: Evolution first because it is the clinic's chosen gateway and the one whose
 * session survives a deploy; the Cloud API next because it is the officially sanctioned path; the
 * in-process phone session last, since it only runs when neither of the others is configured.
 */
@Injectable()
export class WhatsAppSenderService {
  private readonly logger = new Logger(WhatsAppSenderService.name);

  constructor(
    private readonly evolution: EvolutionService,
    private readonly cloud: WhatsAppService,
    private readonly web: WhatsAppWebService,
  ) {}

  /**
   * Which transport a message would go out on right now.
   *
   * Configuration alone is enough for Evolution and the Cloud API — whether the far end answers is
   * only knowable by asking it, and a status call on every keystroke is not worth it. The phone
   * session is different: it holds its own socket, so its liveness is already known here.
   */
  activeTransport(): WhatsAppTransport {
    if (this.evolution.configured) return 'evolution';
    if (this.cloud.status().configured) return 'cloud_api';
    if (this.web.status().state === 'connected') return 'web';
    return 'none';
  }

  status() {
    const transport = this.activeTransport();
    return { transport, label: TRANSPORT_LABELS[transport], canSend: transport !== 'none' };
  }

  /**
   * Sends text to a phone number, returning the transport that carried it.
   *
   * Throws rather than resolving quietly when nothing is configured or the send is rejected. The
   * caller records the failure against the message, and a message the clinic believes was
   * delivered when it never left the building is the worst outcome available here.
   */
  async sendText(toPhone: string, text: string): Promise<WhatsAppTransport> {
    const transport = this.activeTransport();

    switch (transport) {
      case 'evolution':
        await this.evolution.sendText(toPhone, text);
        return 'evolution';
      case 'cloud_api':
        await this.cloud.sendTextMessage(toPhone, text);
        return 'cloud_api';
      case 'web':
        await this.web.sendText(toPhone, text);
        return 'web';
      default:
        throw new ServiceUnavailableException(
          'WhatsApp is not connected. Link the gateway in Settings before sending.',
        );
    }
  }
}
