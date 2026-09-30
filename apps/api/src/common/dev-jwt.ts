import * as jwt from 'jsonwebtoken';
import { Role } from './roles';

/**
 * The dev-JWT-stub allowed by §3's `OIDC_ISSUER=... # or a dev JWT stub`. Swapping to a real
 * OIDC issuer later means replacing `verifyDevToken` with a JWKS-based verifier in
 * AuthGuard — nothing else in the app touches token verification directly.
 */
const SECRET = process.env.DEV_JWT_SECRET || 'dev-only-secret-do-not-use-in-production';

export interface DevTokenClaims {
  sub: string;
  role: Role;
}

export function issueDevToken(claims: DevTokenClaims): string {
  return jwt.sign(claims, SECRET, { expiresIn: '8h' });
}

export function verifyDevToken(token: string): DevTokenClaims {
  const decoded = jwt.verify(token, SECRET);
  if (typeof decoded === 'string' || !decoded.sub || !decoded.role) {
    throw new Error('malformed dev token');
  }
  return { sub: decoded.sub as string, role: decoded.role as Role };
}
