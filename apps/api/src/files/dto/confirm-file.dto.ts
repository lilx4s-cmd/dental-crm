import { IsString, IsNotEmpty, IsOptional, IsNumber, Min } from 'class-validator';

export class ConfirmFileDto {
  @IsString() @IsNotEmpty() ownerType: string;
  @IsString() @IsNotEmpty() ownerId: string;
  @IsOptional() @IsString() category?: string;
  @IsString() @IsNotEmpty() fileName: string;
  @IsString() @IsNotEmpty() mimeType: string;
  @IsNumber() @Min(0) sizeBytes: number;
  // Path returned from POST /files/upload-url — becomes File.s3Key.
  @IsString() @IsNotEmpty() s3Key: string;
}
