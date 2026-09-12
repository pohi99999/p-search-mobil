import { Alert } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { BusinessProfile, UserProfile, GrantMatch, Grant } from '../types/database';
import { useBilling } from '../context/BillingContext';
import { logger } from '../utils/logger';
import { RootStackNavigationProp } from '../types/navigation';
import { clearStoredChatHistory } from './useCopilotChat';

export type MatchWithGrant = GrantMatch & { grants: Grant };

export interface SearchRunResult {
  matchesFound: number;
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
    // gate). That is an upsell moment, not an error: signal the caller to route
    // to the Paywall instead of showing a generic failure.
    const status = (error as { context?: { status?: number } })?.context?.status;
    if (status === 403) {
      const paywallErr = new Error('paywall') as Error & { paywall?: boolean };
      paywallErr.paywall = true;
      throw paywallErr;
    }
    throw error;
  }
  if (data?.error) throw new Error(data.error);

  return { matchesFound: Number(data?.matches_found ?? 0) };
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
        // Fetch matches
        const { data: matchesData, error: matchesError } = await supabase
          .from('grant_matches')
          .select('*, grants(*)')
          .eq('business_id', profileData.id)
          .order('match_score', { ascending: false });

        if (matchesError) {
          logger.error(matchesError);
        } else if (matchesData) {
          setMatches(matchesData as unknown as MatchWithGrant[]);
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
  ) => {
    setSearching(true);
    try {
      const { matchesFound } = await runGrantMatching(businessId);
      void triggerSearchWebhook(action, businessId);
      await onSearchSuccess();

      Alert.alert(
        'AI keresés kész',
        matchesFound > 0
          ? `${matchesFound} illeszkedő pályázatot találtunk a cégedhez!`
          : 'Jelenleg nem találtunk új, a cégedhez illeszkedő pályázatot. Amint új kiírás jelenik meg, értesítünk.',
      );
    } catch (err) {
      if ((err as { paywall?: boolean })?.paywall) {
        navigation.navigate('Paywall');
        return;
      }
      logger.error('Hiba az AI keresés során:', err);
      Alert.alert('Hiba', 'Nem sikerült lefuttatni a keresést. Kérjük, próbáld újra később.');
    } finally {
      setSearching(false);
    }
  };

  const handleNewSearch = async () => {
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
    await executeSearch(profile.id, isPro ? 'new_search_pro' : 'new_search_free');
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
    profile,
    matches,
    isPro,
    fetchData,
    signOut,
    handleNewSearch
  };
}
