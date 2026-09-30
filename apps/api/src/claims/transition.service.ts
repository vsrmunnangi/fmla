import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { ClaimStatus } from '../common/claim-status';
import { Role, SYSTEM_ACTOR } from '../common/roles';

export type TransitionActor =
  | { id: string; role: Role }
  | { id: typeof SYSTEM_ACTOR; role: typeof SYSTEM_ACTOR };

interface TransitionRule {
  from: ClaimStatus[];
  to: ClaimStatus;
  allowedRoles: 'system' | Role[];
}

/** §6's transition table, verbatim. The only place "what's a legal move" is decided. */
const TRANSITIONS: TransitionRule[] = [
  { from: ['UPLOADED', 'MORE_INFO_REQUESTED'], to: 'PROCESSING', allowedRoles: 'system' },
  { from: ['PROCESSING'], to: 'AWAITING_REVIEW', allowedRoles: 'system' },
  { from: ['PROCESSING'], to: 'FAILED', allowedRoles: 'system' },
  { from: ['FAILED'], to: 'PROCESSING', allowedRoles: 'system' },
  { from: ['AWAITING_REVIEW'], to: 'CERTIFIED', allowedRoles: ['examiner', 'senior-examiner'] },
  { from: ['AWAITING_REVIEW'], to: 'MORE_INFO_REQUESTED', allowedRoles: ['examiner', 'senior-examiner'] },
  { from: ['AWAITING_REVIEW'], to: 'DENIED', allowedRoles: ['examiner', 'senior-examiner'] },
];

/**
 * The one guarded transition service (§6): every claim-status change in the system goes
 * through `transition()`. It rejects any (from, to) pair not in TRANSITIONS, rejects an
 * actor whose role isn't permitted for that move, and writes a claim_status_history row for
 * every successful transition — that append-only history is the audit trail (invariant #3).
 */
@Injectable()
export class TransitionService {
  constructor(
    private prisma: PrismaService,
    private events: EventEmitter2,
  ) {}

  async transition(
    claimId: string,
    to: ClaimStatus,
    actor: TransitionActor,
    packageVersion?: number,
  ) {
    const claim = await this.prisma.claim.findUnique({ where: { id: claimId } });
    if (!claim) throw new NotFoundException(`no such claim: ${claimId}`);

    const from = claim.status as ClaimStatus;
    const rule = TRANSITIONS.find((r) => r.to === to && r.from.includes(from));
    if (!rule) {
      throw new BadRequestException(`illegal transition: ${from} -> ${to}`);
    }

    const roleOk =
      rule.allowedRoles === 'system'
        ? actor.role === SYSTEM_ACTOR
        : actor.role !== SYSTEM_ACTOR && rule.allowedRoles.includes(actor.role);
    if (!roleOk) {
      throw new ForbiddenException(
        `actor role '${actor.role}' cannot perform ${from} -> ${to} (needs: ${
          rule.allowedRoles === 'system' ? 'system' : rule.allowedRoles.join(', ')
        })`,
      );
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.claim.update({ where: { id: claimId }, data: { status: to } }),
      this.prisma.claimStatusHistory.create({
        data: {
          claimId,
          actor: actor.id,
          fromStatus: from,
          toStatus: to,
          packageVersion: packageVersion ?? null,
        },
      }),
    ]);

    // Fire-and-forget — WS push is a convenience, not a correctness requirement; a client
    // that misses it still sees the right status on its next GET /claims/:id/package poll.
    this.events.emit('claim.status-changed', { claimId, status: to });

    return updated;
  }
}
