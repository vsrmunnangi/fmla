import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

function contextWithUser(user: { id: string; role: string } | undefined, handlerRoles: string[] | undefined) {
  const reflector = { getAllAndOverride: () => handlerRoles } as unknown as Reflector;
  const guard = new RolesGuard(reflector);
  const context = {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
  return { guard, context };
}

describe('RolesGuard', () => {
  it('allows any authenticated role when no @Roles() is set', () => {
    const { guard, context } = contextWithUser({ id: 'u1', role: 'auditor' }, undefined);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows a user whose role is in the required list', () => {
    const { guard, context } = contextWithUser({ id: 'u1', role: 'examiner' }, ['examiner', 'senior-examiner']);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects a user whose role is not in the required list', () => {
    const { guard, context } = contextWithUser({ id: 'u1', role: 'triage' }, ['examiner', 'senior-examiner']);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('rejects when there is no user at all', () => {
    const { guard, context } = contextWithUser(undefined, ['examiner']);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
