import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { buildPgPoolConfig } from './rds-iam';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private pool: Pool;

  constructor() {
    const pool = new Pool(buildPgPoolConfig());
    super({ adapter: new PrismaPg(pool) as any });
    this.pool = pool;
  }

  async onModuleInit() {
    // Connectivity isn't verified here — RDS reachability/credentials are a deployment
    // concern, and failing fast on every cold start (including tests that mock this
    // service out entirely) isn't worth it. The first real query surfaces any problem.
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
