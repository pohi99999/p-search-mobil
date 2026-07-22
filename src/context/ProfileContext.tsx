import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { BusinessProfile } from '../types/database';
import { logger } from '../utils/logger';

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
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        setProfile(null);
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
        setProfile(data as BusinessProfile);
      } else {
        setProfile(null);
      }
    } catch (err) {
      logger.error('Unexpected error fetching profile in ProfileContext:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        fetchProfile();
      } else {
        setProfile(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return (
    <ProfileContext.Provider value={{ profile, loading, refreshProfile: fetchProfile, setProfile }}>
      {children}
    </ProfileContext.Provider>
  );
};
