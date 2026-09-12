import { fetchActiveTenders, FetchImpl, TENDERS_LIST_URL, ACTIVE_STATUS_ID } from '../fetchTenders';
import { Tender } from '../mapTender';

function tender(code: string): Tender {
  return { id: code, code, name: code, status: 'Aktív', endTime: '2026-12-01T00:00:00.000Z' };
}

/** Fake API: `total` rows split into pages of `pageSize`. Records the requests. */
function fakeApi(total: number, calls: any[] = []): FetchImpl {
  return async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    const { pageIndex, pageSize } = JSON.parse(init.body).pagination;
    const start = pageIndex * pageSize;
    const tenders = Array.from({ length: Math.max(0, Math.min(pageSize, total - start)) }, (_, i) =>
      tender(`T${start + i}`),
    );
    return { ok: true, status: 200, json: async () => ({ pagination: { pageIndex, pageSize, totalCount: total }, tenders }) };
  };
}

describe('fetchActiveTenders', () => {
  it('paginates until totalCount is reached and returns every row', async () => {
    const calls: any[] = [];
    const rows = await fetchActiveTenders({ fetchImpl: fakeApi(250, calls), pageSize: 100 });
    expect(rows).toHaveLength(250);
    expect(calls).toHaveLength(3); // 100 + 100 + 50
    expect(calls[0].url).toBe(TENDERS_LIST_URL);
    // sends the Aktív status filter
    expect(calls[0].body.filtering.exactFilters[0]).toEqual({ type: 'Status', selected: [ACTIVE_STATUS_ID] });
    expect(calls[0].body.pagination).toEqual({ pageSize: 100, pageIndex: 0 });
    expect(calls[2].body.pagination.pageIndex).toBe(2);
  });

  it('stops on an empty page even if totalCount is overstated', async () => {
    const api: FetchImpl = async (_u, init) => {
      const { pageIndex } = JSON.parse(init.body).pagination;
      const tenders = pageIndex === 0 ? [tender('A')] : [];
      return { ok: true, status: 200, json: async () => ({ pagination: { pageIndex, pageSize: 100, totalCount: 9999 }, tenders }) };
    };
    const rows = await fetchActiveTenders({ fetchImpl: api, pageSize: 100 });
    expect(rows).toHaveLength(1);
  });

  it('never loops past maxPages', async () => {
    const calls: any[] = [];
    await fetchActiveTenders({ fetchImpl: fakeApi(100000, calls), pageSize: 100, maxPages: 3 });
    expect(calls).toHaveLength(3);
  });

  it('throws on a non-ok response', async () => {
    const api: FetchImpl = async () => ({ ok: false, status: 503, json: async () => ({} as any) });
    await expect(fetchActiveTenders({ fetchImpl: api })).rejects.toThrow('HTTP 503');
  });
});
