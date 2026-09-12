import {
  Tender,
  mapTenderToGrant,
  isOpen,
  isKkvRelevant,
  isActiveButUndated,
  hasFutureDeadline,
  buildSourceUrl,
  selectGrantsToIngest,
} from '../mapTender';

const NOW = new Date('2026-09-15T00:00:00.000Z');

// Real sample (verified 2026-09-11), trimmed to mapped fields.
const bayVoucher: Tender = {
  id: 'd2e978b2-498f-4895-9e2c-cb4389adc477',
  code: '2025-1.1.1-BAY_VOUCHER',
  name: 'KKV-k számára nyújtandó K+F+I szolgáltatások',
  endTime: '2026-09-30T22:00:00.000Z',
  status: 'Aktív',
  minSupportAmount: 50000000,
  maxSupportAmount: 100000000,
  formOfSupport: 'Vissza nem térítendő támogatás (VNT)',
  developmentalProgram: 'Neumann János Program',
  operationalProgram: '',
  supportPurpose: 'Cél szöveg.',
  conditionsOfSupport: 'Feltételek.',
  beneficiaries: ['Mikrovállalkozás', 'kisvállalkozás', 'középvállalkozás'],
};

describe('mapTenderToGrant', () => {
  it('maps the core fields from the source object', () => {
    const g = mapTenderToGrant(bayVoucher);
    expect(g.title).toBe('KKV-k számára nyújtandó K+F+I szolgáltatások');
    expect(g.description).toBe('Cél szöveg.\n\nFeltételek.');
    expect(g.provider).toBe('Neumann János Program');
    expect(g.grant_type).toBe('Vissza nem térítendő támogatás (VNT)');
    expect(g.amount_min).toBe(50000000);
    expect(g.amount_max).toBe(100000000);
    expect(g.deadline).toBe('2026-09-30T22:00:00.000Z');
    expect(g.eligibility_criteria).toBe('Mikrovállalkozás, kisvállalkozás, középvállalkozás');
    expect(g.source_url).toContain('code=2025-1.1.1-BAY_VOUCHER');
  });

  it('does NOT fabricate amounts: 0 (API "not populated") becomes null', () => {
    const g = mapTenderToGrant({ ...bayVoucher, minSupportAmount: 0, maxSupportAmount: 0 });
    expect(g.amount_min).toBeNull();
    expect(g.amount_max).toBeNull();
  });

  it('joins both programs when present', () => {
    const g = mapTenderToGrant({ ...bayVoucher, operationalProgram: 'GINOP_PLUSZ' });
    expect(g.provider).toBe('Neumann János Program / GINOP_PLUSZ');
  });
});

describe('open / KKV / undated classification', () => {
  it('isOpen: Aktív + future deadline', () => {
    expect(isOpen(bayVoucher, NOW)).toBe(true);
  });
  it('isOpen false when deadline is in the past', () => {
    expect(isOpen({ ...bayVoucher, endTime: '2026-09-01T00:00:00.000Z' }, NOW)).toBe(false);
  });
  it('isOpen false when status is not Aktív (e.g. Felfüggesztve)', () => {
    expect(isOpen({ ...bayVoucher, status: 'Felfüggesztve' }, NOW)).toBe(false);
  });
  it('isOpen false when deadline is missing', () => {
    expect(isOpen({ ...bayVoucher, endTime: null }, NOW)).toBe(false);
    expect(hasFutureDeadline({ ...bayVoucher, endTime: undefined }, NOW)).toBe(false);
  });
  it('isKkvRelevant true for mikro/kis/közép, false otherwise', () => {
    expect(isKkvRelevant(bayVoucher)).toBe(true);
    expect(isKkvRelevant({ ...bayVoucher, beneficiaries: ['Költségvetési szerv'] })).toBe(false);
  });
  it('isActiveButUndated flags Aktív calls with no usable deadline (not dropped silently)', () => {
    expect(isActiveButUndated({ ...bayVoucher, endTime: null })).toBe(true);
    expect(isActiveButUndated(bayVoucher)).toBe(false);
  });
  it('buildSourceUrl encodes program/op/code', () => {
    expect(buildSourceUrl(bayVoucher)).toBe(
      'https://www.palyazat.gov.hu/palyazatok/redirect?program=Neumann%20J%C3%A1nos%20Program&op=&code=2025-1.1.1-BAY_VOUCHER',
    );
  });
});

describe('selectGrantsToIngest (open + undated, dedup + filters)', () => {
  const closed: Tender = { ...bayVoucher, id: 'x', code: 'CLOSED-1', status: 'Lezárva' };
  const nonKkv: Tender = { ...bayVoucher, id: 'y', code: 'NONKKV-1', beneficiaries: ['Költségvetési szerv'] };
  const undated: Tender = { ...bayVoucher, id: 'z', code: 'UNDATED-1', endTime: null };
  const stalePast: Tender = { ...bayVoucher, id: 'w', code: 'STALE-1', endTime: '2026-09-01T00:00:00.000Z' };

  it('ingests open + undated-active, dedups existing, drops closed and stale-past', () => {
    const existing = new Set<string>([buildSourceUrl(bayVoucher)]); // already ingested
    const r = selectGrantsToIngest([bayVoucher, closed, nonKkv, undated, stalePast], {
      now: NOW,
      existingSourceUrls: existing,
    });
    const urls = r.toInsert.map((g) => g.source_url).sort();
    expect(urls).toEqual([buildSourceUrl(nonKkv), buildSourceUrl(undated)].sort());
    expect(r.openCount).toBe(1); // nonKkv (open, KKV as tag not filter)
    expect(r.undatedCount).toBe(1); // undated
    expect(r.skippedExisting).toBe(1); // bayVoucher already existed
    // stalePast (Aktív but past deadline) is neither open nor undated -> excluded
    expect(urls).not.toContain(buildSourceUrl(stalePast));
  });

  it('undated-active rows carry deadline=null (the DB distinguisher, not shown as expired)', () => {
    const r = selectGrantsToIngest([undated], { now: NOW, existingSourceUrls: new Set() });
    expect(r.toInsert).toHaveLength(1);
    expect(r.toInsert[0].deadline).toBeNull();
    expect(r.undatedCount).toBe(1);
    expect(r.openCount).toBe(0);
  });

  it('kkvOnly=true excludes non-KKV grants (default is false: KKV is a scored tag)', () => {
    const r = selectGrantsToIngest([bayVoucher, nonKkv], { now: NOW, kkvOnly: true, existingSourceUrls: new Set() });
    expect(r.toInsert.map((g) => g.source_url)).toEqual([buildSourceUrl(bayVoucher)]);
  });

  it('dedups duplicates within the same batch', () => {
    const r = selectGrantsToIngest([bayVoucher, { ...bayVoucher }], { now: NOW, existingSourceUrls: new Set() });
    expect(r.toInsert).toHaveLength(1);
    expect(r.skippedExisting).toBe(1);
  });
});
