import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export class CreateUploadUrlDto {
  @IsString() @IsNotEmpty() ownerType: string;
  @IsString() @IsNotEmpty() ownerId: string;
  @IsOptional() @IsString() category?: string;
  // Bounded because it becomes part of the storage key; path separators are stripped in
  // FilesService.signUpload so an upload cannot escape its owner's folder.
  @IsString() @IsNotEmpty() @MaxLength(255) fileName: string;
  @IsString() @IsNotEmpty() @MaxLength(255) mimeType: string;
}
