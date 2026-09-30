import { Signer } from '@aws-sdk/rds-signer';
import type { PoolConfig } from 'pg';

/**
 * RDS IAM-token auth (per the connection snippet the user gave us):
 *   aws rds generate-db-auth-token --hostname ... --port 5432 --username postgres --region ...
 * The token is a ~15-minute-lived password, not a fixed secret — a plain `DATABASE_URL` string
 * can't express that, so this builds a `pg.Pool` config whose `password` is a function.
 * node-postgres calls it fresh for every new physical connection, so tokens never go stale.
 *
 * Env-var swap (invariant #6, §3): set `AWS_RDS_IAM_AUTH=true` + `PGHOST`/`PGUSER`/`PGDATABASE`
 * to use this. Leave it unset and just set `DATABASE_URL` for a plain local/CI Postgres.
 */
export function buildPgPoolConfig(env: NodeJS.ProcessEnv = process.env): PoolConfig {
  if (env.AWS_RDS_IAM_AUTH !== 'true') {
    return { connectionString: requireEnv(env, 'DATABASE_URL') };
  }

  const host = requireEnv(env, 'PGHOST');
  const port = Number(env.PGPORT || 5432);
  const user = requireEnv(env, 'PGUSER');
  const database = env.PGDATABASE || 'postgres';
  const region = env.AWS_REGION || 'us-east-1';

  const signer = new Signer({ hostname: host, port, username: user, region });

  return {
    host,
    port,
    user,
    database,
    ssl: { rejectUnauthorized: true },
    password: () => signer.getAuthToken(),
  };
}

function requireEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`missing required env var: ${name}`);
  return value;
}
