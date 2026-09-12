/**
 * Paginated fetch of grant calls from the palyazat.gov.hu KrakenD API.
 * Canonical source spec (URL, headers, filter vocab) lives on kanban card
 * 411f445f, not only here. Verified 2026-09-11.
 *
 * The HTTP call is injected (`fetchImpl`) so the pagination logic is unit-
 * testable offline with no network.
 */
import { Tender } from './mapTender';

export const TENDERS_LIST_URL = 'https://ginapp-api.fair.gov.hu/papi/tenders/list';
// Static client identifiers baked into the site bundle; not auth, not a session.
export const FAIR_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'application-name': 'FairApp',
  'device-id': '40b0c32c-77fe-4380-9f5e-be96ae24fabd',
};
// Status "Aktív" UUID from /papi/basic-data/all.
export const ACTIVE_STATUS_ID = 'b2111a67-2c8c-49c9-abdc-01ee1abb1814';

export interface TendersPage {
  pagination: { pageIndex: number; pageSize: number; totalCount: number };
  tenders: Tender[];
}

export type FetchImpl = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; json: () => Promise<TendersPage> }>;

export interface FetchOptions {
  fetchImpl: FetchImpl;
  pageSize?: number;
  statusId?: string;
  /** Hard cap so a bad totalCount can never loop forever. */
  maxPages?: number;
}

function buildBody(pageIndex: number, pageSize: number, statusId: string): string {
  return JSON.stringify({
    pagination: { pageSize, pageIndex },
    filtering: { exactFilters: [{ type: 'Status', selected: [statusId] }] },
    sort: { direction: 'asc', field: 'endTime' },
  });
}

/**
 * Fetches every Aktív tender across all pages. Stops when we have collected at
 * least `totalCount` rows, when a page returns no rows, or at `maxPages`.
 * Returns the full list; open/undated filtering and mapping happen downstream.
 */
export async function fetchActiveTenders(opts: FetchOptions): Promise<Tender[]> {
  const pageSize = opts.pageSize ?? 100;
  const statusId = opts.statusId ?? ACTIVE_STATUS_ID;
  const maxPages = opts.maxPages ?? 100;
  const all: Tender[] = [];
  let pageIndex = 0;
  let totalCount = Infinity;
  while (pageIndex < maxPages && all.length < totalCount) {
    const res = await opts.fetchImpl(TENDERS_LIST_URL, {
      method: 'POST',
      headers: FAIR_HEADERS,
      body: buildBody(pageIndex, pageSize, statusId),
    });
    if (!res.ok) {
      throw new Error(`tenders/list HTTP ${res.status} at pageIndex ${pageIndex}`);
    }
    const page = await res.json();
    totalCount = page.pagination?.totalCount ?? all.length;
    const rows = page.tenders ?? [];
    if (rows.length === 0) break;
    all.push(...rows);
    pageIndex++;
  }
  return all;
}
