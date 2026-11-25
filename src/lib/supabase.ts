import 'react-native-url-polyfill/auto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config/env';

const ExpoSecureStoreAdapter = {
  getItem: (key: string) => {
    return SecureStore.getItemAsync(key);
  },
  setItem: (key: string, value: string) => {
    return SecureStore.setItemAsync(key, value);
  },
  removeItem: (key: string) => {
    return SecureStore.deleteItemAsync(key);
  },
};

type WebBacking = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/**
 * The web session store. P-Search round 6 (Péter, Telegram 18328 via Marveen 9160): the web version is a product
 * and a reload must not sign the user out. Until now the session lived only in memory (0c754ba, to keep the JWT off
 * disk), so every reload went back to the sign-in screen. It now lives in sessionStorage: it survives a reload in the
 * same tab and is gone when the tab is closed, so the token is still not kept on disk across browser restarts
 * (localStorage would be). If the browser refuses storage (some private modes throw), it falls back to memory, the
 * old behaviour, instead of breaking sign-in.
 */
export function createWebAuthStorage(getBacking: () => WebBacking | undefined) {
  // Within one page load, memory holds the freshest value of every write and removal; the tab storage only carries a
  // value over to the next load. So a write the storage refuses (quota, some private modes: setItem throws while
  // getItem works, Ellenőr 9168) is still read back in this page, a refreshed token is never hidden behind a stale
  // stored one, and a sign-out whose storage removal fails does not bring the old session back.
  const memory = new Map<string, string>();
  const removed = new Set<string>();
  const backing = (): WebBacking | undefined => {
    try {
      return getBacking();
    } catch {
      return undefined;
    }
  };
  return {
    async getItem(key: string): Promise<string | null> {
      if (memory.has(key)) return memory.get(key) as string;
      if (removed.has(key)) return null;
      try {
        return backing()?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },
    async setItem(key: string, value: string): Promise<void> {
      memory.set(key, value);
      removed.delete(key);
      try {
        backing()?.setItem(key, value);
      } catch {
        // kept in memory for this page only; the next load starts signed out (the old in-memory behaviour)
      }
    },
    async removeItem(key: string): Promise<void> {
      memory.delete(key);
      removed.add(key);
      try {
        backing()?.removeItem(key);
      } catch {
        // the removal is remembered for this page
      }
    },
  };
}

const storage =
  Platform.OS === 'web'
    ? createWebAuthStorage(() => (typeof window !== 'undefined' ? window.sessionStorage : undefined))
    : ExpoSecureStoreAdapter;

const rawSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export const BYPASS_AUTH = false; // Set to true for local testing

// Custom supabase kliens wrapper
export const supabase = new Proxy(rawSupabase, {
  get(target, prop) {
    if (BYPASS_AUTH && __DEV__) {
      // Csak fejlesztési és tesztelési módban töltjük be a mock adatokat (dynamic require).
      // A Proxy get-trapnek szinkron kell maradnia, ezért itt nem használható ES dynamic import().
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mockData = require('./supabase.mock');

      if (prop === 'auth') {
        return {
          getSession: async () => ({ data: { session: mockData.fakeSession }, error: null }),
          getUser: async () => ({ data: { user: mockData.fakeUser }, error: null }),
          onAuthStateChange: (callback: (event: string, session: unknown) => void) => {
            callback('SIGNED_IN', mockData.fakeSession);
            return { data: { subscription: { unsubscribe: () => {} } } };
          },
          signOut: async () => {
            return { error: null };
          },
          signInWithPassword: async () => ({ data: { session: mockData.fakeSession, user: mockData.fakeUser }, error: null }),
          signUp: async () => ({ data: { session: mockData.fakeSession, user: mockData.fakeUser }, error: null }),
        };
      }
      
      if (prop === 'from') {
        return (table: string) => {
          switch (table) {
            case 'profiles':
              return mockData.createMockChain(mockData.mockUserProfile);
            case 'business_profiles':
              return mockData.createMockChain(mockData.mockBusinessProfile);
            case 'grant_matches':
              return mockData.createMockChain(mockData.mockMatches);
            case 'action_plans':
              return mockData.createMockChain(mockData.mockActionPlans);
            case 'action_tasks':
              return mockData.createMockChain(mockData.mockActionTasks);
            default:
              return mockData.createMockChain([]);
          }
        };
      }

      if (prop === 'functions') {
        return {
          invoke: async (name: string, options?: Record<string, unknown>) => {
            if (name === 'chat-with-gemini') {
              // Éles hívás továbbítása az eredeti rawSupabase felé
              return rawSupabase.functions.invoke(name, options);
            }
            if (name === 'generate-document') {
              return { data: { html: '<h1>Mock Üzleti Terv</h1><p>Ez a generált PDF tartalma.</p>' }, error: null };
            }
            if (name === 'generate-action-plan') {
              return { data: { success: true }, error: null };
            }
            return { data: {}, error: null };
          }
        };
      }
    }
    
    return (target as unknown as Record<string, unknown>)[prop as unknown as string];
  }
});
