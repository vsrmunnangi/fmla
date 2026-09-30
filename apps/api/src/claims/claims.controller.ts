import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { AuthGuard } from '../common/auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { ClaimsService } from './claims.service';
import { TransitionService } from './transition.service';
import { CreateClaimDto } from './dto/create-claim.dto';
import { UploadDocumentDto } from './dto/upload-document.dto';

/** Routes per §8, plus GET :id (not in §8's table — see ClaimsService.getClaim). Every
 * mutation is guarded server-side (AuthGuard + RolesGuard) — the web UI's own disabling of
 * buttons is a courtesy, not the enforcement point. */
@Controller('claims')
@UseGuards(AuthGuard, RolesGuard)
export class ClaimsController {
  constructor(
    private claims: ClaimsService,
    private transitions: TransitionService,
  ) {}

  @Post()
  @Roles('examiner', 'triage')
  createClaim(@Body() dto: CreateClaimDto) {
    return this.claims.createClaim(dto);
  }

  @Post(':id/documents')
  @Roles('examiner', 'triage')
  @UseInterceptors(FileInterceptor('file'))
  uploadDocument(
    @Param('id') id: string,
    @Body() dto: UploadDocumentDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new NotFoundException('no file uploaded (multipart field name: "file")');
    return this.claims.uploadDocument(id, dto.type, file);
  }

  @Get()
  listClaims(@Query('status') status?: string) {
    return this.claims.listClaims(status);
  }

  @Get(':id')
  getClaim(@Param('id') id: string) {
    return this.claims.getClaim(id);
  }

  @Get(':id/package')
  getPackage(@Param('id') id: string) {
    return this.claims.getLatestPackage(id);
  }

  @Post(':id/certify')
  @Roles('examiner', 'senior-examiner')
  certify(@Param('id') id: string, @Req() req: Request) {
    return this.transitions.transition(id, 'CERTIFIED', req.user!);
  }

  @Post(':id/request-info')
  @Roles('examiner', 'senior-examiner')
  requestInfo(@Param('id') id: string, @Req() req: Request) {
    return this.transitions.transition(id, 'MORE_INFO_REQUESTED', req.user!);
  }

  @Post(':id/deny')
  @Roles('examiner', 'senior-examiner')
  deny(@Param('id') id: string, @Req() req: Request) {
    return this.transitions.transition(id, 'DENIED', req.user!);
  }

  @Get(':id/history')
  @Roles('senior-examiner', 'auditor')
  getHistory(@Param('id') id: string) {
    return this.claims.getHistory(id);
  }
}
