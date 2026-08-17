import { Alert } from 'react-native';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { BusinessProfile, UserProfile, GrantMatch, Grant } from '../types/database';
import { useBilling } from '../context/BillingContext';
import { logger } from '../utils/logger';
import { RootStackNavigationProp } from '../types/navigation';

export type MatchWithGrant = GrantMatch & { grants: Grant };

export interface SearchRunResult {
  matchesFound: number;
}

/**
 * Runs the AI grant matching for a company and returns how many matches were
 * produced.
 *
 * This calls `match-grants`, which is the only thing in the system that
 * actually writes `grant_matches` rows. The previous implementation only
 * notified an external n8n webhook, so pressing "Új AI Keresés" produced no
 * matches at all and the home screen stayed empty forever.
 */
async function runGrantMatching(businessId: string): Promise<SearchRunResult> {
  const { data, error } = await supabase.functions.invoke('match-grants', {
    body: { business_profile_id: businessId },
  });

  if (error) throw error;
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

export function useHomeData(navigation: RootStackNavigationProp) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [matches, setMatches] = useState<MatchWithGrant[]>([]);
  const { isPro } = useBilling();

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
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
          // Cast the result to our compound type
          setMatches(matchesData as unknown as MatchWithGrant[]);
        }
      } else {
        // No profile found, redirect to Onboarding
        navigation.replace('Onboarding');
      }
    } catch (err) {
      logger.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  const [searching, setSearching] = useState(false);

  /**
   * Runs the matching pipeline, refreshes the list and reports the outcome.
   * Shared by the Pro and free paths so both behave identically once the
   * entitlement check has passed.
   */
  const executeSearch = async (
    businessId: string,
    action: 'new_search_pro' | 'new_search_free',
  ) => {
    setSearching(true);
    try {
      const { matchesFound } = await runGrantMatching(businessId);

      // Fire-and-forget: the external automation is not on the critical path.
      void triggerSearchWebhook(action, businessId);

      // Pull the freshly written matches into the list.
      await fetchData();

      Alert.alert(
        'AI keresés kész',
        matchesFound > 0
          ? `${matchesFound} illeszkedő pályázatot találtunk a cégedhez!`
          : 'Jelenleg nem találtunk új, a cégedhez illeszkedő pályázatot. Amint új kiírás jelenik meg, értesítünk.',
      );
    } catch (err) {
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

    if (isPro) {
      await executeSearch(profile.id, 'new_search_pro');
      return;
    }

    const { data, error: invokeError } = await supabase.functions.invoke('increment-search-count');

    if (invokeError) {
      logger.error(invokeError);
      Alert.alert('Hiba történt a keresési limit ellenőrzésekor!');
      return;
    }

    if (data?.allowed) {
      setUserProfile({ ...userProfile, search_count: data.newCount });
      await executeSearch(profile.id, 'new_search_free');
    } else {
      navigation.navigate('Paywall');
    }
  };

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
