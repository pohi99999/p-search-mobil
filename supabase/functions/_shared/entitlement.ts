// Shared Pro/entitlement helpers for the edge functions.
// Source of truth for Pro status is profiles.subscription_tier ('free' | 'pro'),
// written by the RevenueCat webhook. The generate-* functions gate on isPro();
// match-grants applies the free daily cap only to non-Pro users.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const PRO_TIER = 'pro';
/**
 * The free/Pro line, owner decision 2026-11-21 (Péter GO 17591, synthesis of the 11-21 round): free = 3 AI searches a
 * day, weekly automatic scan, at most 3 followed grants (client side), 5 Copilot messages a day; Pro = unlimited
 * search, daily scan, action plan, document. Before it the free caps were 20 / 20, so "unlimited search" was no
 * difference. Both caps are parameters of the consume_daily_* RPCs (p_cap), so no migration is needed.
 */
export const FREE_DAILY_SEARCH_CAP = 3;
/** Card [L]: free Copilot chat messages per day (5 since 2026-11-21, see above). */
export const FREE_DAILY_CHAT_CAP = 5;

/** The automatic scan's cadences (profiles.search_frequency). */
export type ScanFrequency = 'daily' | 'weekly' | 'manual';

/**
 * Pure: the cadence the scheduled scan really uses. The daily scan is Pro (2026-11-21); a free account that has
 * 'daily' stored (chosen before the line, or written past the app) is scanned weekly. Anything unknown is weekly,
 * the column's default; 'manual' stays manual for everyone.
 */
export function effectiveScanFrequency(tier: string | null | undefined, frequency: string | null | undefined): ScanFrequency {
  if (frequency === 'manual') return 'manual';
  if (frequency === 'daily' && isPro(tier)) return 'daily';
  return 'weekly';
}

/** Pure: is this subscription tier Pro? Anything not exactly 'pro' is free. */
export function isPro(tier: string | null | undefined): boolean {
  return tier === PRO_TIER;
}

/** Reads profiles.subscription_tier for a user; returns 'free' on any miss/error. */
export async function getSubscriptionTier(client: SupabaseClient, userId: string): Promise<string> {
  const { data, error } = await client
    .from('profiles')
    .select('subscription_tier')
    .eq('id', userId)
    .single();
  if (error || !data) return 'free';
  return (data as { subscription_tier?: string | null }).subscription_tier ?? 'free';
}
