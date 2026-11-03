// Card [G] (review 2026-10-25, spec: Irisz, irisz-G-esemenyek.md): usage events for the closed test.
// Fire-and-forget: a lost event is a smaller harm than a blocked user action or a retry loop, so every failure
// ends in a logger.warn and nothing is thrown or awaited by the caller. The meta of each event is typed, and
// sanitizeMeta drops any key outside the whitelist at run time too; the database enforces the same list
// (supabase/migrations/20261025120000_app_events_and_match_feedback.sql).
import { Platform } from 'react-native';
import * as Application from 'expo-application';
import { supabase } from '../lib/supabase';
import { logger } from '../utils/logger';

import type { AppEvent, EventMeta, MatchFeedback, MatchRef } from './eventMeta';
import { sanitizeMeta } from './eventMeta';

export * from './eventMeta';

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
    // Even the warning must not throw: a telemetry failure never reaches the user's action.
    try { logger.warn(`app event ${event} not recorded:`, e); } catch { /* nothing left to do */ }
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
