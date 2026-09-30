import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { verifyDevToken } from './dev-jwt';
import { AuthedUser } from './roles';

declare module 'express' {
  interface Request {
    user?: AuthedUser;
  }
}

/** Every route needs a valid bearer token; RolesGuard (runs after this) checks the role. */
@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('missing bearer token');
    }
    try {
      const claims = verifyDevToken(header.slice('Bearer '.length));
      req.user = { id: claims.sub, role: claims.role };
      return true;
    } catch {
      throw new UnauthorizedException('invalid token');
    }
  }
}
