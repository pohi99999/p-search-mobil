// Card [G]/[G2]: the event names, their typed meta and the pure helpers, with no Supabase or native import, so tests
// and any module can use them without loading the client. The sending lives in events.ts.
// chat_daily_limit: the free daily chat cap ([L]); it was recorded as 'network' before (Brunella 4790).
export type ErrorCode = 'daily_limit' | 'chat_daily_limit' | 'pro_required' | 'gemini_quota' | 'gemini_busy' | 'network' | 'server';
/** Where the paywall was opened from ([G2]: grant_detail is the Pro offer under the free detail view). */
export type PaywallSource = 'home_limit' | 'action_plan' | 'settings' | 'document' | 'grant_detail' | 'other';
export type ScoreBand = '40-59' | '60-79' | '80-100';
export type MatchFeedback = 'useful' | 'not_relevant';

type ProfileFlags = {
  has_goals: boolean;
  has_industry: boolean;
  has_revenue: boolean;
  has_employees: boolean;
  has_tax_number: boolean;
};
export type MatchRef = { match_id: string; grant_id: string; rank: number; score_band: ScoreBand };

export interface EventMeta {
  app_open: Record<string, never>;
  onboarding_done: ProfileFlags;
  profile_updated: ProfileFlags;
  search_start: { trigger: 'manual' | 'after_onboarding' };
  search_result: {
    ok: boolean;
    matches_found?: number;
    candidates_considered?: number;
    duration_ms: number;
    error_code?: ErrorCode;
    search_refunded?: boolean;
  };
  match_list_view: { n_total: number; n_stale: number; n_expired: number };
  match_open: MatchRef;
  match_feedback: MatchRef & { value: MatchFeedback };
  source_link_open: { grant_id: string };
  plan_created: { match_id: string; n_tasks: number };
  task_status_change: { to: string };
  doc_generated: { ok: boolean; error_code?: ErrorCode };
  chat_message_sent: { ok: boolean; error_code?: ErrorCode };
  paywall_view: { source: PaywallSource };
  purchase_done: { package: string };
  daily_limit_hit: Record<string, never>;
  document_uploaded: { ok: boolean };
}
export type AppEvent = keyof EventMeta;

export const ALLOWED_KEYS = new Set([
  'has_goals', 'has_industry', 'has_revenue', 'has_employees', 'has_tax_number',
  'trigger', 'ok', 'matches_found', 'candidates_considered', 'duration_ms', 'error_code',
  'search_refunded', 'n_total', 'n_stale', 'n_expired', 'match_id', 'grant_id', 'rank',
  'score_band', 'value', 'n_tasks', 'to', 'source', 'package',
]);
/** The database refuses longer strings (app_event_meta_ok), so they are dropped here rather than losing the event. */
const MAX_STRING = 40;

/** Only whitelisted keys with short scalar values survive; anything else is dropped, never sent. */
export function sanitizeMeta(meta: Record<string, unknown>): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (!ALLOWED_KEYS.has(key)) continue;
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
    else if (typeof value === 'boolean') out[key] = value;
    else if (typeof value === 'string' && value.length <= MAX_STRING) out[key] = value;
  }
  return out;
}

/** [G2]: which profile fields are filled, as yes/no only (never the values themselves). */
export function profileFlags(p: {
  goals?: string | null; industry_code?: string | null; yearly_revenue?: number | null;
  employee_count?: number | null; tax_number?: string | null;
}): ProfileFlags {
  const filled = (v: unknown) => (typeof v === 'string' ? v.trim().length > 0 : v !== null && v !== undefined);
  return {
    has_goals: filled(p.goals),
    has_industry: filled(p.industry_code),
    has_revenue: filled(p.yearly_revenue),
    has_employees: filled(p.employee_count),
    has_tax_number: filled(p.tax_number),
  };
}

/** [G2]: an error reduced to a code (never its text): the server's code when it sent one, else server/network. */
export function errorCode(err: unknown, serverCode?: string | null): ErrorCode {
  const known: ErrorCode[] = ['daily_limit', 'pro_required', 'gemini_quota', 'gemini_busy'];
  if (serverCode && (known as string[]).includes(serverCode)) return serverCode as ErrorCode;
  const status = (err as { context?: { status?: number } } | null)?.context?.status;
  return status ? 'server' : 'network';
}

export function scoreBand(score: number): ScoreBand {
  return score >= 80 ? '80-100' : score >= 60 ? '60-79' : '40-59';
}
