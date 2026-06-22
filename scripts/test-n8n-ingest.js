const fs = require('fs');
const path = require('path');

// 1. Környezeti változók betöltése a .env-ből
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
    console.log('.env fájl sikeresen betöltve.');
  }
} catch (err) {
  console.warn('Nem sikerült betölteni a .env fájlt:', err.message);
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const functionSecret = process.env.N8N_WEBHOOK_SECRET || 'test-secret-key'; // Mock fallback

if (!supabaseUrl) {
  console.error("Hiba: Supabase URL hiányzik a környezeti változókból.");
  process.exit(1);
}

const functionUrl = `${supabaseUrl}/functions/v1/ingest-n8n-grants`;
const requestBody = {
  title: "Teszt Pályázat N8N-ből",
  description: "Ez egy teszt pályázat, amit az n8n webhookon keresztül küldünk be.\n\nEz a második bekezdés, amiből egy újabb chunk és embedding kell, hogy generálódjon.",
  provider: "Teszt Minisztérium",
  grant_type: "vissza nem térítendő",
  amount_min: 5000000,
  amount_max: 20000000,
  deadline: "2028-12-31T23:59:59Z",
  eligibility_criteria: "Teszt KKV-k",
  source_url: "https://example.com/teszt-palyazat"
};

async function testIngest() {
  console.log("--- N8N Ingest Edge Function Teszt ---");
  console.log(`Cél végpont: ${functionUrl}`);
  console.log("Kérés küldése...");

  try {
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${functionSecret}`
      },
      body: JSON.stringify(requestBody)
    });

    console.log(`Válasz státusz kód: ${response.status}`);
    const rawText = await response.text();
    
    if (response.ok) {
      const parsed = JSON.parse(rawText);
      console.log("\n--- SIKERES VÁLASZ ---");
      console.log(JSON.stringify(parsed, null, 2));
    } else {
      console.error("Hiba történt az Edge Function hívása közben. Nyers válasz:", rawText);
    }
  } catch (error) {
    console.error("Végzetes hiba a lekérdezés során:", error);
  }
}

testIngest();
