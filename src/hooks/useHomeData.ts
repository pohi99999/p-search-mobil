import { Alert } from 'react-native';
import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import { supabase } from '../lib/supabase';
import { BusinessProfile, UserProfile, GrantMatch, Grant } from '../types/database';
import { useBilling } from '../context/BillingContext';
import { logger } from '../utils/logger';
import { RootStackNavigationProp } from '../types/navigation';
import { clearStoredChatHistory } from './useCopilotChat';

import { hasSearchedBefore, isOpenGrant, sortFreshFirst, STALE_MATCH_STATUS, withoutExpired } from '../lib/matchStatus';
import { errorCode, track } from '../services/events';

export type MatchWithGrant = GrantMatch & { grants: Grant };
export interface SearchRunResult {
  matchesFound: number;
  candidatesConsidered: number;
}

// [G2] events: once per app session, and app_open again after more than 30 minutes in the background.
const APP_OPEN_AFTER_BACKGROUND_MS = 30 * 60 * 1000;
let appOpenRecorded = false;
let matchListViewRecorded = false;
/** Wall-clock milliseconds; a plain function so the React compiler's purity rule does not mistake it for render work. */
function nowMs(): number {
  return Date.now();
}
/** Test hook: a new "session" for the module-level once-per-session flags. */
export function resetSessionEventsForTest() {
  appOpenRecorded = false;
  matchListViewRecorded = false;
}

/** The server's {code, search_refunded} of a failed match-grants call, read once (the body can only be read once). */
async function readErrorBody(error: unknown): Promise<{ code?: string; error?: string; search_refunded?: boolean }> {
  try {
    const ctx = (error as { context?: { json?: () => Promise<{ code?: string; error?: string; search_refunded?: boolean }> } }).context;
    return ctx?.json ? await ctx.json() : {};
  } catch {
    return {};
  }
}

/** The ids of the matches that have an action plan, or null when the lookup failed (then nothing is hidden). */
async function fetchPlanMatchIds(businessId: string): Promise<Set<string> | null> {
  try {
    const { data, error } = await supabase.from('action_plans').select('match_id').eq('business_profile_id', businessId);
    if (error) throw error;
    return new Set((data ?? []).map((r: { match_id: string | null }) => r.match_id).filter((id): id is string => !!id));
  } catch (e) {
    logger.warn('action plan lookup failed, expired matches stay listed:', e);
    return null;
  }
}

/**
 * Runs the AI grant matching for a company and returns how many matches were
 * produced.
 */
async function runGrantMatching(businessId: string): Promise<SearchRunResult> {
  const { data, error } = await supabase.functions.invoke('match-grants', {
    body: { business_profile_id: businessId },
  });

  if (error) {
    // A 403 from match-grants means the free daily cap is used up (or a Pro
    // gate). That is an upsell moment, not an error: read the server's {code,
    // error} body and signal the caller (daily_limit vs pro_required) so it can
    // show the right Hungarian message and route to the Paywall.
    const status = (error as { context?: { status?: number } })?.context?.status;
    if (status === 403) {
      // body unreadable -> {} -> a plain Paywall route
      const body = await readErrorBody(error);
      const code = body?.code ?? '';
      const serverMessage = body?.error ?? '';
      const paywallErr = new Error(serverMessage || 'paywall') as Error & { paywall?: boolean; code?: string; serverMessage?: string };
      paywallErr.paywall = true;
      paywallErr.code = code;
      paywallErr.serverMessage = serverMessage;
      throw paywallErr;
    }
    // 429 daily AI quota / 503 AI overloaded (card 6303fd73): the server sends {code, error} with a
    // Hungarian message; surface it instead of the generic failure.
    if (status === 429 || status === 503) {
      // body unreadable -> {} -> the generic AI message
      const body = await readErrorBody(error);
      const code = body?.code ?? '';
      const serverMessage = body?.error ?? '';
      const aiErr = new Error(serverMessage || 'ai_unavailable') as Error & { aiUnavailable?: boolean; code?: string; serverMessage?: string; searchRefunded?: boolean };
      aiErr.aiUnavailable = true;
      aiErr.searchRefunded = body?.search_refunded === true;
      aiErr.code = code || (status === 429 ? 'gemini_quota' : 'gemini_busy');
      aiErr.serverMessage = serverMessage;
      throw aiErr;
    }
    throw error;
  }
  if (data?.error) throw new Error(data.error);

  return { matchesFound: Number(data?.matches_found ?? 0), candidatesConsidered: Number(data?.candidates_considered ?? 0) };
}

/**
 * Best-effort notification to the external n8n automation. Failures are
 * swallowed because the user-visible search result must not depend on an
 * external workflow engine being reachable.
 */
async function triggerSearchWebhook(action: 'new_search_pro' | 'new_search_free', businessId: string) {
  await supabase.functions
    .invoke('trigger-n8n-webhook', {
      body: {
        business_id: businessId,
        action: action,
      },
    })
    .catch((err) => logger.warn('Edge function hívás hiba:', err));
}

function useHomeDataFetch(navigation: RootStackNavigationProp) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [matches, setMatches] = useState<MatchWithGrant[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      const [
        { data: profileData, error: profileError },
        { data: userData }
      ] = await Promise.all([
        supabase
          .from('business_profiles')
          .select('*')
          .eq('user_id', session.user.id)
          .single(),
        supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single()
      ]);

      if (userData) {
        setUserProfile(userData as UserProfile);
      }

      if (profileError && profileError.code !== 'PGRST116') {
        logger.error(profileError);
      }

      if (profileData) {
        setProfile(profileData);
        // Fetch matches, and the matches an action plan hangs on (those stay even when their grant expired).
        const [{ data: matchesData, error: matchesError }, planMatchIds] = await Promise.all([
          supabase
            .from('grant_matches')
            .select('*, grants(*)')
            .eq('business_id', profileData.id)
            .order('match_score', { ascending: false }),
          fetchPlanMatchIds(profileData.id),
        ]);

        if (matchesError) {
          logger.error(matchesError);
        } else if (matchesData) {
          const rows = matchesData as unknown as MatchWithGrant[];
          // Card [C]: without the plan list nothing is hidden, so a failed lookup never drops a started plan.
          setMatches(sortFreshFirst(planMatchIds ? withoutExpired(rows, planMatchIds) : rows));
        }
      } else {
        navigation.replace('Onboarding');
      }
    } catch (err) {
      logger.error(err);
    } finally {
      setLoading(false);
    }
  }, [navigation]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { loading, profile, userProfile, setUserProfile, matches, fetchData };
}

interface UseGrantSearchProps {
  navigation: RootStackNavigationProp;
  profile: BusinessProfile | null;
  userProfile: UserProfile | null;
  isPro: boolean;
  onSearchSuccess: () => Promise<void>;
}

function useGrantSearch({
  navigation,
  profile,
  userProfile,
  isPro,
  onSearchSuccess
}: UseGrantSearchProps) {
  const [searching, setSearching] = useState(false);

  const executeSearch = async (
    businessId: string,
    action: 'new_search_pro' | 'new_search_free',
    trigger: 'manual' | 'after_onboarding' = 'manual',
  ) => {
    setSearching(true);
    const startedAt = nowMs();
    track('search_start', { trigger });
    try {
      const { matchesFound, candidatesConsidered } = await runGrantMatching(businessId);
      track('search_result', { ok: true, matches_found: matchesFound, candidates_considered: candidatesConsidered, duration_ms: nowMs() - startedAt });
      void triggerSearchWebhook(action, businessId);
      await onSearchSuccess();

      Alert.alert(
        'AI keresés kész',
        matchesFound > 0
          ? `${matchesFound} illeszkedő pályázatot találtunk a cégedhez!`
          : 'Most nem találtunk új, a cégedhez illő pályázatot. Ha új kiírás jelenik meg, a következő automatikus keresés után itt látod.',
      );
    } catch (err) {
      const paywallErr = err as { paywall?: boolean; code?: string; serverMessage?: string };
      const aiFailure = err as { aiUnavailable?: boolean; code?: string; searchRefunded?: boolean };
      track('search_result', {
        ok: false,
        duration_ms: nowMs() - startedAt,
        error_code: paywallErr?.paywall
          ? (paywallErr.code === 'daily_limit' ? 'daily_limit' : 'pro_required')
          : errorCode(err, aiFailure?.aiUnavailable ? aiFailure.code : null),
        ...(aiFailure?.aiUnavailable ? { search_refunded: aiFailure.searchRefunded === true } : {}),
      });
      if (paywallErr?.paywall) {
        if (paywallErr.code === 'daily_limit') {
          track('daily_limit_hit');
          // Daily free cap hit: show the server's message with a Pro upsell,
          // rather than jumping straight to the Paywall.
          Alert.alert(
            'Napi keresési limit',
            paywallErr.serverMessage || 'Elérted a napi ingyenes keresést. Holnap újra próbálhatod.',
            [
              { text: 'Bezár', style: 'cancel' },
              { text: 'Pro-ra váltok', onPress: () => navigation.navigate('Paywall', { source: 'home_limit' }) },
            ],
          );
        } else {
          // pro_required (or an unlabelled 403): straight to the Paywall.
          navigation.navigate('Paywall', { source: 'home_limit' });
        }
        return;
      }
      const aiErr = err as { aiUnavailable?: boolean; code?: string; serverMessage?: string };
      if (aiErr?.aiUnavailable) {
        const quota = aiErr.code === 'gemini_quota';
        Alert.alert(
          quota ? 'Napi AI-keret' : 'Az AI most túlterhelt',
          aiErr.serverMessage ||
            (quota
              ? 'A napi AI-keret elfogyott, holnap 09:00 után próbáld újra.'
              : 'Az AI-szolgáltatás átmenetileg túlterhelt, próbáld újra egy perc múlva.'),
          // A quota does not come back before 09:00, so only "busy" offers an immediate retry.
          quota
            ? [{ text: 'Bezár', style: 'cancel' }]
            : [
                { text: 'Bezár', style: 'cancel' },
                { text: 'Újra', onPress: () => { void executeSearch(businessId, action, trigger); } },
              ],
        );
        return;
      }
      logger.error('Hiba az AI keresés során:', err);
      Alert.alert('Hiba', 'Nem sikerült lefuttatni a keresést. Kérjük, próbáld újra később.');
    } finally {
      setSearching(false);
    }
  };

  // A Button passes its press event here, so anything but 'after_onboarding' counts as a manual search.
  const handleNewSearch = async (trigger?: unknown) => {
    if (!userProfile || !userProfile.id) {
      Alert.alert('Felhasználói profil nem található!');
      return;
    }

    if (!profile) {
      Alert.alert('Nincs cégprofilod', 'Előbb töltsd ki a cégprofilodat!');
      navigation.navigate('Onboarding');
      return;
    }

    // Search is free (owner decision 2026-09-12). The daily cost cap (20/day for
    // non-Pro) and the Pro gate are enforced server-side in match-grants; a 403
    // there routes the user to the Paywall (handled in executeSearch). No
    // client-side pre-check, and we no longer call increment-search-count.
    await executeSearch(profile.id, isPro ? 'new_search_pro' : 'new_search_free', trigger === 'after_onboarding' ? 'after_onboarding' : 'manual');
  };

  return { searching, handleNewSearch };
}

export function useHomeData(navigation: RootStackNavigationProp) {
  const { isPro } = useBilling();

  const {
    loading,
    profile,
    userProfile,
    setUserProfile,
    matches,
    fetchData
  } = useHomeDataFetch(navigation);

  const { searching, handleNewSearch } = useGrantSearch({
    navigation,
    profile,
    userProfile,
    isPro,
    onSearchSuccess: fetchData
  });

  // Card [D]: the empty home tells "never searched" from "0 matches". A company that has never been scanned gets its
  // first search started here, once per session (a failure is not retried in a loop): saving the profile used to
  // fire only the best-effort n8n trigger, and the home then waited for nothing.
  const hasSearched = hasSearchedBefore(userProfile?.last_scan_at, matches.length);
  const autoSearched = useRef(false);
  useEffect(() => {
    if (loading || searching || hasSearched || autoSearched.current || !profile || !userProfile?.id) return;
    autoSearched.current = true;
    void handleNewSearch('after_onboarding');
  }, [loading, searching, hasSearched, profile, userProfile, handleNewSearch]);

  // [G2] app_open: the signed-in home's first load in this app session, and again after more than 30 minutes in the
  // background. match_list_view: the first non-empty list of the session (n_expired should be 0 after card [C]).
  useEffect(() => {
    if (loading || !userProfile?.id || appOpenRecorded) return;
    appOpenRecorded = true;
    track('app_open');
  }, [loading, userProfile]);

  useEffect(() => {
    let backgroundSince: number | null = null;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') backgroundSince = Date.now();
      if (state === 'active' && backgroundSince !== null) {
        if (Date.now() - backgroundSince > APP_OPEN_AFTER_BACKGROUND_MS) track('app_open');
        backgroundSince = null;
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (loading || matches.length === 0 || matchListViewRecorded) return;
    matchListViewRecorded = true;
    track('match_list_view', {
      n_total: matches.length,
      n_stale: matches.filter((m) => m.status === STALE_MATCH_STATUS).length,
      n_expired: matches.filter((m) => !isOpenGrant(m.grants?.deadline)).length,
    });
  }, [loading, matches]);

  async function signOut() {
    // Előbb a helyi beszélgetés-előzmény, hogy egy sikertelen hálózati
    // kijelentkezés se hagyja az eszközön a korábbi chatet.
    try {
      await clearStoredChatHistory();
    } catch (err) {
      logger.error('Failed to clear stored chat history on sign out:', err);
    }
    await supabase.auth.signOut();
  }

  return {
    loading,
    searching,
    hasSearched,
    profile,
    matches,
    isPro,
    fetchData,
    signOut,
    handleNewSearch
  };
}
