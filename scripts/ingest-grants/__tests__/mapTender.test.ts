import {
  Tender,
  mapTenderToGrant,
  isOpen,
  isKkvRelevant,
  isActiveButUndated,
  hasFutureDeadline,
  buildSourceUrl,
  selectGrantsToIngest,
  planGrantSync,
  loaderCode,
  MIN_ACTIVE_FOR_CLOSING,
  type ExistingGrant,
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

// Card [H2]: the deadline is stored as the Budapest midnight that starts the last day.
describe('deadline normalisation (card [H2])', () => {
  it('a winter date an hour off (Budapest 23:00) becomes the next day midnight, as on the source page', () => {
    // DIMOP_PLUSZ-1.2.3/B1-24: the page says 2029.12.31, endTime came as 2029-12-30T22:00Z
    expect(mapTenderToGrant({ ...bayVoucher, endTime: '2029-12-30T22:00:00.000Z' }).deadline).toBe('2029-12-30T23:00:00.000Z');
  });
  it('a stored Budapest midnight and a real time of day are kept', () => {
    expect(mapTenderToGrant({ ...bayVoucher, endTime: '2026-09-30T22:00:00.000Z' }).deadline).toBe('2026-09-30T22:00:00.000Z');
    expect(mapTenderToGrant({ ...bayVoucher, endTime: '2026-06-30T16:00:00.000Z' }).deadline).toBe('2026-06-30T16:00:00.000Z');
  });
  it('no deadline stays null', () => {
    expect(mapTenderToGrant({ ...bayVoucher, endTime: null }).deadline).toBeNull();
  });
});

// Card [H2]: the loader keeps the rows it loaded in step with the source (deadline extensions, closed calls).
describe('planGrantSync (card [H2])', () => {
  const tender = (code: string, endTime: string | null, status = 'Aktív'): Tender => ({ ...bayVoucher, id: code, code, endTime, status });
  const row = (t: Tender, deadline: string | null, closed: string | null = null): ExistingGrant => ({ source_url: buildSourceUrl(t), deadline, source_closed_at: closed });
  // Enough Aktív filler calls that the list is trusted for closing.
  const filler = Array.from({ length: MIN_ACTIVE_FOR_CLOSING }, (_, i) => tender(`FILL-${i}`, '2027-01-01T23:00:00.000Z'));
  const fillerRows = filler.map((t) => row(t, '2027-01-01T23:00:00.000Z'));

  it('an extended deadline updates the row; an unchanged one is left alone', () => {
    const extended = tender('GINOP_PLUSZ-1.4.3-24', '2027-06-29T22:00:00.000Z');
    const plan = planGrantSync([extended, ...filler], [row(extended, '2026-12-30T23:00:00+00:00'), ...fillerRows], { now: NOW });
    expect(plan.toUpdate).toEqual([{ source_url: buildSourceUrl(extended), deadline: '2027-06-29T22:00:00.000Z', source_closed_at: null }]);
    expect(plan.toInsert).toEqual([]);
    expect(plan.toClose).toEqual([]);
  });

  it('the same instant written another way is not a change', () => {
    const t = tender('SAME-1', '2026-11-29T23:00:00.000Z');
    const plan = planGrantSync([t, ...filler], [row(t, '2026-11-29 23:00:00+00'), ...fillerRows], { now: NOW });
    expect(plan.toUpdate).toEqual([]);
  });

  it('a loaded call missing from the Aktív list is closed; one that comes back is reopened', () => {
    const gone = tender('GINOP_PLUSZ-1.2.1-21', '2027-12-31T23:59:59.000Z');
    const back = tender('BACK-1', '2027-03-01T23:00:00.000Z');
    const plan = planGrantSync([back, ...filler], [row(gone, '2027-12-31T23:59:59+00:00'), row(back, '2027-03-01T23:00:00+00:00', '2026-10-01T00:00:00Z'), ...fillerRows], { now: NOW });
    expect(plan.toClose).toEqual([buildSourceUrl(gone)]);
    expect(plan.toUpdate).toEqual([{ source_url: buildSourceUrl(back), deadline: '2027-03-01T23:00:00.000Z', source_closed_at: null }]);
  });

  it('an already closed row is not closed again', () => {
    const gone = tender('GONE-1', null);
    const plan = planGrantSync(filler, [row(gone, null, '2026-10-20T00:00:00Z'), ...fillerRows], { now: NOW });
    expect(plan.toClose).toEqual([]);
  });

  it('a row the loader did not build (kavosz.hu, a hand seed page) is never closed', () => {
    const others: ExistingGrant[] = [
      { source_url: 'https://www.kavosz.hu/hitelek/szechenyi-mikrohitel-max-plusz/', deadline: null, source_closed_at: null },
      { source_url: 'https://www.palyazat.gov.hu/programok/szechenyi-terv-plusz/ginop-plusz/ginop-plusz-121-21/alapadatok', deadline: null, source_closed_at: null },
    ];
    const plan = planGrantSync(filler, [...others, ...fillerRows], { now: NOW });
    expect(plan.toClose).toEqual([]);
  });

  it('a suspiciously short Aktív list closes nothing', () => {
    const gone = tender('GONE-2', '2027-01-01T23:00:00.000Z');
    const plan = planGrantSync(filler.slice(0, 3), [row(gone, '2027-01-01T23:00:00+00:00'), ...fillerRows], { now: NOW });
    expect(plan.closingSkipped).toBe(true);
    expect(plan.toClose).toEqual([]);
  });

  it('a new open call is still inserted, with the normalised deadline', () => {
    const fresh = tender('NEW-1', '2029-12-30T22:00:00.000Z');
    const plan = planGrantSync([fresh, ...filler], fillerRows, { now: NOW });
    expect(plan.toInsert.map((g) => [g.source_url, g.deadline])).toEqual([[buildSourceUrl(fresh), '2029-12-30T23:00:00.000Z']]);
  });

  it('a renamed programme keeps matching by the call code', () => {
    const t = tender('CODE-1', '2027-05-01T22:00:00.000Z');
    const oldUrl = buildSourceUrl({ ...t, developmentalProgram: 'Régi név' });
    const plan = planGrantSync([t, ...filler], [{ source_url: oldUrl, deadline: '2027-04-01T22:00:00+00:00', source_closed_at: null }, ...fillerRows], { now: NOW });
    expect(plan.toInsert).toEqual([]);
    expect(plan.toUpdate).toEqual([{ source_url: oldUrl, deadline: '2027-05-01T22:00:00.000Z', source_closed_at: null }]);
    expect(loaderCode(oldUrl)).toBe('CODE-1');
  });
});
