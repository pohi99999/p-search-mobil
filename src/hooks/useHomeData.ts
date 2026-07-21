import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { BusinessProfile, UserProfile, GrantMatch, Grant } from '../types/database';
import { useBilling } from '../context/BillingContext';
import { logger } from '../utils/logger';
import { N8N_WEBHOOK_URL } from '../config/constants';
import { RootStackNavigationProp } from '../types/navigation';

export type MatchWithGrant = GrantMatch & { grants: Grant };


async function triggerSearchWebhook(action: 'new_search_pro' | 'new_search_free', businessId: string, userId: string) {
  if (N8N_WEBHOOK_URL) {
    await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: businessId,
        user_id: userId,
        action: action
      })
    }).catch(err => logger.warn('Webhook hívás hiba:', err));
  } else {
    logger.warn('N8N_WEBHOOK_URL is not defined, skipping webhook fetch.');
  }
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

  const handleNewSearch = async () => {
    if (!userProfile || !userProfile.id) {
      alert("Felhasználói profil nem található!");
      return;
    }

    if (isPro) {
      if (profile) {
        await triggerSearchWebhook('new_search_pro', profile.id, userProfile.id);
        alert("Új Pro AI keresés elindítva!");
      }
      navigation.navigate('CopilotChat');
      return;
    }

    const currentCount = userProfile.search_count || 0;
    if (currentCount >= 1) { // 1 free search limit
      navigation.navigate('Paywall');
    } else {
      // Trigger free search and increment count
      const newCount = currentCount + 1;
      setUserProfile({ ...userProfile, search_count: newCount });
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ search_count: newCount })
        .eq('id', userProfile.id);

      if (updateError) {
        logger.error(updateError);
        setUserProfile({ ...userProfile, search_count: currentCount });
        alert("Hiba történt a keresési limit frissítésekor!");
        return;
      }

      if (profile) {
        await triggerSearchWebhook('new_search_free', profile.id, userProfile.id);
      }
      alert("Ingyenes AI keresés elindítva!");
      navigation.navigate('CopilotChat');
    }
  };

  return {
    loading,
    profile,
    matches,
    isPro,
    fetchData,
    signOut,
    handleNewSearch
  };
}
