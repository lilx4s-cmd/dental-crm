import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { $Enums } from '@prisma/client';

/**
 * The public intake body. Mirrors IntakeSubmissionSchema in packages/shared, which the browser
 * validates against first — this is the server's own check, since a public endpoint cannot trust
 * that the request came from our form at all.
 *
 * Every medical boolean is optional and never defaulted: an unanswered question must persist as
 * null, because "did not say" and "no" mean different things clinically.
 */
export class CreateIntakeDto {
  @IsString() @IsNotEmpty() @MaxLength(100) firstName: string;
  @IsString() @IsNotEmpty() @MaxLength(100) lastName: string;

  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(50) phone?: string;
  @IsOptional() @IsString() @MaxLength(50) whatsappNumber?: string;
  @IsOptional() @IsDateString() dateOfBirth?: string;
  @IsOptional() @IsEnum($Enums.Gender) gender?: $Enums.Gender;
  @IsOptional() @IsString() @MaxLength(100) nationality?: string;
  @IsOptional() @IsString() @MaxLength(100) countryOfResidence?: string;
  @IsOptional() @IsString() @MaxLength(100) preferredLanguage?: string;

  @IsOptional() @IsArray() @IsString({ each: true }) treatmentInterest?: string[];
  @IsOptional() @IsString() @MaxLength(2000) chiefComplaint?: string;
  @IsOptional() @IsString() @MaxLength(200) desiredTimeframe?: string;
  @IsOptional() @IsBoolean() openToTravel?: boolean;

  @IsOptional() @IsString() @MaxLength(2000) allergies?: string;
  @IsOptional() @IsString() @MaxLength(2000) medications?: string;
  @IsOptional() @IsString() @MaxLength(2000) medicalConditions?: string;
  @IsOptional() @IsString() @MaxLength(2000) previousSurgeries?: string;
  @IsOptional() @IsBoolean() isSmoker?: boolean;
  @IsOptional() @IsBoolean() drinksAlcohol?: boolean;
  @IsOptional() @IsBoolean() isPregnant?: boolean;
  @IsOptional() @IsBoolean() takesBloodThinners?: boolean;
  @IsOptional() @IsInt() @Min(50) @Max(260) heightCm?: number;
  @IsOptional() @IsInt() @Min(20) @Max(400) weightKg?: number;
  @IsOptional() @IsString() @MaxLength(2000) additionalNotes?: string;

  @IsOptional() @IsString() @MaxLength(500) sourceUrl?: string;
  @IsOptional() @IsString() @MaxLength(200) utmSource?: string;
  @IsOptional() @IsString() @MaxLength(200) utmMedium?: string;
  @IsOptional() @IsString() @MaxLength(200) utmCampaign?: string;

  /**
   * Honeypot. The form renders this hidden and off-screen, so a human never fills it. Anything
   * here means a bot, and the service silently discards the submission — returning success rather
   * than an error, so the bot stops retrying.
   */
  @IsOptional() @IsString() @MaxLength(200) website?: string;
}

export class IntakeUploadUrlDto {
  @IsString() @IsNotEmpty() uploadToken: string;
  @IsString() @IsNotEmpty() @MaxLength(255) fileName: string;
  @IsString() @IsNotEmpty() mimeType: string;
  @IsInt() @Min(1) sizeBytes: number;
}

export class ConfirmIntakeAttachmentDto {
  @IsString() @IsNotEmpty() uploadToken: string;
  @IsString() @IsNotEmpty() @MaxLength(255) fileName: string;
  @IsString() @IsNotEmpty() mimeType: string;
  @IsInt() @Min(1) sizeBytes: number;
  @IsString() @IsNotEmpty() s3Key: string;
}
