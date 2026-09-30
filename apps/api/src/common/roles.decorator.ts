import { SetMetadata } from '@nestjs/common';
import { Role } from './roles';

export const ROLES_KEY = 'roles';

/** Marks a route as requiring one of the given roles. No decorator = any authenticated user. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
