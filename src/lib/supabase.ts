import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

const rawSupabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export const BYPASS_AUTH = true; // Ideiglenes bypass a teszteléshez

// Custom supabase kliens wrapper
export const supabase = new Proxy(rawSupabase, {
  get(target, prop) {
    if (BYPASS_AUTH && __DEV__) {
      // Csak fejlesztési és tesztelési módban töltjük be a mock adatokat (dynamic require)
      const mockData = require('./supabase.mock');

      if (prop === 'auth') {
        return {
          getSession: async () => ({ data: { session: mockData.fakeSession }, error: null }),
          getUser: async () => ({ data: { user: mockData.fakeUser }, error: null }),
          onAuthStateChange: (callback: Function) => {
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
