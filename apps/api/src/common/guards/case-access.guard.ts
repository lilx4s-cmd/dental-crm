import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtPayload } from '@dental-crm/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { assertCaseRecordAccess, CaseRecord } from '../patient-case-access';

export const CASE_ACCESS_KEY = 'patient-case-access';
export interface CaseRule {
  type: CaseRecord;
  field: string;
  source?: 'params' | 'query' | 'body';
  optional?: boolean;
}
/** Empty rules explicitly mark a catalogue/list operation with no single case. Lists still scope their query. */
export const CaseAccess = (...rules: CaseRule[]) => SetMetadata(CASE_ACCESS_KEY, rules);

@Injectable()
export class CaseAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{
        user: JwtPayload;
        params?: Record<string, unknown>;
        query?: Record<string, unknown>;
        body?: Record<string, unknown>;
      }>();
    if (!request.user) throw new UnauthorizedException();
    const rules = this.reflector.getAllAndOverride<CaseRule[]>(CASE_ACCESS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!rules) throw new BadRequestException('Case access policy is missing');
    const patients = new Set<string>();
    for (const rule of rules) {
      const value = request[rule.source ?? 'params']?.[rule.field];
      if (rule.optional && (value === undefined || value === null)) continue;
      if (typeof value !== 'string' || !value.trim())
        throw new BadRequestException('Choose a valid patient or treatment plan');
      patients.add(await assertCaseRecordAccess(this.prisma, rule.type, value, request.user));
    }
    if (patients.size > 1)
      throw new BadRequestException('The patient and treatment plan must belong to the same case');
    return true;
  }
}
