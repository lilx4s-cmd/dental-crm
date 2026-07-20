import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateUploadUrlDto {
  @IsString() @IsNotEmpty() ownerType: string;
  @IsString() @IsNotEmpty() ownerId: string;
  @IsOptional() @IsString() category?: string;
  @IsString() @IsNotEmpty() fileName: string;
  @IsString() @IsNotEmpty() mimeType: string;
}
