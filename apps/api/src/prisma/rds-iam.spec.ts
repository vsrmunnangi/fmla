import { buildPgPoolConfig } from './rds-iam';

jest.mock('@aws-sdk/rds-signer', () => ({
  Signer: jest.fn().mockImplementation(() => ({
    getAuthToken: jest.fn().mockResolvedValue('fake-iam-token'),
  })),
}));

describe('buildPgPoolConfig', () => {
  it('returns a plain connectionString when AWS_RDS_IAM_AUTH is not set', () => {
    const config = buildPgPoolConfig({ DATABASE_URL: 'postgresql://u:p@host:5432/db' } as NodeJS.ProcessEnv);
    expect(config).toEqual({ connectionString: 'postgresql://u:p@host:5432/db' });
  });

  it('throws if DATABASE_URL is missing and IAM auth is off', () => {
    expect(() => buildPgPoolConfig({} as NodeJS.ProcessEnv)).toThrow(/DATABASE_URL/);
  });

  it('builds an IAM-token password function when AWS_RDS_IAM_AUTH=true', async () => {
    const env = {
      AWS_RDS_IAM_AUTH: 'true',
      PGHOST: 'database-1.cluster-xxxx.us-east-1.rds.amazonaws.com',
      PGUSER: 'postgres',
      AWS_REGION: 'us-east-1',
    } as NodeJS.ProcessEnv;

    const config = buildPgPoolConfig(env);
    expect(config.host).toBe(env.PGHOST);
    expect(config.user).toBe('postgres');
    expect(config.database).toBe('postgres'); // default
    expect(typeof config.password).toBe('function');

    const token = await (config.password as () => Promise<string>)();
    expect(token).toBe('fake-iam-token');
  });

  it('throws if PGHOST is missing under IAM auth', () => {
    expect(() =>
      buildPgPoolConfig({ AWS_RDS_IAM_AUTH: 'true', PGUSER: 'postgres' } as NodeJS.ProcessEnv),
    ).toThrow(/PGHOST/);
  });
});
