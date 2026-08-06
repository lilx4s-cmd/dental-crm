import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { $Enums } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import {
  INTAKE_ALLOWED_MIME_TYPES,
  INTAKE_CONSENT_TEXT,
  INTAKE_MAX_FILES,
  INTAKE_MAX_FILE_BYTES,
  resolveCountryCode,
} from '@dental-crm/shared';

import { PrismaService } from '../prisma/prisma.service';
import { FilesService } from '../files/files.service';
import {
  ConfirmIntakeAttachmentDto,
  CreateIntakeDto,
  IntakeUploadUrlDto,
} from './dto/create-intake.dto';

@Injectable()
export class IntakeService {
  private readonly logger = new Logger(IntakeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly filesService: FilesService,
  ) {}

  private hash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Records a public enquiry and puts it straight into the pipeline.
   *
   * The submission and its lead are created together so an enquiry can never exist without landing
   * somewhere a coordinator will see it. The lead carries a readable summary in `notes` — the
   * pipeline card should be useful without anyone opening the full questionnaire.
   */
  async submit(dto: CreateIntakeDto) {
    // A filled honeypot means a bot. Return the same success shape rather than an error, so the
    // sender treats it as done and stops retrying — an error just invites another attempt.
    if (dto.website && dto.website.trim() !== '') {
      this.logger.warn('Discarded intake submission: honeypot field populated');
      return { submissionId: null, uploadToken: null, accepted: true };
    }

    if (!dto.email && !dto.phone && !dto.whatsappNumber) {
      throw new BadRequestException('Please give us at least one way to reach you');
    }

    const uploadToken = randomBytes(32).toString('base64url');

    const submission = await this.prisma.$transaction(async (tx) => {
      const lead = await tx.lead.create({
        data: {
          firstName: dto.firstName,
          lastName: dto.lastName,
          email: dto.email,
          phone: dto.phone,
          whatsappNumber: dto.whatsappNumber,
          source: $Enums.LeadSource.WEBSITE,
          stage: $Enums.PipelineStage.NEW_DEAL,
          status: $Enums.LeadStatus.ACTIVE,
          // The form asks for this and it was landing only on the submission, never on the lead —
          // beside the UTM fields that were being copied. `Lead.country` is what decides whether a
          // leading zero on a phone number means Turkey or Saudi Arabia, so every enquiry from the
          // public form had its number parsed as Turkish regardless of what the patient wrote.
          //
          // Free text in, ISO code out. Unrecognised resolves to null rather than to a guess: not
          // knowing is safe, and a wrong country dials a real number belonging to somebody else.
          country: resolveCountryCode(dto.countryOfResidence),
          utmSource: dto.utmSource,
          utmMedium: dto.utmMedium,
          utmCampaign: dto.utmCampaign,
          notes: this.buildLeadNotes(dto),
          // Deliberately unassigned: nobody has claimed this enquiry yet, and the pipeline's
          // "no movement" filter already surfaces anything left sitting.
        },
        select: { id: true },
      });

      return tx.intakeSubmission.create({
        data: {
          leadId: lead.id,
          firstName: dto.firstName,
          lastName: dto.lastName,
          email: dto.email,
          phone: dto.phone,
          whatsappNumber: dto.whatsappNumber,
          dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
          gender: dto.gender,
          nationality: dto.nationality,
          countryOfResidence: dto.countryOfResidence,
          preferredLanguage: dto.preferredLanguage,
          treatmentInterest: dto.treatmentInterest ?? [],
          chiefComplaint: dto.chiefComplaint,
          desiredTimeframe: dto.desiredTimeframe,
          openToTravel: dto.openToTravel,
          allergies: dto.allergies,
          medications: dto.medications,
          medicalConditions: dto.medicalConditions,
          previousSurgeries: dto.previousSurgeries,
          isSmoker: dto.isSmoker,
          drinksAlcohol: dto.drinksAlcohol,
          isPregnant: dto.isPregnant,
          takesBloodThinners: dto.takesBloodThinners,
          heightCm: dto.heightCm,
          weightKg: dto.weightKg,
          additionalNotes: dto.additionalNotes,
          // Stamped server-side. The client cannot be trusted to say when consent happened.
          consentedAt: new Date(),
          consentText: INTAKE_CONSENT_TEXT,
          uploadTokenHash: this.hash(uploadToken),
          sourceUrl: dto.sourceUrl,
          utmSource: dto.utmSource,
          utmMedium: dto.utmMedium,
          utmCampaign: dto.utmCampaign,
        },
        select: { id: true },
      });
    });

    // Returned once and never stored in the clear, so only this browser session can attach files.
    return { submissionId: submission.id, uploadToken, accepted: true };
  }

  /** A short summary for the pipeline card, so a coordinator sees the point without drilling in. */
  private buildLeadNotes(dto: CreateIntakeDto): string {
    const lines = ['Submitted via the public enquiry form.'];
    if (dto.treatmentInterest?.length) lines.push(`Interested in: ${dto.treatmentInterest.join(', ')}`);
    if (dto.chiefComplaint) lines.push(`Main concern: ${dto.chiefComplaint}`);
    if (dto.desiredTimeframe) lines.push(`Timeframe: ${dto.desiredTimeframe}`);
    if (dto.countryOfResidence) lines.push(`Lives in: ${dto.countryOfResidence}`);
    return lines.join('\n');
  }

  /**
   * Resolves a submission from its one-time upload token. Every failure raises the same 404 so the
   * response cannot be used to work out whether a submission id exists — the same posture as the
   * patient portal's share links.
   */
  private async findByUploadToken(submissionId: string, uploadToken: string) {
    const submission = await this.prisma.intakeSubmission.findUnique({
      where: { id: submissionId },
      select: { id: true, uploadTokenHash: true, _count: { select: { attachments: true } } },
    });
    if (!submission || !submission.uploadTokenHash) throw new NotFoundException('Not found');
    if (submission.uploadTokenHash !== this.hash(uploadToken)) throw new NotFoundException('Not found');
    return submission;
  }

  private assertAcceptable(mimeType: string, sizeBytes: number, existingCount: number) {
    if (!(INTAKE_ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType)) {
      throw new BadRequestException('That file type is not accepted. Please send a photo or a PDF.');
    }
    if (sizeBytes > INTAKE_MAX_FILE_BYTES) {
      throw new BadRequestException('That file is too large. The limit is 15 MB.');
    }
    if (existingCount >= INTAKE_MAX_FILES) {
      throw new BadRequestException(`You can attach at most ${INTAKE_MAX_FILES} files.`);
    }
  }

  async createUploadUrl(submissionId: string, dto: IntakeUploadUrlDto) {
    const submission = await this.findByUploadToken(submissionId, dto.uploadToken);
    this.assertAcceptable(dto.mimeType, dto.sizeBytes, submission._count.attachments);

    // Reuses the storage module rather than talking to Supabase here. When the bucket is not
    // configured this raises a 503, which the form treats as "enquiry saved, photos did not send"
    // rather than failing the whole submission.
    return this.filesService.createUploadUrlForVerifiedIntake({
      ownerType: $Enums.AttachableType.LEAD,
      ownerId: submissionId,
      fileName: dto.fileName,
      mimeType: dto.mimeType,
    });
  }

  async confirmAttachment(submissionId: string, dto: ConfirmIntakeAttachmentDto) {
    const submission = await this.findByUploadToken(submissionId, dto.uploadToken);
    this.assertAcceptable(dto.mimeType, dto.sizeBytes, submission._count.attachments);

    const bucket = this.filesService.bucketName();
    if (!bucket) throw new ServiceUnavailableException('File storage is not configured');

    await this.prisma.intakeAttachment.create({
      data: {
        submissionId,
        fileName: dto.fileName,
        mimeType: dto.mimeType,
        sizeBytes: dto.sizeBytes,
        s3Bucket: bucket,
        s3Key: dto.s3Key,
      },
    });
    return { success: true };
  }
}
