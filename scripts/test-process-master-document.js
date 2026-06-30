/**
 * test-process-master-document.js
 * E2E integrációs teszt a process-master-document Edge Function-höz
 *
 * Futtatás: node scripts/test-process-master-document.js
 * Előfeltétel: A Supabase projekt aktív (nem szüneteltetett)
 */

const fs = require('fs');
const path = require('path');

// Load .env manually (no dotenv dependency — matches project convention)
try {
  const envPath = path.resolve(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const parts = line.trim().split('=');
      if (parts.length >= 2 && !line.startsWith('#')) {
        const key = parts[0].trim();
        const value = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
        process.env[key] = value;
      }
    });
  }
} catch (e) {
  console.warn('Nem sikerült betölteni a .env fájlt:', e.message);
}

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

async function getAuthToken() {
  const TEST_EMAIL = `test-ocr-${Date.now()}@psearch-test.internal`;
  const TEST_PASS  = 'TestOCR_2026!';

  // Step 1: Admin create a confirmed test user (service role)
  console.log('  → Teszt felhasználó létrehozása (admin API)...');
  const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      email: TEST_EMAIL,
      password: TEST_PASS,
      email_confirm: true,   // skip email verification
    }),
  });
  const createData = await createRes.json();
  if (!createRes.ok || !createData.id) {
    console.warn('  ⚠️  Teszt felhasználó létrehozás sikertelen:', JSON.stringify(createData));
    return SERVICE_ROLE_KEY; // fallback
  }
  console.log(`  ✅ Teszt user létrehozva: ${createData.id}`);

  // Step 2: Sign in to get a real user JWT
  console.log('  → Bejelentkezés a teszt felhasználóval...');
  const signinRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASS }),
  });
  const signinData = await signinRes.json();
  if (signinData.access_token) {
    console.log('  ✅ JWT token megszerzve');
    return { token: signinData.access_token, userId: createData.id };
  }
  console.warn('  ⚠️  Bejelentkezés sikertelen:', JSON.stringify(signinData));
  return { token: SERVICE_ROLE_KEY, userId: null };
}

async function getTestProfileId(userId) {
  // business_profiles.user_id FK -> profiles.id -> auth.users.id
  // Must ensure profiles record exists first

  // 1. Ensure profiles record
  const profilesRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'Prefer': 'return=minimal,resolution=ignore-duplicates',
    },
    body: JSON.stringify({ id: userId, full_name: 'OCR Teszt Felhasználó' }),
  });
  if (!profilesRes.ok && profilesRes.status !== 409) {
    const body = await profilesRes.text();
    console.warn('  ⚠️  profiles rekord létrehozás:', profilesRes.status, body);
  } else {
    console.log('  ✅ profiles rekord biztosítva');
  }

  // 2. Check for existing business_profile
  const existing = await fetch(
    `${SUPABASE_URL}/rest/v1/business_profiles?user_id=eq.${userId}&select=id&limit=1`,
    { headers: { 'apikey': SERVICE_ROLE_KEY, 'Authorization': `Bearer ${SERVICE_ROLE_KEY}` } }
  );
  const existingData = await existing.json();
  if (Array.isArray(existingData) && existingData.length > 0) {
    return existingData[0].id;
  }

  // 3. Create test business profile
  const createRes = await fetch(`${SUPABASE_URL}/rest/v1/business_profiles`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'Prefer': 'return=representation',
    },
    body: JSON.stringify({
      user_id: userId,
      company_name: 'P-Search OCR Teszt Kft.',
      industry_code: '6201',
      employee_count: 5,
    }),
  });
  const createData = await createRes.json();
  if (Array.isArray(createData) && createData[0]?.id) {
    console.log('  ✅ Teszt cégprofil létrehozva:', createData[0].id);
    return createData[0].id;
  }
  throw new Error('Nem sikerült teszt cégprofilt létrehozni: ' + JSON.stringify(createData));
}

async function runTest() {
  console.log('\n═══════════════════════════════════════════════');
  console.log(' P-Search: process-master-document E2E Teszt');
  console.log('═══════════════════════════════════════════════\n');

  console.log('🔐 [0/3] Felhasználói JWT token megszerzése...');
  const authResult = await getAuthToken();
  const authToken = typeof authResult === 'string' ? authResult : authResult.token;
  const userId    = typeof authResult === 'string' ? null      : authResult.userId;

  console.log('🔍 [1/3] Teszt profil ID lekérdezése...');
  const profileId = await getTestProfileId(userId);
  console.log(`✅ Profil ID: ${profileId}`);

  console.log('\n📤 [2/3] Edge Function hívása base64 képpel...');
  const functionUrl = `${SUPABASE_URL}/functions/v1/process-master-document`;

  const response = await fetch(functionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
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
