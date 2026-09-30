import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AdminController } from '../src/admin/admin.controller';
import { AdminService } from '../src/admin/admin.service';
import { issueDevToken } from '../src/common/dev-jwt';

describe('Admin API (e2e, faked Prisma)', () => {
  let app: INestApplication;
  const overview = {
    claimsByStatus: { AWAITING_REVIEW: 1 },
    totalDocuments: 1,
    exceptionsByType: { missing: 1 },
    failedClaims: [],
    recentActivity: [],
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [{ provide: AdminService, useValue: { getOverview: jest.fn().mockResolvedValue(overview) } }],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const tokenFor = (role: string) => issueDevToken({ sub: 'u', role: role as any });

  it('rejects unauthenticated requests', async () => {
    await request(app.getHttpServer()).get('/admin/overview').expect(401);
  });

  it('allows senior-examiner and auditor', async () => {
    await request(app.getHttpServer()).get('/admin/overview').set('Authorization', `Bearer ${tokenFor('senior-examiner')}`).expect(200);
    await request(app.getHttpServer()).get('/admin/overview').set('Authorization', `Bearer ${tokenFor('auditor')}`).expect(200);
  });

  it('rejects examiner and triage', async () => {
    await request(app.getHttpServer()).get('/admin/overview').set('Authorization', `Bearer ${tokenFor('examiner')}`).expect(403);
    await request(app.getHttpServer()).get('/admin/overview').set('Authorization', `Bearer ${tokenFor('triage')}`).expect(403);
  });
});
