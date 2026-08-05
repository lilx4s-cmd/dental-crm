import { IsString, IsNotEmpty, IsOptional, IsNumber, Min, MaxLength } from 'class-validator';

/**
 * Everything here is a *claim* by the client. None of it is trusted.
 *
 * `mimeType` and `sizeBytes` used to be written straight to the row, so a caller could declare a
 * 100-byte JPEG and store anything at all; `s3Key` was taken verbatim, so a File row could point
 * at any object in the bucket. FilesService.confirm now reads the real values from storage and
 * checks the key belongs to this owner — these constraints only keep obvious nonsense out of the
 * request.
 */
export class ConfirmFileDto {
  @IsString() @IsNotEmpty() ownerType: string;
  @IsString() @IsNotEmpty() ownerId: string;
  @IsOptional() @IsString() category?: string;
  // Long enough for a real scanner filename, bounded because it becomes part of a storage key.
  @IsString() @IsNotEmpty() @MaxLength(255) fileName: string;
  @IsString() @IsNotEmpty() @MaxLength(255) mimeType: string;
  @IsNumber() @Min(0) sizeBytes: number;
  // Path returned from POST /files/upload-url — becomes File.s3Key.
  @IsString() @IsNotEmpty() @MaxLength(1024) s3Key: string;
}
