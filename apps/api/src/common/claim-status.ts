/** §6 — the claim state machine. */
export const CLAIM_STATUSES = [
  'UPLOADED',
  'PROCESSING',
  'AWAITING_REVIEW',
  'CERTIFIED',
  'MORE_INFO_REQUESTED',
  'DENIED',
  'FAILED',
] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];
