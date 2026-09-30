import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../storage/s3.service';
import { ProcessorClient } from '../processor/processor.client';
import { TransitionService } from './transition.service';
import { SYSTEM_ACTOR } from '../common/roles';
import { CreateClaimDto } from './dto/create-claim.dto';

// Short, readable prefix per category so a claim ID reflects what it actually is (a
// Workers'-Comp claim getting an "FMLA-" id would be actively misleading now that the
// system handles more than one category — see categories.ts).
const CLAIM_ID_PREFIX: Record<string, string> = {
  FMLA: 'FMLA',
  WORKERS_COMP: 'WC',
  ADA: 'ADA',
};

// Simple and not collision-proof — good enough for a v1 scaffold with no live traffic yet.
// A real deployment should back this with a DB sequence. Exported for direct unit testing
// (see generate-claim-id.spec.ts) rather than only indirectly through a mocked e2e create.
export function generateClaimId(category: string): string {
  const prefix = CLAIM_ID_PREFIX[category] ?? category;
  const yy = String(new Date().getFullYear()).slice(-2);
  const seq = Math.floor(100000 + Math.random() * 900000);
  return `${prefix}-${yy}-${seq}`;
}

function generateDocId(): string {
  return `DOC-${randomUUID().slice(0, 8).toUpperCase()}`;
}

export interface ClaimListRow {
  id: string;
  claimant: string;
  employer: string;
  type: string;
  leaveType: string | null;
  status: string;
  assignee: string | null;
  updatedAt: Date;
  openExceptions: number | null;
}

@Injectable()
export class ClaimsService {
  constructor(
    private prisma: PrismaService,
    private s3: S3Service,
    private processor: ProcessorClient,
    private transitions: TransitionService,
  ) {}

  async createClaim(dto: CreateClaimDto) {
    return this.prisma.claim.create({
      data: {
        id: generateClaimId(dto.type),
        claimant: dto.claimant,
        employer: dto.employer,
        type: dto.type,
        leaveType: dto.leaveType,
        status: 'UPLOADED',
      },
    });
  }

  /** Not in §8's route table, but a natural, low-risk completion of the `claims` resource —
   * the web upload UI needs claim details (claimant/employer/status) before a package
   * exists yet (i.e. before the first document is uploaded and GET .../package has
   * anything to return). */
  async getClaim(claimId: string) {
    const claim = await this.prisma.claim.findUnique({ where: { id: claimId } });
    if (!claim) throw new NotFoundException(`no such claim: ${claimId}`);
    return claim;
  }

  /** §9's console needs an open-exception count per row, which isn't a `claims` column
   * (§5) — it's a join against each claim's latest package. Raw SQL because Prisma's
   * query builder can't express "latest package per claim" + a JSONB array length in one
   * round trip without an N+1. */
  async listClaims(status?: string): Promise<ClaimListRow[]> {
    const where = status ? Prisma.sql`WHERE c.status = ${status}` : Prisma.empty;
    return this.prisma.$queryRaw<ClaimListRow[]>`
      SELECT
        c.id, c.claimant, c.employer, c.type, c.leave_type AS "leaveType",
        c.status, c.assignee, c.updated_at AS "updatedAt",
        (
          SELECT jsonb_array_length(p.package -> 'exceptions')
          FROM packages p
          WHERE p.claim_id = c.id
          ORDER BY p.version DESC
          LIMIT 1
        ) AS "openExceptions"
      FROM claims c
      ${where}
      ORDER BY c.status ASC, c.updated_at DESC
    `;
  }

  async getLatestPackage(claimId: string) {
    const pkg = await this.prisma.package.findFirst({
      where: { claimId },
      orderBy: { version: 'desc' },
    });
    if (!pkg) throw new NotFoundException(`no package for claim ${claimId} yet`);
    return pkg.package;
  }

  async getHistory(claimId: string) {
    return this.prisma.claimStatusHistory.findMany({
      where: { claimId },
      orderBy: { at: 'asc' },
    });
  }

  /**
   * POST /claims/:id/documents (§8): store the blob, record the document, transition to
   * PROCESSING, call the processor synchronously (v1 — §8 allows an async/callback mode
   * later for high-latency OCR/LLM runs, wired via the internal controller's same
   * finalizeProcessedPackage path), and land the claim in AWAITING_REVIEW or FAILED.
   */
  async uploadDocument(claimId: string, docType: string, file: Express.Multer.File) {
    const claim = await this.prisma.claim.findUnique({ where: { id: claimId } });
    if (!claim) throw new NotFoundException(`no such claim: ${claimId}`);

    const docId = generateDocId();
    const key = `claims/${claimId}/${docId}.pdf`;
    // storageKey must be the full s3:// URI, not the bare key — that's what
    // extract.py's resolve_document (services/processor) pattern-matches on.
    const storageKey = await this.s3.putObject(key, file.buffer, file.mimetype);

    await this.prisma.document.create({
      data: { id: docId, claimId, type: docType, storageKey, receivedAt: new Date() },
    });

    await this.transitions.transition(claimId, 'PROCESSING', { id: SYSTEM_ACTOR, role: SYSTEM_ACTOR });

    const documents = await this.prisma.document.findMany({ where: { claimId } });
    const nextVersion =
      ((
        await this.prisma.package.aggregate({ where: { claimId }, _max: { version: true } })
      )._max.version ?? 0) + 1;

    try {
      const pkg = await this.processor.process({
        claimId,
        documents: documents.map((d) => ({ docId: d.id, type: d.type, storageKey: d.storageKey })),
        packageVersion: nextVersion,
        // `claim` (claimant/employer/leaveYear/fmlaBalance) intentionally omitted: the
        // `claims` table (§5) doesn't carry leaveYear/fmlaBalance yet, so we'd only ever be
        // able to send a half-populated ClaimSummary. processor's default_claim_summary
        // fallback fills in the whole block instead — see services/processor/assemble/package.py.
      });
      await this.finalizeProcessedPackage(claimId, nextVersion, pkg);
      return { claimId, docId, packageVersion: nextVersion };
    } catch (err) {
      await this.transitions.transition(claimId, 'FAILED', { id: SYSTEM_ACTOR, role: SYSTEM_ACTOR });
      throw err;
    }
  }

  /** Shared by the synchronous upload path above and the async processor-callback route
   * (POST /internal/claims/:id/package, §8) — persist the package as a new version, then
   * transition to AWAITING_REVIEW. */
  async finalizeProcessedPackage(claimId: string, version: number, pkg: Record<string, unknown>) {
    await this.prisma.package.create({
      data: { claimId, version, runId: pkg.runId as string, package: pkg as any },
    });
    await this.transitions.transition(
      claimId,
      'AWAITING_REVIEW',
      { id: SYSTEM_ACTOR, role: SYSTEM_ACTOR },
      version,
    );
  }
}
