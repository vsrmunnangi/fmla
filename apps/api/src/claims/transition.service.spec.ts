import { Test } from '@nestjs/testing';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { TransitionService } from './transition.service';
import { PrismaService } from '../prisma/prisma.service';

describe('TransitionService (§6 guarded transitions)', () => {
  let service: TransitionService;
  let prisma: {
    claim: { findUnique: jest.Mock; update: jest.Mock };
    claimStatusHistory: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let events: EventEmitter2;

  const claim = (status: string) => ({ id: 'FMLA-25-1', status });

  beforeEach(async () => {
    prisma = {
      claim: { findUnique: jest.fn(), update: jest.fn() },
      claimStatusHistory: { create: jest.fn() },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot()],
      providers: [
        TransitionService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(TransitionService);
    events = moduleRef.get(EventEmitter2);
  });

  it('allows examiner to certify from AWAITING_REVIEW', async () => {
    prisma.claim.findUnique.mockResolvedValue(claim('AWAITING_REVIEW'));
    prisma.claim.update.mockResolvedValue(claim('CERTIFIED'));

    const emitSpy = jest.spyOn(events, 'emit');
    await service.transition('FMLA-25-1', 'CERTIFIED', { id: 'u1', role: 'examiner' });

    expect(prisma.claim.update).toHaveBeenCalledWith({
      where: { id: 'FMLA-25-1' },
      data: { status: 'CERTIFIED' },
    });
    expect(prisma.claimStatusHistory.create).toHaveBeenCalledWith({
      data: { claimId: 'FMLA-25-1', actor: 'u1', fromStatus: 'AWAITING_REVIEW', toStatus: 'CERTIFIED', packageVersion: null },
    });
    expect(emitSpy).toHaveBeenCalledWith('claim.status-changed', { claimId: 'FMLA-25-1', status: 'CERTIFIED' });
  });

  it('rejects triage attempting to certify (role not permitted)', async () => {
    prisma.claim.findUnique.mockResolvedValue(claim('AWAITING_REVIEW'));
    await expect(
      service.transition('FMLA-25-1', 'CERTIFIED', { id: 'u2', role: 'triage' }),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.claim.update).not.toHaveBeenCalled();
  });

  it('rejects an illegal from->to pair regardless of role', async () => {
    prisma.claim.findUnique.mockResolvedValue(claim('UPLOADED'));
    await expect(
      service.transition('FMLA-25-1', 'CERTIFIED', { id: 'u1', role: 'senior-examiner' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a human actor for a system-only transition', async () => {
    prisma.claim.findUnique.mockResolvedValue(claim('UPLOADED'));
    await expect(
      service.transition('FMLA-25-1', 'PROCESSING', { id: 'u1', role: 'examiner' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows system to move UPLOADED -> PROCESSING', async () => {
    prisma.claim.findUnique.mockResolvedValue(claim('UPLOADED'));
    prisma.claim.update.mockResolvedValue(claim('PROCESSING'));
    await service.transition('FMLA-25-1', 'PROCESSING', { id: 'system', role: 'system' });
    expect(prisma.claim.update).toHaveBeenCalled();
  });

  it('allows retry FAILED -> PROCESSING for system', async () => {
    prisma.claim.findUnique.mockResolvedValue(claim('FAILED'));
    prisma.claim.update.mockResolvedValue(claim('PROCESSING'));
    await service.transition('FMLA-25-1', 'PROCESSING', { id: 'system', role: 'system' });
    expect(prisma.claim.update).toHaveBeenCalled();
  });

  it('throws NotFoundException for a nonexistent claim', async () => {
    prisma.claim.findUnique.mockResolvedValue(null);
    await expect(
      service.transition('NOPE', 'CERTIFIED', { id: 'u1', role: 'examiner' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('senior-examiner can also certify', async () => {
    prisma.claim.findUnique.mockResolvedValue(claim('AWAITING_REVIEW'));
    prisma.claim.update.mockResolvedValue(claim('CERTIFIED'));
    await service.transition('FMLA-25-1', 'CERTIFIED', { id: 'u3', role: 'senior-examiner' });
    expect(prisma.claim.update).toHaveBeenCalled();
  });

  it('auditor cannot certify (read-only role)', async () => {
    prisma.claim.findUnique.mockResolvedValue(claim('AWAITING_REVIEW'));
    await expect(
      service.transition('FMLA-25-1', 'CERTIFIED', { id: 'u4', role: 'auditor' }),
    ).rejects.toThrow(ForbiddenException);
  });
});
