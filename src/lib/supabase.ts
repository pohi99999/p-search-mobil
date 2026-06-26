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

// Mock adatok
const fakeUser = {
  id: '00000000-0000-0000-0000-000000000000',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'peterpohankapersonal@gmail.com',
  email_confirmed_at: new Date().toISOString(),
  phone: '',
  confirmed_at: new Date().toISOString(),
  last_sign_in_at: new Date().toISOString(),
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {},
  identities: [],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const fakeSession = {
  access_token: 'fake-access-token',
  refresh_token: 'fake-refresh-token',
  expires_in: 3600,
  token_type: 'bearer',
  user: fakeUser,
};

const mockUserProfile = {
  id: '00000000-0000-0000-0000-000000000000',
  full_name: 'Péter (Teszt)',
  avatar_url: null,
  subscription_tier: 'pro',
  search_frequency: 'daily',
  search_count: 5,
};

const mockBusinessProfile = {
  id: '11111111-1111-1111-1111-111111111111',
  user_id: '00000000-0000-0000-0000-000000000000',
  company_name: 'Teszt Vállalkozás Kft.',
  tax_number: '12345678-1-12',
  industry_code: '6201',
  employee_count: 5,
  yearly_revenue: 50000000,
  goals: 'AI alapú fejlesztések és digitalizáció',
};

const mockMatches = [
  {
    id: '22222222-2222-2222-2222-222222222222',
    business_id: '11111111-1111-1111-1111-111111111111',
    grant_id: '33333333-3333-3333-3333-333333333333',
    match_score: 95,
    match_reasoning: 'A cég szoftverfejlesztési tevékenysége és létszáma tökéletesen illeszkedik a digitális megújulást támogató pályázati kiíráshoz.',
    status: 'new',
    grants: {
      id: '33333333-3333-3333-3333-333333333333',
      title: 'KKV Digitalizációs Támogatás (GINOP-Plusz)',
      description: 'Vállalkozások digitális transzformációjának, felhőszolgáltatások bevezetésének és IT eszközbeszerzésének támogatása.',
      provider: 'Európai Unió / Magyar Állam',
      grant_type: 'támogatás',
      amount_min: 5000000,
      amount_max: 25000000,
      deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      source_url: 'https://palyazat.gov.hu',
    }
  },
  {
    id: '44444444-4444-4444-4444-444444444444',
    business_id: '11111111-1111-1111-1111-111111111111',
    grant_id: '55555555-5555-5555-5555-555555555555',
    match_score: 80,
    match_reasoning: 'Az energetikai korszerűsítési hitel kiváló lehetőséget biztosít a telephely zöldítésére és fenntarthatóbbá tételére.',
    status: 'interested',
    grants: {
      id: '55555555-5555-5555-5555-555555555555',
      title: 'Zöld Energia Hitelprogram',
      description: 'Kedvezményes, kamattámogatott hitel vállalkozások részére napelem rendszerek és energiahatékony berendezések telepítésére.',
      provider: 'MNB / Kereskedelmi Bankok',
      grant_type: 'hitel',
      amount_min: 10000000,
      amount_max: 100000000,
      deadline: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      source_url: 'https://mnb.hu',
    }
  }
];

const mockActionPlans = [
  {
    id: 'plan-111',
    business_profile_id: '11111111-1111-1111-1111-111111111111',
    match_id: '22222222-2222-2222-2222-222222222222',
    title: 'Digitális Felkészülési Terv - GINOP-Plusz',
    ai_context: {
      generated_document_html: '<h1>Üzleti és Digitalizációs Terv</h1><p>Ez egy automatikusan generált teszt dokumentum.</p>'
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];

const mockActionTasks = [
  {
    id: 'task-1',
    plan_id: 'plan-111',
    title: 'IT biztonsági audit elvégzése',
    description: 'A meglévő rendszerek sebezhetőségének felmérése és jegyzőkönyv készítése.',
    status: 'done',
    order_index: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'task-2',
    plan_id: 'plan-111',
    title: 'Felhőszolgáltató kiválasztása',
    description: 'AWS, Azure vagy Google Cloud árajánlatok összehasonlítása és a döntés előkészítése.',
    status: 'in_progress',
    order_index: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'task-3',
    plan_id: 'plan-111',
    title: 'Pályázati dokumentáció összeállítása',
    description: 'A szükséges céges dokumentumok (mérleg, aláírási címpéldány) összegyűjtése.',
    status: 'todo',
    order_index: 2,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];

// Mock láncoló helper
const createMockChain = (mockData: unknown, mockError: unknown = null) => {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => chain,
    single: async () => ({ data: mockData, error: mockError }),
    in: () => chain,
    insert: (data: unknown) => {
      return createMockChain(Array.isArray(data) ? data[0] : data);
    },
    update: (data: unknown) => {
      return createMockChain(data);
    },
    delete: () => chain,
  };
  
  chain.then = (onfulfilled: (value: unknown) => void) => {
    return Promise.resolve({ data: mockData, error: mockError }).then(onfulfilled);
  };
  
  return chain;
};

// Custom supabase kliens wrapper
export const supabase = new Proxy(rawSupabase, {
  get(target, prop) {
    if (BYPASS_AUTH && __DEV__) {
      if (prop === 'auth') {
        return {
          getSession: async () => ({ data: { session: fakeSession }, error: null }),
          getUser: async () => ({ data: { user: fakeUser }, error: null }),
          onAuthStateChange: (callback: Function) => {
            callback('SIGNED_IN', fakeSession);
            return { data: { subscription: { unsubscribe: () => {} } } };
          },
          signOut: async () => {
            return { error: null };
          },
          signInWithPassword: async () => ({ data: { session: fakeSession, user: fakeUser }, error: null }),
          signUp: async () => ({ data: { session: fakeSession, user: fakeUser }, error: null }),
        };
      }
      
      if (prop === 'from') {
        return (table: string) => {
          switch (table) {
            case 'profiles':
              return createMockChain(mockUserProfile);
            case 'business_profiles':
              return createMockChain(mockBusinessProfile);
            case 'grant_matches':
              return createMockChain(mockMatches);
            case 'action_plans':
              return createMockChain(mockActionPlans);
            case 'action_tasks':
              return createMockChain(mockActionTasks);
            default:
              return createMockChain([]);
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
