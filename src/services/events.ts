// Card [G] (review 2026-10-25, spec: Irisz, irisz-G-esemenyek.md): usage events for the closed test.
// Fire-and-forget: a lost event is a smaller harm than a blocked user action or a retry loop, so every failure
// ends in a logger.warn and nothing is thrown or awaited by the caller. The meta of each event is typed, and
// sanitizeMeta drops any key outside the whitelist at run time too; the database enforces the same list
// (supabase/migrations/20261025120000_app_events_and_match_feedback.sql).
import { Platform } from 'react-native';
import * as Application from 'expo-application';
import { supabase } from '../lib/supabase';
import { logger } from '../utils/logger';

export type ErrorCode = 'daily_limit' | 'pro_required' | 'gemini_quota' | 'gemini_busy' | 'network' | 'server';
export type ScoreBand = '40-59' | '60-79' | '80-100';
export type MatchFeedback = 'useful' | 'not_relevant';

type ProfileFlags = {
  has_goals: boolean;
  has_industry: boolean;
  has_revenue: boolean;
  has_employees: boolean;
  has_tax_number: boolean;
};
type MatchRef = { match_id: string; grant_id: string; rank: number; score_band: ScoreBand };

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
  paywall_view: { source: 'home_limit' | 'action_plan' | 'settings' | 'document' };
  purchase_done: { package: string };
  daily_limit_hit: Record<string, never>;
  document_uploaded: { ok: boolean };
}
export type AppEvent = keyof EventMeta;

const ALLOWED_KEYS = new Set([
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

export function scoreBand(score: number): ScoreBand {
  return score >= 80 ? '80-100' : score >= 60 ? '60-79' : '40-59';
}

function platformName(): 'android' | 'ios' | 'web' | null {
  return Platform.OS === 'android' || Platform.OS === 'ios' || Platform.OS === 'web' ? Platform.OS : null;
}

async function send(event: AppEvent, meta: Record<string, unknown>): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    const version = Application.nativeApplicationVersion;
    const build = Application.nativeBuildVersion;
    const { error } = await supabase.from('app_events').insert({
      user_id: session.user.id,
      event,
      meta: sanitizeMeta(meta),
      platform: platformName(),
      app_version: version ? (build ? `${version} (${build})` : version).slice(0, 32) : null,
    });
    if (error) throw error;
  } catch (e) {
    logger.warn(`app event ${event} not recorded:`, e);
  }
}

/** Records one usage event. Never throws and the caller never waits for it. */
export function track<E extends AppEvent>(event: E, ...meta: EventMeta[E] extends Record<string, never> ? [] : [EventMeta[E]]): void {
  void send(event, (meta[0] ?? {}) as Record<string, unknown>);
}

/**
 * Writes the "Hasznos / Nem releváns" feedback on an own match (null clears it) through the set_match_feedback
 * RPC, and records the match_feedback event. Unlike track, this one reports failure: the button shows it.
 */
export async function setMatchFeedback(match: MatchRef, value: MatchFeedback | null): Promise<void> {
  const { error } = await supabase.rpc('set_match_feedback', { p_match_id: match.match_id, p_value: value });
  if (error) throw error;
  if (value) track('match_feedback', { ...match, value });
}
