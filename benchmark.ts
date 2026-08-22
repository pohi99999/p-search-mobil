import { supabase } from './src/lib/supabase';

async function run() {
  const start = Date.now();
  const { data: { session } } = await supabase.auth.getSession();
  console.log("session:", Date.now() - start);

  const startAll = Date.now();
  const [
    { data: profileData, error: profileError },
    { data: userData }
  ] = await Promise.all([
    supabase
      .from('business_profiles')
      .select('*')
      .eq('user_id', 'some-id')
      .single(),
    supabase
      .from('profiles')
      .select('*')
      .eq('id', 'some-id')
      .single()
  ]);
  console.log("Promise.all:", Date.now() - startAll);
}
run();
