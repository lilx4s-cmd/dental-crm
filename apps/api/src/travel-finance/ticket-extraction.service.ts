import { Injectable, BadRequestException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { Prisma } from '@prisma/client';
import { JwtPayload } from '@dental-crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { FilesService } from '../files/files.service';
@Injectable()
export class TicketExtractionService {
  private running = false;
  constructor(
    private db: PrismaService,
    private files: FilesService,
    private config: ConfigService,
  ) {}
  async queue(bookingId: string, fileId: string, u: JwtPayload) {
    const attachment = await this.db.travelAttachment.findUnique({
      where: { bookingId_fileId: { bookingId, fileId } },
      include: { file: { select: { mimeType: true, sizeBytes: true, scanStatus: true } } },
    });
    if (!attachment) throw new BadRequestException('Attach the ticket to this visit first');
    await this.files.getDownloadUrl(fileId, u);
    if (attachment.file.mimeType !== 'application/pdf')
      return {
        state: 'MANUAL',
        error:
          'Image ticket extraction is not configured; read and confirm flight details from the image.',
      };
    if (attachment.file.sizeBytes > 10 * 1024 * 1024)
      throw new BadRequestException(
        'Automatic PDF extraction supports tickets up to 10 MB. Enter details manually for larger documents.',
      );
    if (['INFECTED', 'PENDING'].includes(attachment.file.scanStatus))
      throw new BadRequestException('File scanning must complete before extraction');
    return this.db.ticketExtraction.upsert({
      where: { bookingId_fileId: { bookingId, fileId } },
      create: { bookingId, fileId, requestedById: u.sub },
      update: { state: 'QUEUED', error: null, requestedById: u.sub, startedAt: null },
      select: { bookingId: true, fileId: true, state: true, suggestions: true, error: true },
    });
  }
  async status(bookingId: string) {
    return this.db.ticketExtraction.findMany({
      where: { bookingId },
      select: { fileId: true, state: true, suggestions: true, error: true },
    });
  }
  @Cron('10 * * * * *') async sweep() {
    if (
      this.running ||
      !(
        this.config.get('NODE_ENV') === 'production' ||
        this.config.get('TRAVEL_WORKER_ENABLED') === 'true'
      )
    )
      return;
    this.running = true;
    try {
      await this.run();
    } finally {
      this.running = false;
    }
  }
  async run() {
    await this.db.ticketExtraction.updateMany({
      where: { state: 'PROCESSING', startedAt: { lt: new Date(Date.now() - 5 * 60000) } },
      data: { state: 'QUEUED' },
    });
    const jobs = await this.db.ticketExtraction.findMany({
      where: { state: 'QUEUED' },
      orderBy: { requestedAt: 'asc' },
      take: 2,
    });
    for (const job of jobs) {
      const claimed = await this.db.ticketExtraction.updateMany({
        where: { bookingId: job.bookingId, fileId: job.fileId, state: 'QUEUED' },
        data: { state: 'PROCESSING', startedAt: new Date() },
      });
      if (!claimed.count) continue;
      try {
        const user = await this.db.user.findUnique({
          where: { id: job.requestedById },
          include: { accessProfile: true },
        });
        if (!user?.isActive) throw new Error('Employee no longer active');
        const payload: JwtPayload = {
          sub: user.id,
          email: user.email,
          role: user.role,
          permissions: user.accessProfile?.permissions as Record<string, boolean> | undefined,
        };
        const { signedUrl } = await this.files.getDownloadUrl(job.fileId, payload);
        const response = await fetch(signedUrl, {
          signal: AbortSignal.timeout(15000),
          redirect: 'error',
        });
        if (!response.ok || !response.body) throw new Error('Ticket download unavailable');
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 10 * 1024 * 1024) {
            await reader.cancel();
            throw new Error('Ticket exceeds extraction size limit');
          }
          chunks.push(value);
        }
        const data = Buffer.concat(chunks);
        const result = await this.parse(data);
        await this.db.ticketExtraction.update({
          where: { bookingId_fileId: { bookingId: job.bookingId, fileId: job.fileId } },
          data: { state: 'READY', suggestions: result as Prisma.InputJsonValue, error: null },
        });
      } catch {
        await this.db.ticketExtraction.update({
          where: { bookingId_fileId: { bookingId: job.bookingId, fileId: job.fileId } },
          data: {
            state: 'FAILED',
            error:
              'Automatic extraction unavailable or ticket not readable. Enter and confirm the details manually; the uploaded ticket is preserved.',
          },
        });
      }
    }
  }
  private parse(data: Buffer): Promise<object> {
    return new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        ['--max-old-space-size=192', join(process.cwd(), 'scripts', 'extract-ticket.cjs')],
        { stdio: ['pipe', 'pipe', 'pipe'] },
      );
      let output = '';
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error('Extraction timed out'));
      }, 20000);
      child.stdout.on('data', (chunk) => {
        output += chunk.toString();
        if (output.length > 20000) child.kill('SIGKILL');
      });
      child.stderr.resume();
      child.on('error', (e) => {
        clearTimeout(timer);
        reject(e);
      });
      child.on('exit', (code) => {
        clearTimeout(timer);
        if (code !== 0) return reject(new Error('Extraction failed'));
        try {
          resolve(JSON.parse(output));
        } catch {
          reject(new Error('Invalid extraction result'));
        }
      });
      child.stdin.on('error', () => {});
      child.stdin.end(data);
    });
  }
}
