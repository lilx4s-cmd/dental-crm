import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@clinic.com' })
  @IsEmail()
  email: string;

  // Deliberately not the password policy. This is a shape check on what someone typed, not a
  // judgement on it: the policy applies when a password is *set*, and enforcing it at sign-in
  // would lock out every account whose password predates the policy — on the day it shipped,
  // that would have been all eight of them.
  @ApiProperty({ example: 'correct horse battery staple' })
  @IsString()
  @MinLength(1)
  password: string;
}
