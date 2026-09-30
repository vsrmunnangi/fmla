import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../common/auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(AuthGuard, RolesGuard)
export class AdminController {
  constructor(private admin: AdminService) {}

  @Get('overview')
  @Roles('senior-examiner', 'auditor')
  getOverview() {
    return this.admin.getOverview();
  }
}
