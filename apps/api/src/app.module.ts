import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { PrismaModule } from './prisma/prisma.module';
import { ClaimsModule } from './claims/claims.module';
import { AdminModule } from './admin/admin.module';
import { CategoriesController } from './common/categories.controller';

@Module({
  imports: [EventEmitterModule.forRoot(), PrismaModule, ClaimsModule, AdminModule],
  controllers: [CategoriesController],
})
export class AppModule {}
