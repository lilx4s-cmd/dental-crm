import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable, catchError, tap, throwError } from 'rxjs';
import { Request } from 'express';
import { Prisma } from '@prisma/client';
import { JwtPayload } from '@dental-crm/shared';

import { PrismaService } from '../../prisma/prisma.service';
import { actionFor, redact, ruleFor } from './audit.registry';

/**
 * Writes an audit row for every mutation the registry covers.
 *
 * An interceptor rather than Prisma middleware, deliberately. Middleware sees the query but not
 * the person: it has no request, so no user, no IP and no user-agent, and attributing a change to
 * "the database" answers none of the questions an audit trail exists to answer. The trade is that
 * a change made outside an HTTP request — a future cron job, a script — will not be recorded here,
 * which is noted in TECHNICAL_DEBT.md.
 *
 * Three properties this deliberately guarantees:
 *
 * 1. **A failed write is still audited.** An attempt to delete a treatment plan that came back 403
 *    is often more interesting than one that succeeded. The status is recorded either way.
 * 2. **A failing audit never fails the request.** If the trail is unwritable, a dentist still gets
 *    to save their notes; the failure goes to the log for an operator instead of to the patient's
 *    chair. The reverse — refusing clinical work because a log is down — would be the more
 *    dangerous choice.
 * 3. **Nothing sensitive is copied in.** See `redact`: the audit log is read by more people than
 *    the tables it describes.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Audit');

  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const req = context.switchToHttp().getRequest<Request & { user?: JwtPayload }>();
    const rule = ruleFor(req.route?.path ?? req.path, req.method);
    if (!rule) return next.handle();

    // Captured before the handler runs: `req.params` survives, but a service is free to mutate
    // the body object it was handed, and an audit row describing the post-handler value would be
    // a record of what the code did rather than of what the user asked for.
    const requested = redact(req.body) as Record<string, unknown> | undefined;
    const actorId = req.user?.sub;
    const entityId = rule.idParam ? (req.params?.id ?? undefined) : undefined;

    return next.handle().pipe(
      tap((result) => {
        void this.write(rule.entityType, actorId, req, {
          action: actionFor(req.method),
          // A create has no id in the URL; take it from what the handler returned.
          entityId: entityId ?? this.idFromResult(result),
          requested,
          outcome: 'ok',
        });
      }),
      catchError((error: unknown) => {
        const status = (error as { status?: number })?.status;
        void this.write(rule.entityType, actorId, req, {
          action: actionFor(req.method),
          entityId,
          requested,
          outcome: `failed:${status ?? 500}`,
        });
        return throwError(() => error);
      }),
    );
  }

  private idFromResult(result: unknown): string | undefined {
    const id = (result as { id?: unknown })?.id;
    return typeof id === 'string' ? id : undefined;
  }

  private async write(
    entityType: string,
    userId: string | undefined,
    req: Request,
    detail: {
      action: ReturnType<typeof actionFor>;
      entityId?: string;
      requested?: Record<string, unknown>;
      outcome: string;
    },
  ): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId,
          action: detail.action,
          entityType,
          entityId: detail.entityId,
          // `newValues` is what was asked for, not a diff. Capturing the previous state would mean
          // a read before every write on every audited route — real cost on the hot path, for a
          // value the row's own history already implies. Recorded in TECHNICAL_DEBT.md as the
          // thing to revisit if a genuine before/after is ever needed.
          newValues: {
            outcome: detail.outcome,
            method: req.method,
            path: req.originalUrl?.split('?')[0] ?? req.path,
            ...(detail.requested && Object.keys(detail.requested).length > 0
              ? { requested: detail.requested }
              : {}),
          } as Prisma.InputJsonValue,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        },
      });
    } catch (error) {
      // Never rethrown — see the class comment. A clinic that cannot save a treatment plan because
      // its audit table is unreachable is worse off than one with a gap in its trail.
      this.logger.error(
        `Could not write audit row for ${detail.action} ${entityType}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
