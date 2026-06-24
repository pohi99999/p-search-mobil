import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'http://localhost:54321';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
  try {
    const { data, error } = await supabase.from('business_profiles').select('*').limit(1);
    if (error) {
      console.error('Connection error:', error);
    } else {
      console.log('Connection successful, got data:', data);
    }
  } catch (err) {
    console.error('Fetch error:', err);
  }
}

testConnection();
