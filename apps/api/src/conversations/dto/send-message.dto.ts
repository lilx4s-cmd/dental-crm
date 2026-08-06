import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsNotEmpty, IsOptional, IsString, IsUUID, ValidateIf } from 'class-validator';

export class SendMessageDto {
  /**
   * Optional, because an attachment on its own is a message.
   *
   * `ValidateIf` rather than `IsOptional`: the rule is not "content may be absent" but "content or
   * an attachment must be present", and a request carrying neither is an empty message the patient
   * would receive as a blank notification.
   */
  @ApiPropertyOptional()
  @ValidateIf((o: SendMessageDto) => !o.fileIds?.length)
  @IsString()
  @IsNotEmpty({ message: 'Send some text, an attachment, or both.' })
  content?: string;

  /**
   * Files already uploaded against this conversation, in order.
   *
   * Ids rather than uploads: the browser sends the bytes straight to storage through a signed URL
   * and confirms them as `File` rows first, so nothing large passes through this API. The service
   * checks each one belongs to this conversation — an id from another thread is not attachable
   * here, however it was obtained.
   *
   * Ten is well past what anyone sends and short of what would make a single notification
   * unreadable on a phone.
   */
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('all', { each: true })
  fileIds?: string[];

  /** WhatsApp's own URL for inbound media. Not a file this clinic stored — see MessageAttachment. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mediaUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  templateName?: string;
}
