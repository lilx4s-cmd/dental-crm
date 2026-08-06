import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { FilesService } from './files.service';
import { MalwareScanService } from './malware-scan';
import type { JwtPayload } from '@dental-crm/shared';

/**
 * `confirm()` had no tests at all, which is why the request body was trusted for so long: nothing
 * ever asserted what happened to it. Everything a client sends here is a claim, and each of these
 * covers one claim being false.
 */

const DENTIST: JwtPayload = { sub: 'u1', email: 'd@clinic.com', role: 'DENTIST' as never };
const SALES: JwtPayload = { sub: 'u2', email: 's@clinic.com', role: 'SALES_CONSULTANT' as never };

const mockPrisma = { file: { create: jest.fn() } };

/** Whatever storage should claim is at the key, plus a record of what was removed. */
let storedObjects: Array<{ name: string; metadata: { mimetype: string; size: number } }> = [];
const removed: string[] = [];

const storageFrom = {
  list: jest.fn(async () => ({ data: storedObjects, error: null })),
  remove: jest.fn(async (keys: string[]) => {
    removed.push(...keys);
    return { data: null, error: null };
  }),
  createSignedUploadUrl: jest.fn(async (path: string) => ({
    data: { signedUrl: `https://storage/${path}`, token: 't', path },
    error: null,
  })),
};

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ storage: { from: () => storageFrom } }),
}));

async function makeService() {
  const config = {
    get: (key: string) =>
      ({
        'supabase.url': 'https://project.supabase.co',
        'supabase.serviceRoleKey': 'service-role-key',
        'supabase.bucket': 'dental-crm-files',
      })[key],
  };
  const moduleRef = await Test.createTestingModule({
    providers: [
      FilesService,
      { provide: PrismaService, useValue: mockPrisma },
      { provide: ConfigService, useValue: config },
      // No scanner configured in these tests, matching this clinic — the status written is
      // SKIPPED, and confirm() short-circuits before any network call.
      { provide: MalwareScanService, useValue: { configured: false, scan: jest.fn() } },
    ],
  }).compile();
  return moduleRef.get(FilesService);
}

const body = (over: Partial<Record<string, unknown>> = {}) => ({
  ownerType: 'PATIENT',
  ownerId: 'p1',
  category: 'XRAY',
  fileName: 'scan.jpg',
  mimeType: 'image/jpeg',
  sizeBytes: 1000,
  s3Key: 'PATIENT/p1/uuid-scan.jpg',
  ...over,
}) as never;

describe('FilesService.confirm', () => {
  let service: FilesService;

  beforeEach(async () => {
    jest.clearAllMocks();
    removed.length = 0;
    storedObjects = [{ name: 'uuid-scan.jpg', metadata: { mimetype: 'image/jpeg', size: 4_000_000 } }];
    mockPrisma.file.create.mockResolvedValue({ id: 'f1' });
    service = await makeService();
  });

  it('records a legitimate upload', async () => {
    await service.confirm(body(), 'u1', DENTIST);
    expect(mockPrisma.file.create).toHaveBeenCalledTimes(1);
  });

  it('stores the size and type storage reports, not the ones claimed', async () => {
    // A caller could declare a 100-byte JPEG and store anything at all.
    await service.confirm(body({ mimeType: 'image/jpeg', sizeBytes: 100 }), 'u1', DENTIST);

    const written = mockPrisma.file.create.mock.calls[0][0].data;
    expect(written.sizeBytes).toBe(4_000_000);
    expect(written.mimeType).toBe('image/jpeg');
  });

  it('refuses a storage key belonging to another patient', async () => {
    // The attack the s3Key check exists for: point a File row at someone else's radiograph, then
    // read it back through the signed-URL endpoint.
    await expect(
      service.confirm(body({ s3Key: 'PATIENT/p2/uuid-scan.jpg' }), 'u1', DENTIST),
    ).rejects.toThrow(ForbiddenException);
    expect(mockPrisma.file.create).not.toHaveBeenCalled();
  });

  it('refuses a key that traverses out of its folder', async () => {
    await expect(
      service.confirm(body({ s3Key: 'PATIENT/p1/../p2/scan.jpg' }), 'u1', DENTIST),
    ).rejects.toThrow(ForbiddenException);
  });

  it('refuses when nothing was actually uploaded', async () => {
    storedObjects = [];
    await expect(service.confirm(body(), 'u1', DENTIST)).rejects.toThrow(BadRequestException);
    expect(mockPrisma.file.create).not.toHaveBeenCalled();
  });

  it('refuses a script uploaded as a radiograph, and deletes it', async () => {
    // Supabase serves an object with the type it was stored under, so this would have executed on
    // the storage origin — beside the passport scans.
    storedObjects = [
      { name: 'uuid-scan.jpg', metadata: { mimetype: 'image/svg+xml', size: 2_000 } },
    ];

    await expect(service.confirm(body(), 'u1', DENTIST)).rejects.toThrow(/accepts/);
    expect(mockPrisma.file.create).not.toHaveBeenCalled();
    // A refused upload must not remain in the bucket — otherwise the allowlist protects the row
    // and not the storage it points at.
    expect(removed).toContain('PATIENT/p1/uuid-scan.jpg');
  });

  it('refuses an oversized file, and deletes it', async () => {
    storedObjects = [
      { name: 'uuid-scan.jpg', metadata: { mimetype: 'image/jpeg', size: 40 * 1024 * 1024 } },
    ];

    await expect(service.confirm(body(), 'u1', DENTIST)).rejects.toThrow(/under/);
    expect(removed).toContain('PATIENT/p1/uuid-scan.jpg');
  });

  it('still refuses a role that may not touch this record at all', async () => {
    // The role check runs before any of the above; a sales consultant probing for radiographs
    // should not learn whether the upload would otherwise have been valid.
    await expect(service.confirm(body(), 'u2', SALES)).rejects.toThrow(ForbiddenException);
  });
});

describe('FilesService.createUploadUrl', () => {
  let service: FilesService;

  beforeEach(async () => {
    jest.clearAllMocks();
    service = await makeService();
  });

  it('refuses a disallowed type before handing out a slot', async () => {
    // Advisory — a determined client can upload anything to a signed URL — but it turns the common
    // case, someone picking the wrong file, into an immediate message.
    await expect(
      service.createUploadUrl(body({ mimeType: 'text/html' }), DENTIST),
    ).rejects.toThrow(BadRequestException);
  });

  it('keeps an upload inside its own owner folder despite a hostile filename', async () => {
    // The filename arrives from a browser and becomes part of the storage key. Without stripping
    // separators it could climb out of the folder that isOwnedStorageKey later relies on.
    await service.createUploadUrl(body({ fileName: '../../etc/passwd.jpg' }), DENTIST);

    const path = storageFrom.createSignedUploadUrl.mock.calls[0][0] as string;
    expect(path.startsWith('PATIENT/p1/')).toBe(true);
    expect(path).not.toContain('..');
  });
});
