/** One-off connectivity check — not part of the app. Confirms whether this machine can
 * actually sign an RDS IAM auth token and connect, using the SDK already in package.json
 * (@aws-sdk/rds-signer + pg), not the legacy aws-sdk v2.
 *
 * Usage: npx ts-node scripts/test-rds-connection.ts
 */
import { Client } from 'pg';
import { Signer } from '@aws-sdk/rds-signer';

const hostname = 'database-1.cluster-cwbiogmiko17.us-east-1.rds.amazonaws.com';

async function main() {
  const signer = new Signer({ region: 'us-east-1', hostname, port: 5432, username: 'postgres' });
  console.log('signing IAM auth token...');
  const password = await signer.getAuthToken();
  console.log('token signed OK, length', password.length);

  const client = new Client({
    host: hostname,
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password,
    ssl: { rejectUnauthorized: false },
  });

  console.log('connecting...');
  await client.connect();
  const res = await client.query('SELECT version()');
  console.log(res.rows[0].version);
  await client.end();
}

main().catch((err) => {
  console.error('FAILED at:', err?.name, '-', err?.message);
  process.exit(1);
});
