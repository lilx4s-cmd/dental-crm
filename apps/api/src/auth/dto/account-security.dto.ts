import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, MinLength } from 'class-validator';
import { MIN_PASSWORD_LENGTH } from '@dental-crm/shared';
import { IsStrongPassword } from '../../common/validators/is-strong-password.validator';

export class ChangePasswordDto {
  // Not the password policy: this is the password they already have, which may predate it.
  @ApiProperty()
  @IsString()
  @MinLength(1)
  currentPassword!: string;

  @ApiProperty({ minLength: MIN_PASSWORD_LENGTH })
  @IsString()
  @IsStrongPassword()
  newPassword!: string;
}

export class TwoFactorCodeDto {
  // Six digits for TOTP, or an 11-character hyphenated recovery code. The range covers both
  // rather than rejecting a recovery code before it reaches the service that understands it.
  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(6, 20)
  code!: string;
}

export class TwoFactorLoginDto extends TwoFactorCodeDto {
  @ApiProperty({ description: 'The challengeToken returned by POST /auth/login.' })
  @IsString()
  @MinLength(1)
  challengeToken!: string;
}

export class DisableTwoFactorDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  currentPassword!: string;
}
