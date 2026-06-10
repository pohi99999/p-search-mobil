const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://icextvgecinmhrhjtfcm.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImljZXh0dmdlY2lubWhyaGp0ZmNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5OTU2NTEsImV4cCI6MjA5NjU3MTY1MX0.o6qQ3Op5MLv2_zfjqcmptkTqm2smE0F5lDdFWQi0ipE';
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
  console.log('2. AUTH SIGNUP SUCCESS:', authData.user?.id);

  // 3. Try to insert a profile for this user
  if (authData?.user) {
    const { data: insertData, error: insertError } = await supabase.from('business_profiles').insert({
      user_id: authData.user.id,
      company_name: 'Automated Test Corp.',
      industry: 'IT',
      employees: '1-10',
      goals: 'Test backend integration'
    });
    
    if (insertError) {
      console.log('3. PROFILE INSERT ERROR:', insertError.message);
    } else {
      console.log('3. PROFILE INSERT SUCCESS!');
    }
  }
}

run();
