import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ROLES_KEY } from './roles.decorator';
import { Role } from './roles';

/** Runs after AuthGuard. No @Roles() on the handler = any authenticated role passes. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<Request>();
    if (!req.user || !required.includes(req.user.role)) {
      throw new ForbiddenException(
        `role '${req.user?.role}' cannot perform this action (needs one of: ${required.join(', ')})`,
      );
    }
    return true;
  }
}
