import { packageLabel, packageDescription } from '../packageLabel';

const RAW_STORE_TITLE = 'P-Search Pro (com.pohankaestarsa.psearch (unreviewed))';

describe('packageLabel', () => {
  it('names the monthly and annual packages from the package type, not the store title', () => {
    expect(packageLabel({ packageType: 'MONTHLY', identifier: '$rc_monthly' } as any)).toBe('P-Search Pro havi');
    expect(packageLabel({ packageType: 'ANNUAL', identifier: '$rc_annual' } as any)).toBe('P-Search Pro éves');
  });

  it('falls back to the bare brand for unknown package types', () => {
    expect(packageLabel({ packageType: 'CUSTOM', identifier: 'x' } as any)).toBe('P-Search Pro');
    expect(packageLabel({ packageType: 'UNKNOWN', identifier: 'x' } as any)).toBe('P-Search Pro');
  });

  it('never echoes the raw store title', () => {
    const pkg = { packageType: 'MONTHLY', identifier: '$rc_monthly', product: { title: RAW_STORE_TITLE } } as any;
    expect(packageLabel(pkg)).not.toContain('com.pohankaestarsa');
    expect(packageDescription(pkg)).not.toContain('com.pohankaestarsa');
  });

  it('describes the renewal cadence per type', () => {
    expect(packageDescription({ packageType: 'MONTHLY', identifier: 'm' } as any)).toMatch(/Havonta/);
    expect(packageDescription({ packageType: 'ANNUAL', identifier: 'a' } as any)).toMatch(/Évente/);
    expect(packageDescription({ packageType: 'CUSTOM', identifier: 'c' } as any)).toMatch(/Pro funkcióhoz/);
  });
});
