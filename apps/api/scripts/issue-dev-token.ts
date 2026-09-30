/** Dev-only helper for the JWT stub (§3's "or a dev JWT stub"). Not an HTTP endpoint —
 * deliberately not exposed on the API surface, since minting arbitrary roles is a dev
 * convenience, not something a real client should ever be able to call.
 *
 * Usage: npx ts-node scripts/issue-dev-token.ts <sub> <role>
 *   npx ts-node scripts/issue-dev-token.ts alice examiner
 */
import { issueDevToken } from '../src/common/dev-jwt';
import { ROLES } from '../src/common/roles';

const [sub, role] = process.argv.slice(2);
if (!sub || !(ROLES as readonly string[]).includes(role)) {
  console.error(`usage: issue-dev-token.ts <sub> <role>\n  role must be one of: ${ROLES.join(', ')}`);
  process.exit(1);
}

console.log(issueDevToken({ sub, role: role as (typeof ROLES)[number] }));
