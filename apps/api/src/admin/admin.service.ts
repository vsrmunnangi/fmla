import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface AdminOverview {
  claimsByStatus: Record<string, number>;
  totalDocuments: number;
  exceptionsByType: Record<string, number>;
  failedClaims: { id: string; claimant: string; employer: string; updatedAt: Date }[];
  recentActivity: {
    claimId: string;
    actor: string;
    fromStatus: string | null;
    toStatus: string;
    at: Date;
  }[];
}

/** Read-only operational overview across ALL claims — not scoped to one claim like
 * everything else in ClaimsService. Not part of §8's route table (same reasoning as
 * GET /claims/:id): a small, low-risk, clearly-useful completion, not a scope change. */
@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  async getOverview(): Promise<AdminOverview> {
    const [statusGroups, totalDocuments, exceptionRows, failedClaims, recentActivity] = await Promise.all([
      this.prisma.claim.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.document.count(),
      this.prisma.$queryRaw<{ type: string; count: bigint }[]>`
        SELECT exc ->> 'type' AS type, count(*) AS count
        FROM (
          SELECT DISTINCT ON (claim_id) claim_id, package
          FROM packages
          ORDER BY claim_id, version DESC
        ) latest,
        LATERAL jsonb_array_elements(latest.package -> 'exceptions') AS exc
        GROUP BY exc ->> 'type'
      `,
      this.prisma.claim.findMany({
        where: { status: 'FAILED' },
        orderBy: { updatedAt: 'desc' },
        select: { id: true, claimant: true, employer: true, updatedAt: true },
      }),
      this.prisma.claimStatusHistory.findMany({
        orderBy: { at: 'desc' },
        take: 20,
        select: { claimId: true, actor: true, fromStatus: true, toStatus: true, at: true },
      }),
    ]);

    return {
      claimsByStatus: Object.fromEntries(statusGroups.map((g) => [g.status, g._count._all])),
      totalDocuments,
      exceptionsByType: Object.fromEntries(exceptionRows.map((r) => [r.type, Number(r.count)])),
      failedClaims,
      recentActivity,
    };
  }
}
