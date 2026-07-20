import { Injectable, NotFoundException, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { $Enums } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUploadUrlDto } from './dto/create-upload-url.dto';
import { ConfirmFileDto } from './dto/confirm-file.dto';

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
  private readonly serviceRoleKey?: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.url = this.config.get<string>('supabase.url') || undefined;
    this.serviceRoleKey = this.config.get<string>('supabase.serviceRoleKey') || undefined;
    this.bucket = this.config.get<string>('supabase.bucket') ?? '';
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

  async createUploadUrl(dto: CreateUploadUrlDto) {
    const client = this.getClient();
    const path = `${dto.ownerType}/${dto.ownerId}/${randomUUID()}-${dto.fileName}`;
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

  async confirm(dto: ConfirmFileDto, uploadedById: string) {
    return this.prisma.file.create({
      data: {
        ownerType: dto.ownerType as $Enums.AttachableType,
        ownerId: dto.ownerId,
        category: (dto.category as $Enums.FileCategory) ?? 'OTHER',
        fileName: dto.fileName,
        mimeType: dto.mimeType,
        sizeBytes: dto.sizeBytes,
        s3Bucket: this.bucket,
        s3Key: dto.s3Key,
        uploadedById,
      },
    });
  }

  async findByOwner(ownerType: string, ownerId: string) {
    return this.prisma.file.findMany({
      where: { ownerType: ownerType as $Enums.AttachableType, ownerId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getDownloadUrl(id: string) {
    const file = await this.prisma.file.findUnique({ where: { id } });
    if (!file) throw new NotFoundException('File not found');

    const client = this.getClient();
    const { data, error } = await client.storage
      .from(file.s3Bucket)
      .createSignedUrl(file.s3Key, 300);
    if (error || !data) {
      throw new BadRequestException(error?.message ?? 'Failed to create signed download URL');
    }
    return { signedUrl: data.signedUrl };
  }

  async remove(id: string) {
    const file = await this.prisma.file.findUnique({ where: { id } });
    if (!file) throw new NotFoundException('File not found');

    const client = this.getClient();
    await client.storage.from(file.s3Bucket).remove([file.s3Key]);
    await this.prisma.file.delete({ where: { id } });
    return { success: true };
  }
}
