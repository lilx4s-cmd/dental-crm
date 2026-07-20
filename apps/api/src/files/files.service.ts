import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { $Enums } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUploadUrlDto } from './dto/create-upload-url.dto';
import { ConfirmFileDto } from './dto/confirm-file.dto';

@Injectable()
export class FilesService {
  private readonly supabase: SupabaseClient;
  private readonly bucket: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const url = this.config.get<string>('supabase.url');
    const serviceRoleKey = this.config.get<string>('supabase.serviceRoleKey');
    this.bucket = this.config.get<string>('supabase.bucket') ?? '';
    this.supabase = createClient(url ?? '', serviceRoleKey ?? '');
  }

  async createUploadUrl(dto: CreateUploadUrlDto) {
    const path = `${dto.ownerType}/${dto.ownerId}/${randomUUID()}-${dto.fileName}`;
    const { data, error } = await this.supabase.storage.from(this.bucket).createSignedUploadUrl(path);
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

    const { data, error } = await this.supabase.storage
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

    await this.supabase.storage.from(file.s3Bucket).remove([file.s3Key]);
    await this.prisma.file.delete({ where: { id } });
    return { success: true };
  }
}
