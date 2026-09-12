// Shared Pro/entitlement helpers for the edge functions.
// Source of truth for Pro status is profiles.subscription_tier ('free' | 'pro'),
// written by the RevenueCat webhook. The generate-* functions gate on isPro();
// match-grants applies the free daily cap only to non-Pro users.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const PRO_TIER = 'pro';
export const FREE_DAILY_SEARCH_CAP = 20;

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
