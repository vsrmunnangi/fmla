import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { InternalKeyGuard } from './internal-key.guard';
import { ClaimsService } from '../claims/claims.service';

interface CallbackBody {
  packageVersion: number;
  package: Record<string, unknown>;
}

/** POST /internal/claims/:id/package (§8) — the processor's callback for async mode: it
 * returns 202 from the upload call and calls back here once OCR/LLM finish, instead of the
 * synchronous path in ClaimsService.uploadDocument. Not wired up as the default (v1 runs
 * synchronously, per §8), but the finalize step is identical either way. */
@Controller('internal/claims')
@UseGuards(InternalKeyGuard)
export class InternalController {
  constructor(private claims: ClaimsService) {}

  @Post(':id/package')
  receivePackage(@Param('id') id: string, @Body() body: CallbackBody) {
    return this.claims.finalizeProcessedPackage(id, body.packageVersion, body.package);
  }
}
