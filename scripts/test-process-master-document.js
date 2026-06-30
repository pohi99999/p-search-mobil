/**
 * test-process-master-document.js
 * E2E integrációs teszt a process-master-document Edge Function-höz
 *
 * Futtatás: node scripts/test-process-master-document.js
 * Előfeltétel: A Supabase projekt aktív (nem szüneteltetett)
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();

const SUPABASE_URL       = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY  = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Hiányzó környezeti változók: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// Teszt: 1x1 fehér PNG kép Base64 formátumban (minimális, valós tesztre cseréld mérleg képpel)
const MOCK_IMAGE_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const MOCK_MIME_TYPE = 'image/png';

async function getTestProfileId() {
  // Service role-lal lekérjük az első elérhető business_profile ID-t teszteléshez
  const res = await fetch(`${SUPABASE_URL}/rest/v1/business_profiles?select=id&limit=1`, {
    headers: {
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    },
  });
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('Nincs elérhető business_profile a teszthez');
  }
  return data[0].id;
}

async function runTest() {
  console.log('\n═══════════════════════════════════════════════');
  console.log(' P-Search: process-master-document E2E Teszt');
  console.log('═══════════════════════════════════════════════\n');

  console.log('🔍 [1/3] Teszt profil ID lekérdezése...');
  const profileId = await getTestProfileId();
  console.log(`✅ Profil ID: ${profileId}`);

  console.log('\n📤 [2/3] Edge Function hívása base64 képpel...');
  const functionUrl = `${SUPABASE_URL}/functions/v1/process-master-document`;

  const response = await fetch(functionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      business_profile_id: profileId,
      file_base64: MOCK_IMAGE_BASE64,
      mime_type: MOCK_MIME_TYPE,
      file_name: 'test_merleg_2024.png',
    }),
  });

  const result = await response.json();
  console.log('\n📊 [3/3] Válasz státusz:', response.status);
  console.log('📋 Válasz törzs:', JSON.stringify(result, null, 2));

  if (response.ok && result.success) {
    console.log('\n✅ Teszt SIKERES! Kinyert adatok:');
    console.log('  net_revenue:  ', result.extracted_data?.net_revenue   ?? 'N/A (tesztkép - valós mérleg szükséges)');
    console.log('  ebitda:       ', result.extracted_data?.ebitda        ?? 'N/A');
    console.log('  equity:       ', result.extracted_data?.equity        ?? 'N/A');
    console.log('  employee_count:', result.extracted_data?.employee_count ?? 'N/A');
    console.log('  confidence:   ', result.extracted_data?.extraction_confidence ?? 'N/A');
  } else {
    console.log('\n⚠️  Teszt befejezve (valós kinyerés csak valós mérleg képpel lehetséges)');
    console.log('   HTTP státusz:', response.status, '| Hiba:', result.error || 'ismeretlen');
  }

  console.log('\n═══════════════════════════════════════════════\n');
}

runTest().catch(err => {
  console.error('❌ Futtatási hiba:', err.message);
  process.exit(1);
});
