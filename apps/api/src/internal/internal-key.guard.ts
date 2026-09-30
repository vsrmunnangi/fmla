import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';

/** §8's "internal" role isn't one of the four human RBAC roles (§6) — it's the processor's
 * own callback, authenticated with a shared secret instead of a user JWT. */
@Injectable()
export class InternalKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const key = req.headers['x-internal-key'];
    const expected = process.env.INTERNAL_API_KEY;
    if (!expected) {
      throw new UnauthorizedException('INTERNAL_API_KEY not configured — internal routes disabled');
    }
    if (key !== expected) {
      throw new UnauthorizedException('invalid internal key');
    }
    return true;
  }
}
