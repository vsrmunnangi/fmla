/** packages.id / claim_status_history.id are `bigserial` (§5) -> Prisma returns BigInt,
 * which JSON.stringify can't serialize natively. Neither ID is ever meaningfully exposed
 * to clients (rows are looked up by claimId/version, not this surrogate key), so
 * stringifying is a safe, minimal fix rather than changing the schema's column types.
 * Imported for its side effect — by main.ts for the real app, and by tests that exercise
 * real BigInt serialization (see test/claims.e2e-spec.ts's history test). */
(BigInt.prototype as unknown as { toJSON(): string }).toJSON = function () {
  return this.toString();
};
