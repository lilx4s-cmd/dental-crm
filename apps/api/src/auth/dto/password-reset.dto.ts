import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { MIN_PASSWORD_LENGTH } from '@dental-crm/shared';
import { IsStrongPassword } from '../../common/validators/is-strong-password.validator';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'coordinator@clinic.com' })
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty({ description: 'The token from the emailed link.' })
  @IsString()
  @MinLength(1)
  token!: string;

  // The same policy an admin-set password must clear. A reset is a common moment for a weak
  // password to be chosen — someone under pressure, picking something they can type quickly.
  @ApiProperty({ minLength: MIN_PASSWORD_LENGTH })
  @IsString()
  @IsStrongPassword()
  newPassword!: string;
}
