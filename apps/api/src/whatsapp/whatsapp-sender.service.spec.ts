jest.mock('./whatsapp-web.service', () => ({ WhatsAppWebService: class {} }));
import { WhatsAppSenderService } from './whatsapp-sender.service';
import { ServiceUnavailableException } from '@nestjs/common';

function setup(connected: boolean) {
  const evolution = { configured: true, sendText: jest.fn() };
  const cloud = { status: () => ({ configured: true }), sendTextMessage: jest.fn() };
  const web = { status: () => ({ state: connected ? 'connected' : 'disconnected' }), sendText: jest.fn() };
  const service = new WhatsAppSenderService(evolution as never, cloud as never, web as never);
  return { service, evolution, cloud, web };
}
describe('Work number isolation', () => {
  it('does not fall back to the shared clinic number when a staff session disconnects', async () => {
    const { service, evolution, cloud, web } = setup(false);
    await expect(service.sendText('905551112233', 'Hello', 'user:u1')).rejects.toThrow(ServiceUnavailableException);
    expect(service.status('user:u1').canSend).toBe(false);
    expect(evolution.sendText).not.toHaveBeenCalled();
    expect(cloud.sendTextMessage).not.toHaveBeenCalled();
    expect(web.sendText).not.toHaveBeenCalled();
  });
  it('uses the connected staff session even when shared gateways are configured', async () => {
    const { service, evolution, web } = setup(true);
    await service.sendText('905551112233', 'Hello', 'user:u1');
    expect(web.sendText).toHaveBeenCalledWith('905551112233', 'Hello', 'user:u1');
    expect(evolution.sendText).not.toHaveBeenCalled();
  });
});
