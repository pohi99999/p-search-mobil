const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log('--- Testing Supabase Connection ---');
  
  // 1. Check if we can read business_profiles
  const { error: e1 } = await supabase.from('business_profiles').select('id').limit(1);
  console.log('1. business_profiles:', e1 ? e1.message : 'SUCCESS');

  const { error: e2 } = await supabase.from('grants').select('id').limit(1);
  console.log('2. grants:', e2 ? e2.message : 'SUCCESS');

  const { error: e3 } = await supabase.from('grant_matches').select('id').limit(1);
  console.log('3. grant_matches:', e3 ? e3.message : 'SUCCESS');  

  const { error: e4 } = await supabase.from('grant_chunks').select('id').limit(1);
  console.log('4. grant_chunks:', e4 ? e4.message : 'SUCCESS');  
}

run();
