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
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !anonKey) {
  console.error("Hiba: Supabase URL vagy Anon kulcs hiányzik a környezeti változókból.");
  process.exit(1);
}

const functionUrl = `${supabaseUrl}/functions/v1/chat-with-gemini`;
const requestBody = {
  prompt: "Milyen KKV támogatás érhető el jelenleg gépbeszerzésre, és mik a jogosultsági feltételek?",
  history: []
};

async function testQuery() {
  console.log("--- Pályázati RAG Edge Function Integrációs Teszt ---");
  console.log(`Cél végpont: ${functionUrl}`);
  console.log(`Kérdés: "${requestBody.prompt}"`);
  console.log("Kérés küldése...");

  try {
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${anonKey}`
      },
      body: JSON.stringify(requestBody)
    });

    console.log(`Válasz státusz kód: ${response.status}`);
    const rawText = await response.text();
    
    if (response.ok) {
      const parsed = JSON.parse(rawText);
      console.log("\n--- SIKERES VÁLASZ ---");
      console.log("Generált válasz (reply):");
      console.log(parsed.reply);
      console.log("\nAdatbázis frissítés történt-e (database_updated):", parsed.database_updated);
    } else {
      console.error("Hiba történt az Edge Function hívása közben. Nyers válasz:", rawText);
    }
  } catch (error) {
    console.error("Végzetes hiba a lekérdezés során:", error);
  }
}

testQuery();
