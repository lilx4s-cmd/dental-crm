import { Injectable } from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';
import { CLINICAL, PIPELINE, Role, type JwtPayload } from '@dental-crm/shared';

import { PrismaService } from '../prisma/prisma.service';

/** How many of each kind. Enough to recognise the one you meant, few enough to scan. */
const PER_TYPE = 6;

export interface SearchHit {
  type: 'lead' | 'patient';
  id: string;
  title: string;
  subtitle: string;
  /** Where the palette navigates to. */
  href: string;
}

/**
 * One query across the records a person is allowed to see.
 *
 * There was no global search at all — the largest daily friction in the audit, and the only item
 * every competitor in the brief has. Leads and patients each had a `search` parameter on their own
 * list endpoint, so finding someone meant already knowing which screen they were on.
 *
 * **The access rules are the hard part, not the query.** A search box that finds records it cannot
 * open is worse than no search box: it confirms a patient exists to someone who is not allowed to
 * know that. So this reproduces the exact gates the list endpoints use rather than inventing its
 * own — patients are CLINICAL-only, leads are PIPELINE-only, and a non-admin sees only leads
 * assigned to them.
 */
@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(term: string, user: JwtPayload): Promise<SearchHit[]> {
    const q = term.trim();
    // Two characters match most of the database and cost a full scan to prove it.
    if (q.length < 2) return [];

    const [leads, patients] = await Promise.all([
      this.searchLeads(q, user),
      this.searchPatients(q, user),
    ]);

    return [...leads, ...patients];
  }

  private async searchLeads(q: string, user: JwtPayload): Promise<SearchHit[]> {
    if (!(PIPELINE as readonly string[]).includes(user.role)) return [];

    const where: Prisma.LeadWhereInput = {
      // Merged duplicates are not separate people. Surfacing both halves of a merge would offer a
      // choice between a record and its own shadow.
      mergedIntoId: null,
      OR: this.contactMatch(q),
    };
    // The same scoping the board uses: only SUPER_ADMIN sees the whole pipeline.
    if (user.role !== Role.SUPER_ADMIN) where.assignedToId = user.sub;

    const rows = await this.prisma.lead.findMany({
      where,
      select: { id: true, firstName: true, lastName: true, phone: true, stage: true, status: true },
      // Active first, then most recently touched — a closed deal from last year is rarely the one
      // being looked for.
      orderBy: [{ status: 'asc' }, { stageChangedAt: 'desc' }],
      take: PER_TYPE,
    });

    return rows.map((lead) => ({
      type: 'lead' as const,
      id: lead.id,
      title: `${lead.firstName} ${lead.lastName ?? ''}`.trim(),
      subtitle: [lead.stage.replace(/_/g, ' ').toLowerCase(), lead.phone].filter(Boolean).join(' · '),
      href: `/pipeline?lead=${lead.id}`,
    }));
  }

  private async searchPatients(q: string, user: JwtPayload): Promise<SearchHit[]> {
    // Deliberately the same gate as PatientsController. A sales consultant must not learn from a
    // search box that a patient exists.
    if (!(CLINICAL as readonly string[]).includes(user.role)) return [];

    const rows = await this.prisma.patient.findMany({
      where: { OR: this.contactMatch(q, true) },
      select: { id: true, firstName: true, lastName: true, phone: true, caseNumber: true, isActive: true },
      orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
      take: PER_TYPE,
    });

    return rows.map((patient) => ({
      type: 'patient' as const,
      id: patient.id,
      title: `${patient.firstName} ${patient.lastName}`.trim(),
      subtitle: [patient.caseNumber, patient.phone].filter(Boolean).join(' · '),
      href: `/patients/${patient.id}`,
    }));
  }

  /**
   * Name, email or phone — the three things anyone actually searches by.
   *
   * Phone matching strips punctuation from the *term* so "+90 555" finds a number stored as
   * 905551234567. It cannot strip punctuation from the column without a scan, which is why the
   * stored form was canonicalised separately.
   */
  private contactMatch(q: string, includeCaseNumber = false) {
    const digits = q.replace(/\D/g, '');
    const contains = { contains: q, mode: Prisma.QueryMode.insensitive };

    const clauses: Array<Record<string, unknown>> = [
      { firstName: contains },
      { lastName: contains },
      { email: contains },
    ];

    if (digits.length >= 4) {
      clauses.push({ phone: { contains: digits } }, { whatsappNumber: { contains: digits } });
    }
    if (includeCaseNumber) {
      // What staff say on the telephone, so it is worth matching exactly.
      clauses.push({ caseNumber: contains });
    }
    return clauses;
  }
}

/** Re-exported so the controller's return type does not import Prisma's. */
export type { $Enums };
