import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createPublicKey, verify } from 'crypto';
export function commandId(attemptId: string, action: string) {
  const hex = createHash('sha256').update(`${attemptId}:${action}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
export class CallingProviderError extends ServiceUnavailableException {
  constructor(message: string, readonly unconfirmed: boolean) { super(message); }
}
@Injectable()
export class TelnyxProvider {
  constructor(private readonly config: ConfigService) {}
  value(key: string): string { return this.config.get<string>(key)?.trim() ?? ''; }
  setup() {
    const keys = ['TELNYX_API_KEY', 'TELNYX_PUBLIC_KEY', 'TELNYX_CALL_CONTROL_CONNECTION_ID', 'TELNYX_CREDENTIAL_CONNECTION_ID', 'TELNYX_CALLER_NUMBER', 'TELNYX_WEBHOOK_URL'];
    const missing = keys.filter(key => !this.value(key));
    const issues: string[] = [];
    if (this.value('TELNYX_CALLER_NUMBER') && !/^\+1[2-9]\d{9}$/.test(this.value('TELNYX_CALLER_NUMBER'))) issues.push('A US or Canadian caller number is required.');
    if (this.value('TELNYX_WEBHOOK_URL')) {
      try { const u = new URL(this.value('TELNYX_WEBHOOK_URL')); if (u.protocol !== 'https:' || !u.pathname.endsWith('/api/calling/webhook')) issues.push('Webhook URL must use HTTPS and end with /api/calling/webhook.'); }
      catch { issues.push('Webhook URL is invalid.'); }
    }
    if (this.value('TELNYX_PUBLIC_KEY')) {
      try {
        const publicKey = this.value('TELNYX_PUBLIC_KEY');
        const key = publicKey.includes('BEGIN PUBLIC KEY') ? createPublicKey(publicKey) : createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(publicKey, 'base64')]), format: 'der', type: 'spki' });
        if (key.asymmetricKeyType !== 'ed25519') issues.push('Calling webhook public key must be Ed25519.');
      } catch { issues.push('Calling webhook public key is invalid.'); }
    }
    const enabled = this.value('TELNYX_ENABLED') === 'true';
    return { provider: 'telnyx', enabled, configured: !missing.length && !issues.length, ready: enabled && !missing.length && !issues.length, missing, issues, callerNumber: this.value('TELNYX_CALLER_NUMBER') || null };
  }
  assertReady() {
    if (!this.setup().ready) throw new ServiceUnavailableException('Calling is not activated. The clinic owner must configure Telnyx first.');
  }
  async request(path: string, body?: Record<string, unknown>, method = 'POST'): Promise<unknown> {
    const res = await fetch(`https://api.telnyx.com/v2${path}`, {
      method, headers: { Authorization: `Bearer ${this.value('TELNYX_API_KEY')}`, 'Content-Type': 'application/json', Accept: 'application/json, text/plain' },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(12000),
    }).catch(() => { throw new CallingProviderError('Calling service could not be reached.', true); });
    if (!res.ok) throw new CallingProviderError('Calling service rejected the request. Check the clinic calling configuration.', false);
    const raw = await res.text();
    try { return JSON.parse(raw); } catch { return raw; }
  }
  async token(credentialId: string): Promise<string> {
    const result = await this.request(`/telephony_credentials/${encodeURIComponent(credentialId)}/token`);
    if (typeof result !== 'string' || result.split('.').length !== 3) throw new ServiceUnavailableException('Calling service returned an invalid browser token.');
    return result;
  }
  async createCredential(userId: string, expiresAt: Date): Promise<{ id: string; sip_username: string }> {
    const result = await this.request('/telephony_credentials', { connection_id: this.value('TELNYX_CREDENTIAL_CONNECTION_ID'), name: `crm-${userId}`, expires_at: expiresAt.toISOString() }) as { data?: { id: string; sip_username: string } };
    if (!result.data?.id || !/^[a-zA-Z0-9_.-]+$/.test(result.data.sip_username)) throw new ServiceUnavailableException('Calling service returned invalid staff credentials.');
    return result.data;
  }
  async dial(id: string, leg: 'staff' | 'patient', to: string, staffCallId?: string) {
    const result = await this.request('/calls', {
      connection_id: this.value('TELNYX_CALL_CONTROL_CONNECTION_ID'), to, from: this.value('TELNYX_CALLER_NUMBER'),
      webhook_url: this.value('TELNYX_WEBHOOK_URL'), timeout_secs: 25, time_limit_secs: 900,
      custom_headers: [{ name: 'X-CRM-Attempt', value: id }],
      command_id: commandId(id, `dial-${leg}`), client_state: Buffer.from(JSON.stringify({ id, leg })).toString('base64'),
      ...(staffCallId ? { link_to: staffCallId, bridge_on_answer: true } : {}),
    }) as { data?: { call_control_id?: string } };
    if (!result.data?.call_control_id) throw new CallingProviderError('Calling service did not confirm the call.', true);
    return result.data.call_control_id;
  }
  async hangup(id: string, callId: string) {
    try { return await this.request(`/calls/${encodeURIComponent(callId)}/actions/hangup`, { command_id: commandId(id, `hangup-${callId}`) }); }
    catch (error) {
      // A duplicate hangup is harmless only when the provider confirms this leg is dead.
      const result = await this.request(`/calls/${encodeURIComponent(callId)}`, undefined, 'GET') as { data?: { is_alive?: boolean } };
      if (result.data?.is_alive === false) return;
      throw error;
    }
  }
  verifyWebhook(raw: Buffer | undefined, timestamp: string | undefined, signature: string | undefined) {
    if (!raw || !timestamp || !signature || !/^\d+$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) throw new BadRequestException('Invalid calling webhook.');
    try {
      const publicKey = this.value('TELNYX_PUBLIC_KEY');
      const key = publicKey.includes('BEGIN PUBLIC KEY') ? createPublicKey(publicKey) : createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(publicKey, 'base64')]), format: 'der', type: 'spki' });
      if (!verify(null, Buffer.concat([Buffer.from(`${timestamp}|`), raw]), key, Buffer.from(signature, 'base64'))) throw new Error('invalid');
    } catch { throw new BadRequestException('Invalid calling webhook.'); }
  }
}
