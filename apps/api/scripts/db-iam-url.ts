/** Prints a DATABASE_URL with a freshly-signed RDS IAM token embedded, for one-off use with
 * the Prisma CLI (`migrate`/`db push`/`studio`) — those connect directly via DATABASE_URL
 * and don't go through src/prisma/rds-iam.ts's per-connection token refresh that the app
 * itself uses. Tokens last ~15 min, so re-run this for each CLI session.
 *
 * Usage: DATABASE_URL=$(npx ts-node scripts/db-iam-url.ts) npx prisma migrate deploy
 */
import { Signer } from '@aws-sdk/rds-signer';

async function main() {
  const hostname = process.env.PGHOST;
  const username = process.env.PGUSER || 'postgres';
  const database = process.env.PGDATABASE || 'postgres';
  const region = process.env.AWS_REGION || 'us-east-1';
  if (!hostname) throw new Error('PGHOST is required');

  const signer = new Signer({ region, hostname, port: 5432, username });
  const token = await signer.getAuthToken();
  const url = `postgresql://${encodeURIComponent(username)}:${encodeURIComponent(token)}@${hostname}:5432/${database}?sslmode=require`;
  process.stdout.write(url);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
