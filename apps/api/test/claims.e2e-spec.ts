import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import request from 'supertest';
import { ClaimsController } from '../src/claims/claims.controller';
import { ClaimsService } from '../src/claims/claims.service';
import { TransitionService } from '../src/claims/transition.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { S3Service } from '../src/storage/s3.service';
import { ProcessorClient } from '../src/processor/processor.client';
import { issueDevToken } from '../src/common/dev-jwt';
import '../src/common/bigint-json';

/**
 * Drives the real ClaimsController/ClaimsService/TransitionService stack over HTTP —
 * only Prisma, S3, and the processor HTTP call are faked, since none of those are
 * reachable from this machine yet (no RDS creds, no S3 bucket, see the Phase 2 plan).
 * This proves the RBAC + orchestration wiring, not live persistence.
 */
describe('Claims API (e2e, faked infra)', () => {
  let app: INestApplication;
  let prisma: any;
  let s3: { putObject: jest.Mock };
  let processor: { process: jest.Mock };

  // A tiny stateful stand-in for the claims row, since the upload flow drives the claim
  // through two real transitions (-> PROCESSING -> AWAITING_REVIEW) and each step's guard
  // check needs to see the status the previous step actually wrote.
  let claimRow: { id: string; status: string };

  beforeEach(async () => {
    claimRow = { id: 'FMLA-25-1', status: 'AWAITING_REVIEW' };
    prisma = {
      claim: {
        create: jest.fn().mockResolvedValue({ id: 'FMLA-25-999', status: 'UPLOADED' }),
        findUnique: jest.fn().mockImplementation(() => Promise.resolve({ ...claimRow })),
        update: jest.fn().mockImplementation(({ data }) => {
          claimRow.status = data.status;
          return Promise.resolve({ ...claimRow });
        }),
      },
      // tagged-template call (see ClaimsService.listClaims) — a plain mock fn works as a tag
      $queryRaw: jest.fn().mockImplementation(() => Promise.resolve([{ ...claimRow, openExceptions: 3 }])),
      document: {
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([{ id: 'DOC-1', type: 'WH-380-E', storageKey: 'claims/x/DOC-1.pdf' }]),
      },
      package: {
        findFirst: jest.fn().mockResolvedValue({ package: { claimId: 'FMLA-25-1', status: 'AWAITING_REVIEW' } }),
        create: jest.fn().mockResolvedValue({}),
        aggregate: jest.fn().mockResolvedValue({ _max: { version: 0 } }),
      },
      claimStatusHistory: {
        create: jest.fn().mockResolvedValue({}),
        // id is `bigserial` in real Postgres -> Prisma returns a real BigInt here too, so
        // this catches the "Do not know how to serialize a BigInt" regression (see
        // src/common/bigint-json.ts) instead of a plain-number mock hiding it.
        findMany: jest.fn().mockResolvedValue([
          { id: BigInt(1), claimId: 'FMLA-25-1', actor: 'alice', fromStatus: 'AWAITING_REVIEW', toStatus: 'CERTIFIED', packageVersion: null, at: new Date() },
        ]),
      },
      $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
    };
    s3 = { putObject: jest.fn().mockResolvedValue('s3://bucket/key') };
    processor = { process: jest.fn().mockResolvedValue({ runId: 'RUN-1', claimId: 'FMLA-25-1' }) };

    const moduleRef = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot()],
      controllers: [ClaimsController],
      providers: [
        ClaimsService,
        TransitionService,
        { provide: PrismaService, useValue: prisma },
        { provide: S3Service, useValue: s3 },
        { provide: ProcessorClient, useValue: processor },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const tokenFor = (role: string) => issueDevToken({ sub: 'test-user', role: role as any });

  it('rejects requests with no bearer token', async () => {
    await request(app.getHttpServer()).get('/claims').expect(401);
  });

  it('lets any authenticated role fetch a single claim (for the upload UI, pre-package)', async () => {
    const res = await request(app.getHttpServer())
      .get('/claims/FMLA-25-1')
      .set('Authorization', `Bearer ${tokenFor('triage')}`)
      .expect(200);
    expect(res.body.id).toBe('FMLA-25-1');
  });

  it('404s GET :id for a nonexistent claim', async () => {
    prisma.claim.findUnique.mockResolvedValueOnce(null);
    await request(app.getHttpServer())
      .get('/claims/NOPE')
      .set('Authorization', `Bearer ${tokenFor('triage')}`)
      .expect(404);
  });

  it('lets any authenticated role list claims', async () => {
    await request(app.getHttpServer())
      .get('/claims')
      .set('Authorization', `Bearer ${tokenFor('auditor')}`)
      .expect(200);
  });

  it('lets examiner create a claim', async () => {
    await request(app.getHttpServer())
      .post('/claims')
      .set('Authorization', `Bearer ${tokenFor('examiner')}`)
      .send({ claimant: 'Jordan Rivera', employer: 'Acme Corp', type: 'FMLA' })
      .expect(201);
    expect(prisma.claim.create).toHaveBeenCalled();
  });

  it('creates a Workers-Comp claim too (not just FMLA)', async () => {
    await request(app.getHttpServer())
      .post('/claims')
      .set('Authorization', `Bearer ${tokenFor('examiner')}`)
      .send({ claimant: 'Casey Nguyen', employer: 'Acme Corp', type: 'WORKERS_COMP' })
      .expect(201);
  });

  it('rejects an unknown claim category (400)', async () => {
    await request(app.getHttpServer())
      .post('/claims')
      .set('Authorization', `Bearer ${tokenFor('examiner')}`)
      .send({ claimant: 'Jordan Rivera', employer: 'Acme Corp', type: 'NOT_A_REAL_CATEGORY' })
      .expect(400);
    expect(prisma.claim.create).not.toHaveBeenCalled();
  });

  it('rejects auditor creating a claim (403)', async () => {
    await request(app.getHttpServer())
      .post('/claims')
      .set('Authorization', `Bearer ${tokenFor('auditor')}`)
      .send({ claimant: 'x', employer: 'y', type: 'FMLA' })
      .expect(403);
  });

  it('lets examiner certify an AWAITING_REVIEW claim', async () => {
    await request(app.getHttpServer())
      .post('/claims/FMLA-25-1/certify')
      .set('Authorization', `Bearer ${tokenFor('examiner')}`)
      .expect(201);
    expect(prisma.claim.update).toHaveBeenCalledWith({ where: { id: 'FMLA-25-1' }, data: { status: 'CERTIFIED' } });
  });

  it('rejects triage certifying (403)', async () => {
    await request(app.getHttpServer())
      .post('/claims/FMLA-25-1/certify')
      .set('Authorization', `Bearer ${tokenFor('triage')}`)
      .expect(403);
  });

  it('only senior-examiner/auditor can view history', async () => {
    await request(app.getHttpServer())
      .get('/claims/FMLA-25-1/history')
      .set('Authorization', `Bearer ${tokenFor('examiner')}`)
      .expect(403);

    await request(app.getHttpServer())
      .get('/claims/FMLA-25-1/history')
      .set('Authorization', `Bearer ${tokenFor('auditor')}`)
      .expect(200);
  });

  it('upload -> PROCESSING -> processor call -> AWAITING_REVIEW, package persisted', async () => {
    claimRow.status = 'UPLOADED';
    await request(app.getHttpServer())
      .post('/claims/FMLA-25-1/documents')
      .set('Authorization', `Bearer ${tokenFor('examiner')}`)
      .field('type', 'WH-380-E')
      .attach('file', Buffer.from('%PDF-1.4 fake'), 'doc.pdf')
      .expect(201);

    expect(s3.putObject).toHaveBeenCalled();
    expect(prisma.document.create).toHaveBeenCalled();
    expect(processor.process).toHaveBeenCalledWith(
      expect.objectContaining({ claimId: 'FMLA-25-1', packageVersion: 1 }),
    );
    expect(prisma.package.create).toHaveBeenCalled();
    // two transitions: UPLOADED/MORE_INFO_REQUESTED -> PROCESSING, then -> AWAITING_REVIEW
    expect(prisma.claim.update).toHaveBeenCalledWith({ where: { id: 'FMLA-25-1' }, data: { status: 'PROCESSING' } });
    expect(prisma.claim.update).toHaveBeenCalledWith({ where: { id: 'FMLA-25-1' }, data: { status: 'AWAITING_REVIEW' } });
  });

  it('marks the claim FAILED if the processor call throws', async () => {
    claimRow.status = 'UPLOADED';
    processor.process.mockRejectedValueOnce(new Error('processor down'));

    await request(app.getHttpServer())
      .post('/claims/FMLA-25-1/documents')
      .set('Authorization', `Bearer ${tokenFor('examiner')}`)
      .field('type', 'WH-380-E')
      .attach('file', Buffer.from('%PDF-1.4 fake'), 'doc.pdf')
      .expect(500);

    expect(prisma.claim.update).toHaveBeenCalledWith({ where: { id: 'FMLA-25-1' }, data: { status: 'FAILED' } });
  });
});
