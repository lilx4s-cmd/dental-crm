import { Injectable, NotFoundException, BadRequestException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { $Enums } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUploadUrlDto } from './dto/create-upload-url.dto';
import { ConfirmFileDto } from './dto/confirm-file.dto';
import {
  canAccessFilesFor,
  isOwnedStorageKey,
  rejectUpload,
  uploadRuleFor,
  type JwtPayload,
} from '@dental-crm/shared';

@Injectable()
export class FilesService {
  // Supabase storage is optional config (see env.validation.ts) so a clinic that hasn't
  // provisioned a bucket yet doesn't lose the entire API — the client is only constructed
  // lazily, on first real use, and every method that needs it calls getClient() first,
  // which throws a clear 503 instead of createClient() throwing a cryptic "invalid URL"
  // error at module-bootstrap time (which used to crash the whole app).
  private supabase: SupabaseClient | null = null;
  private readonly bucket: string;
  private readonly url?: string;
  private readonly urlMalformed: boolean = false;
  private readonly serviceRoleKey?: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const rawUrl = this.config.get<string>('supabase.url');
    this.url = FilesService.normaliseProjectUrl(rawUrl);
    // Distinguishes "nobody set it" from "someone set something unusable", which need different
    // fixes and would otherwise present identically.
    this.urlMalformed = !!rawUrl?.trim() && !this.url;
    this.serviceRoleKey = this.config.get<string>('supabase.serviceRoleKey') || undefined;
    this.bucket = this.config.get<string>('supabase.bucket') ?? '';
  }

  /**
   * Reduces whatever was pasted into SUPABASE_URL down to the project origin.
   *
   * Supabase's API settings page shows the REST endpoint most prominently, so
   * `https://<ref>.supabase.co/rest/v1/` is the natural thing to copy — but the client appends its
   * own paths, so that would send storage calls to `/rest/v1/storage/v1/...` and 404 with nothing
   * to suggest the URL was the problem. Cheap to accept, expensive to debug.
   */
  private static normaliseProjectUrl(raw?: string): string | undefined {
    if (!raw?.trim()) return undefined;
    try {
      return new URL(raw.trim()).origin;
    } catch {
      // Unusable. Reported through storageStatus rather than thrown: boot-time validation would
      // take the whole clinic offline over a typo in an optional integration.
      return undefined;
    }
  }

  /** The configured bucket, or undefined when storage has not been set up for this clinic. */
  bucketName(): string | undefined {
    return this.bucket || undefined;
  }

  /**
   * Whether file storage is usable, and which piece is missing if not.
   *
   * Reports presence only — never the values. The service-role key bypasses every row-level
   * security rule in the project, so it must not be readable back out of the API that holds it,
   * not even to an administrator.
   */
  storageStatus() {
    const missing: string[] = [];
    if (!this.url) missing.push(this.urlMalformed ? 'SUPABASE_URL (set, but not a valid URL)' : 'SUPABASE_URL');
    if (!this.serviceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
    if (!this.bucket) missing.push('SUPABASE_STORAGE_BUCKET');
    return { configured: missing.length === 0, missing, bucket: this.bucket || null };
  }

  /**
   * Proves storage actually works, rather than that three strings are present.
   *
   * Credentials can be set and still be wrong — a typo'd key, or a bucket that was never created.
   * Listing the bucket is the cheapest call that exercises the same path an upload takes.
   */
  async storageCheck() {
    const status = this.storageStatus();
    if (!status.configured) return { ...status, reachable: false, error: 'Not configured' };

    try {
      const { error } = await this.getClient().storage.from(this.bucket).list('', { limit: 1 });
      if (error) return { ...status, reachable: false, error: error.message };
      return { ...status, reachable: true, error: null };
    } catch (e) {
      return { ...status, reachable: false, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  }

  private getClient(): SupabaseClient {
    if (!this.url || !this.serviceRoleKey || !this.bucket) {
      throw new ServiceUnavailableException(
        'File storage is not configured for this clinic (missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_STORAGE_BUCKET)',
      );
    }
    if (!this.supabase) {
      this.supabase = createClient(this.url, this.serviceRoleKey);
    }
    return this.supabase;
  }

  /**
   * Refuses a file operation the caller's role has no business performing.
   *
   * Storage is polymorphic, so the controller cannot express this: one endpoint serves radiographs
   * on a patient and passport scans on a deal, and those answer to different people. The rule is
   * that a record's files are reachable by whoever may reach the record.
   */
  private assertOwnerAccess(ownerType: string, user: JwtPayload) {
    if (!canAccessFilesFor(ownerType, user.role)) {
      // Deliberately says what is refused rather than what exists: a sales consultant probing for
      // a patient's radiographs should not learn whether any are on file.
      throw new ForbiddenException('Your role cannot access files on this record');
    }
  }

  async createUploadUrl(dto: CreateUploadUrlDto, user: JwtPayload) {
    this.assertOwnerAccess(dto.ownerType, user);
    return this.signUpload(dto);
  }

  /**
   * An upload slot for a caller already authorised some other way.
   *
   * The public enquiry form has no staff role. It proves possession of that submission's upload
   * token instead, which IntakeService verifies before reaching here. Kept as a separate method
   * with an awkward name rather than an optional `user` argument: the role check is the only thing
   * between a sales consultant and a patient's radiographs, and an optional parameter is one that
   * eventually gets omitted.
   */
  async createUploadUrlForVerifiedIntake(dto: CreateUploadUrlDto) {
    return this.signUpload(dto);
  }

  private async signUpload(dto: CreateUploadUrlDto) {
    // Refused here as well as on confirm. This check is advisory — a determined client can upload
    // anything to a signed URL regardless — but it turns the common case, someone picking the
    // wrong file, into an immediate message rather than an upload that succeeds and is then
    // rejected. The check that actually protects the bucket is the one in confirm(), against what
    // storage says is there.
    const claimed = rejectUpload(dto.category, dto.mimeType, 0);
    if (claimed?.reason === 'type') throw new BadRequestException(claimed.message);

    const client = this.getClient();
    // The filename is attacker-controlled: it arrives from a browser and ends up in a storage key.
    // Separators are stripped so an upload cannot climb out of its owner's folder, which is what
    // isOwnedStorageKey later relies on.
    //
    // `..` is collapsed as well, and not for traversal — with the separators gone it cannot
    // traverse anything. It is because isOwnedStorageKey refuses any key containing `..`, so a
    // file innocently named "before..after.jpg" would upload successfully and then be impossible
    // to confirm, forever. A test caught that; it would have looked like a broken upload button.
    const safeName = dto.fileName.replace(/[/\\]/g, '_').replace(/\.{2,}/g, '.').slice(-120);
    const path = `${dto.ownerType}/${dto.ownerId}/${randomUUID()}-${safeName}`;
    const { data, error } = await client.storage.from(this.bucket).createSignedUploadUrl(path);
    if (error || !data) {
      throw new BadRequestException(error?.message ?? 'Failed to create signed upload URL');
    }
    return {
      path,
      signedUrl: data.signedUrl,
      token: data.token,
      bucket: this.bucket,
    };
  }

  /**
   * Records an upload, after checking that it is what the client says it is.
   *
   * Everything in the request body is a claim. `mimeType` and `sizeBytes` were written straight to
   * the row, so a caller could declare a 100-byte JPEG and store anything at all; and `s3Key` was
   * taken verbatim, so a `File` row could be pointed at *any* object in the bucket — including one
   * belonging to a different patient — and then read back through the signed-URL endpoint.
   *
   * So: the key must be one this API would have issued for this owner, the object must actually
   * exist, and the type and size are read from storage and checked against the category's rule.
   */
  async confirm(dto: ConfirmFileDto, uploadedById: string, user: JwtPayload) {
    this.assertOwnerAccess(dto.ownerType, user);

    if (!isOwnedStorageKey(dto.s3Key, dto.ownerType, dto.ownerId)) {
      throw new ForbiddenException('That storage key does not belong to this record.');
    }

    const stored = await this.statObject(dto.s3Key);
    if (!stored) {
      throw new BadRequestException('No uploaded file was found at that location.');
    }

    // The observed values, never the claimed ones.
    const rejection = rejectUpload(dto.category, stored.mimeType, stored.sizeBytes);
    if (rejection) {
      // Remove it rather than leaving an unreferenced object in the bucket — otherwise a refused
      // upload is still a stored upload, and the allowlist protects the database row but not the
      // storage it points at.
      await this.deleteObject(dto.s3Key);
      throw new BadRequestException(rejection.message);
    }

    return this.prisma.file.create({
      data: {
        ownerType: dto.ownerType as $Enums.AttachableType,
        ownerId: dto.ownerId,
        category: (dto.category as $Enums.FileCategory) ?? 'OTHER',
        fileName: dto.fileName,
        mimeType: stored.mimeType,
        sizeBytes: stored.sizeBytes,
        s3Bucket: this.bucket,
        s3Key: dto.s3Key,
        uploadedById,
      },
    });
  }

  /** What storage says is actually at this key, or null if nothing is. */
  private async statObject(s3Key: string): Promise<{ mimeType: string; sizeBytes: number } | null> {
    const client = this.getClient();
    const lastSlash = s3Key.lastIndexOf('/');
    const folder = s3Key.slice(0, lastSlash);
    const name = s3Key.slice(lastSlash + 1);

    const { data, error } = await client.storage.from(this.bucket).list(folder, { search: name });
    if (error || !data?.length) return null;

    const match = data.find((item) => item.name === name);
    if (!match) return null;

    return {
      mimeType: (match.metadata?.mimetype as string | undefined) ?? 'application/octet-stream',
      sizeBytes: Number(match.metadata?.size ?? 0),
    };
  }

  private async deleteObject(s3Key: string): Promise<void> {
    try {
      await this.getClient().storage.from(this.bucket).remove([s3Key]);
    } catch {
      // Best effort. A refused upload that could not be cleaned up is a stray object, not a
      // security hole — the File row it would need is exactly what was just refused.
    }
  }

  async findByOwner(ownerType: string, ownerId: string, user: JwtPayload) {
    this.assertOwnerAccess(ownerType, user);
    return this.prisma.file.findMany({
      where: { ownerType: ownerType as $Enums.AttachableType, ownerId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getDownloadUrl(id: string, user: JwtPayload) {
    const file = await this.prisma.file.findUnique({ where: { id } });
    if (!file) throw new NotFoundException('File not found');
    this.assertOwnerAccess(file.ownerType, user);

    const client = this.getClient();
    const { data, error } = await client.storage
      .from(file.s3Bucket)
      // Forces a download rather than letting the browser render the object on the storage origin.
      // Belt to the allowlist's braces: if anything scriptable ever does reach the bucket — an
      // object stored before this check existed, or one uploaded straight to a signed URL — this
      // is what stops it executing.
      .createSignedUrl(file.s3Key, 300, { download: file.fileName });
    if (error || !data) {
      throw new BadRequestException(error?.message ?? 'Failed to create signed download URL');
    }
    return { signedUrl: data.signedUrl };
  }

  async remove(id: string, user: JwtPayload) {
    const file = await this.prisma.file.findUnique({ where: { id } });
    if (!file) throw new NotFoundException('File not found');
    this.assertOwnerAccess(file.ownerType, user);

    const client = this.getClient();
    await client.storage.from(file.s3Bucket).remove([file.s3Key]);
    await this.prisma.file.delete({ where: { id } });
    return { success: true };
  }
}
