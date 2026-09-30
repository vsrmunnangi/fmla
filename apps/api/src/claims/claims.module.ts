import { Module } from '@nestjs/common';
import { ClaimsController } from './claims.controller';
import { ClaimsService } from './claims.service';
import { TransitionService } from './transition.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ProcessorClient } from '../processor/processor.client';
import { S3Service } from '../storage/s3.service';
import { ClaimsGateway } from '../ws/claims.gateway';
import { InternalController } from '../internal/internal.controller';

@Module({
  imports: [PrismaModule],
  controllers: [ClaimsController, InternalController],
  providers: [ClaimsService, TransitionService, ProcessorClient, S3Service, ClaimsGateway],
  exports: [TransitionService],
})
export class ClaimsModule {}
