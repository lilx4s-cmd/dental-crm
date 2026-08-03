import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { MIN_PASSWORD_LENGTH } from '@dental-crm/shared';
import { IsStrongPassword } from '../../common/validators/is-strong-password.validator';

export class AdminResetPasswordDto {
  // The same policy a user's own password must clear. A reset is exactly the moment a weak
  // password gets set — an admin picking something temporary and memorable for someone else.
  @ApiProperty({ minLength: MIN_PASSWORD_LENGTH })
  @IsString()
  @IsStrongPassword()
  newPassword!: string;
}
