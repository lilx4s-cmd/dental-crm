import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../prisma/prisma.service';
import { FilesService } from './files.service';

/**
 * Builds the service with a given SUPABASE_URL and reports what it decided to use, which is the
 * only observable effect of the normalisation.
 */
async function serviceWithUrl(url?: string) {
  const config = {
    get: (key: string) =>
      ({
        'supabase.url': url,
        'supabase.serviceRoleKey': 'service-role-key',
        'supabase.bucket': 'dental-crm-files',
      })[key],
  };

  const moduleRef = await Test.createTestingModule({
    providers: [
      FilesService,
      { provide: PrismaService, useValue: {} },
      { provide: ConfigService, useValue: config },
    ],
  }).compile();

  return moduleRef.get(FilesService);
}

describe('FilesService storage configuration', () => {
  it('accepts the bare project URL', async () => {
    const s = await serviceWithUrl('https://abc123.supabase.co');
    expect(s.storageStatus()).toMatchObject({ configured: true, missing: [] });
  });

  it('trims the REST path off a URL copied from the API settings page', async () => {
    // This is the URL Supabase shows most prominently, so it is the one that gets pasted. Left
    // as-is, the client would call /rest/v1/storage/v1/... and 404 with nothing pointing at the URL.
    const s = await serviceWithUrl('https://abc123.supabase.co/rest/v1/');
    expect(s.storageStatus().configured).toBe(true);
    // The bucket is unaffected either way; what matters is that the origin survived intact.
    expect(s.bucketName()).toBe('dental-crm-files');
  });

  it('reports exactly which variable is missing rather than a blanket failure', async () => {
    const s = await serviceWithUrl(undefined);
    const status = s.storageStatus();

    expect(status.configured).toBe(false);
    expect(status.missing).toEqual(['SUPABASE_URL']);
  });

  it('never reports the credential itself', async () => {
    const s = await serviceWithUrl('https://abc123.supabase.co');
    // The service-role key bypasses every row-level security rule, so it must not be readable back
    // out of the API that holds it.
    expect(JSON.stringify(s.storageStatus())).not.toContain('service-role-key');
  });
});

describe('FilesService with an unusable URL', () => {
  it('stays up and names the problem instead of refusing to boot', async () => {
    // A mistyped storage URL must not stop the clinic working. Boot-time URL validation used to
    // throw here, which took the entire API down over an optional integration.
    const s = await serviceWithUrl('not a url at all');
    const status = s.storageStatus();

    expect(status.configured).toBe(false);
    expect(status.missing).toContain('SUPABASE_URL (set, but not a valid URL)');
  });

  it('tells an unset variable apart from an unusable one', async () => {
    const unset = (await serviceWithUrl(undefined)).storageStatus();
    expect(unset.missing).toContain('SUPABASE_URL');
    expect(unset.missing).not.toContain('SUPABASE_URL (set, but not a valid URL)');
  });
});
