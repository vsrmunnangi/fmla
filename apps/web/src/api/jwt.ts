/** Decodes (never verifies) the dev-JWT-stub payload for display + button-disabling only.
 * The server is the actual enforcement point (RolesGuard) — this is UI-mirroring, per §6:
 * "the UI mirrors it only." */
export interface DevTokenPayload {
  sub: string;
  role: string;
}

export function decodeToken(token: string): DevTokenPayload | null {
  try {
    const [, payload] = token.split('.');
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const parsed = JSON.parse(json);
    if (typeof parsed.sub === 'string' && typeof parsed.role === 'string') {
      return { sub: parsed.sub, role: parsed.role };
    }
    return null;
  } catch {
    return null;
  }
}
