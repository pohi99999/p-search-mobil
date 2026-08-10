import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { BusinessProfile } from '../types/database';
import { logger } from '../utils/logger';

let cachedProfile: BusinessProfile | null = null;
let hasFetched = false;
let fetchPromise: Promise<void> | null = null;

// Only to be used in tests
export const clearProfileCache = () => {
  cachedProfile = null;
  hasFetched = false;
  fetchPromise = null;
};


interface ProfileContextType {
  profile: BusinessProfile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  setProfile: (profile: BusinessProfile | null) => void;
}

const ProfileContext = createContext<ProfileContextType>({
  profile: null,
  loading: true,
  refreshProfile: async () => {},
  setProfile: () => {},
});

export const useProfile = () => useContext(ProfileContext);

export const ProfileProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [profile, setProfileState] = useState<BusinessProfile | null>(cachedProfile);

  const setProfile = (newProfile: BusinessProfile | null) => {
    cachedProfile = newProfile;
    hasFetched = true;
    setProfileState(newProfile);
  };
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (forceRefresh = false) => {
    if (hasFetched && !forceRefresh) {
      setProfileState(cachedProfile);
      setLoading(false);
      return;
    }

    if (fetchPromise && !forceRefresh) {
      setLoading(true);
      await fetchPromise;
      setProfileState(cachedProfile);
      setLoading(false);
      return;
    }

    setLoading(true);

    fetchPromise = (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          cachedProfile = null;
          return;
        }

        const { data, error } = await supabase
          .from('business_profiles')
          .select('*')
          .eq('user_id', session.user.id)
          .single();

        if (error && error.code !== 'PGRST116') {
          logger.error('Error fetching profile in ProfileContext:', error);
        }

        if (data) {
          cachedProfile = data as BusinessProfile;
        } else {
          cachedProfile = null;
        }
      } catch (err) {
        logger.error('Unexpected error fetching profile in ProfileContext:', err);
      } finally {
        hasFetched = true;
        fetchPromise = null;
      }
    })();

    await fetchPromise;
    setProfileState(cachedProfile);
    setLoading(false);
  };

  useEffect(() => {
    fetchProfile();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        fetchProfile(true);
      } else {
        setProfile(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return (
    <ProfileContext.Provider value={{ profile, loading, refreshProfile: () => fetchProfile(true), setProfile }}>
      {children}
    </ProfileContext.Provider>
  );
};
