import { generateClaimId } from './claims.service';

describe('generateClaimId', () => {
  it('prefixes by category so a claim ID reflects what it actually is', () => {
    expect(generateClaimId('FMLA')).toMatch(/^FMLA-\d{2}-\d{6}$/);
    expect(generateClaimId('WORKERS_COMP')).toMatch(/^WC-\d{2}-\d{6}$/);
    expect(generateClaimId('ADA')).toMatch(/^ADA-\d{2}-\d{6}$/);
  });

  it('falls back to the raw category key for an unmapped category rather than throwing', () => {
    expect(generateClaimId('SOMETHING_NEW')).toMatch(/^SOMETHING_NEW-\d{2}-\d{6}$/);
  });
});
