import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class AddPortalCommentDto {
  @IsString() @IsNotEmpty() body: string;
  @IsOptional() @IsString() authorName?: string;
}
