/** RBAC roles (§6, §8). Enforced server-side on every mutation — the UI mirrors it only. */
export const ROLES = ['examiner', 'senior-examiner', 'triage', 'auditor'] as const;
export type Role = (typeof ROLES)[number];

/** The pseudo-actor for transitions the system itself performs (upload -> PROCESSING,
 * processor result -> AWAITING_REVIEW/FAILED). Never accepted from an HTTP caller's JWT. */
export const SYSTEM_ACTOR = 'system' as const;

export interface AuthedUser {
  id: string;
  role: Role;
}
