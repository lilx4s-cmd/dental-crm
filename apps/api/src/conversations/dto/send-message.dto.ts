import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class SendMessageDto {
  @IsString() @IsNotEmpty() content: string;
  @IsOptional() @IsString() mediaUrl?: string;
  @IsOptional() @IsString() templateName?: string;
}
