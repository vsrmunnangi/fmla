import { Test } from '@nestjs/testing';
import { AdminService } from './admin.service';
import { PrismaService } from '../prisma/prisma.service';
import '../common/bigint-json';

describe('AdminService', () => {
  let service: AdminService;
  let prisma: {
    claim: { groupBy: jest.Mock; findMany: jest.Mock };
    document: { count: jest.Mock };
    claimStatusHistory: { findMany: jest.Mock };
    $queryRaw: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      claim: {
        groupBy: jest.fn().mockResolvedValue([
          { status: 'AWAITING_REVIEW', _count: { _all: 3 } },
          { status: 'CERTIFIED', _count: { _all: 2 } },
        ]),
        findMany: jest.fn().mockResolvedValue([
          { id: 'FMLA-1', claimant: 'A', employer: 'B', updatedAt: new Date('2026-01-01') },
        ]),
      },
      document: { count: jest.fn().mockResolvedValue(7) },
      claimStatusHistory: {
        findMany: jest.fn().mockResolvedValue([
          { claimId: 'FMLA-1', actor: 'alice', fromStatus: 'AWAITING_REVIEW', toStatus: 'CERTIFIED', at: new Date() },
        ]),
      },
      $queryRaw: jest.fn().mockResolvedValue([
        { type: 'missing', count: BigInt(5) },
        { type: 'unclear', count: BigInt(2) },
      ]),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [AdminService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(AdminService);
  });

  it('aggregates claims by status, documents, exceptions by type, failed claims, and recent activity', async () => {
    const overview = await service.getOverview();

    expect(overview.claimsByStatus).toEqual({ AWAITING_REVIEW: 3, CERTIFIED: 2 });
    expect(overview.totalDocuments).toBe(7);
    expect(overview.exceptionsByType).toEqual({ missing: 5, unclear: 2 }); // BigInt -> number
    expect(overview.failedClaims).toHaveLength(1);
    expect(overview.recentActivity).toHaveLength(1);

    // asserting it's JSON-serializable (the BigInt counts from $queryRaw don't leak through)
    expect(() => JSON.stringify(overview)).not.toThrow();
  });

  it('runs the four queries concurrently, not sequentially', async () => {
    await service.getOverview();
    expect(prisma.claim.groupBy).toHaveBeenCalledTimes(1);
    expect(prisma.document.count).toHaveBeenCalledTimes(1);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.claim.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.claimStatusHistory.findMany).toHaveBeenCalledTimes(1);
  });
});
