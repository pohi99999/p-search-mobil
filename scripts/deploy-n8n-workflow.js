const fs = require('fs');
const path = require('path');

// 1. .env beolvasása manuálisan, hogy ne függjünk a dotenv package-től
const envPath = path.join(__dirname, '../.env');
const env = {};
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf-8');
  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const parts = trimmed.split('=');
      const key = parts[0].trim();
      const value = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
      env[key] = value;
    }
  });
}

// Környezeti változók kinyerése
const N8N_HOST = env.N8N_HOST || process.env.N8N_HOST;
const N8N_API_KEY = env.N8N_API_KEY || process.env.N8N_API_KEY;
const SUPABASE_URL = env.SUPABASE_URL || process.env.SUPABASE_URL || env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Ellenőrzés
if (!N8N_HOST || !N8N_API_KEY) {
  console.error("Hiba: Hiányzó n8n konfiguráció a .env fájlban (N8N_HOST, N8N_API_KEY)!");
  process.exit(1);
}
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Hiba: Hiányzó Supabase konfiguráció a .env fájlban (SUPABASE_URL, SUPABASE_ANON_KEY)!");
  process.exit(1);
}

console.log("Konfigurációk sikeresen beolvasva.");
console.log(`n8n Host: ${N8N_HOST}`);
console.log(`Supabase URL: ${SUPABASE_URL}`);

// 2. Sablon beolvasása
const templatePath = path.join(__dirname, '../docs/n8n-workflow-template.json');
if (!fs.existsSync(templatePath)) {
  console.error(`Hiba: A sablon fájl nem található a következő helyen: ${templatePath}`);
  process.exit(1);
}

let templateContent = fs.readFileSync(templatePath, 'utf-8');

// 3. Dinamikus helyettesítés a sablonban
const oldUrl = "https://YOUR_SUPABASE_PROJECT.supabase.co/functions/v1/ingest-n8n-grants";
const newUrl = `${SUPABASE_URL}/functions/v1/ingest-n8n-grants`;
templateContent = templateContent.replace(oldUrl, newUrl);

const oldKey = "Bearer YOUR_SUPABASE_ANON_KEY";
const newKey = `Bearer ${SUPABASE_ANON_KEY}`;
templateContent = templateContent.replace(oldKey, newKey);

console.log("JSON sablon sikeresen személyre szabva a környezeti változókkal.");

const workflowData = JSON.parse(templateContent);

// 4. POST kérés összeállítása az n8n API felé
const cleanHost = N8N_HOST.replace(/\/$/, "");
const apiUrl = `${cleanHost}/api/v1/workflows`;

console.log(`Új munkafolyamat létrehozása az n8n API-n keresztül: ${apiUrl}`);

const urlObj = new URL(apiUrl);
const postData = JSON.stringify({
  name: workflowData.name || "Grant Ingestion to Supabase (Automated)",
  nodes: workflowData.nodes,
  connections: workflowData.connections,
  settings: workflowData.settings
});

const options = {
  hostname: urlObj.hostname,
  port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
  path: urlObj.pathname,
  method: 'POST',
  headers: {
    'X-N8N-API-KEY': N8N_API_KEY,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

const client = urlObj.protocol === 'https:' ? require('https') : require('http');

const req = client.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => {
    body += chunk;
  });

  res.on('end', () => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      try {
        const responseData = JSON.parse(body);
        console.log("\n=============================================");
        console.log("Sikeres n8n workflow telepítés!");
        console.log(`Workflow ID: ${responseData.id}`);
        console.log(`Workflow Név: ${responseData.name}`);
        console.log(`Aktív: ${responseData.active}`);
        console.log("=============================================\n");
        
        // Mentjük a telepítési státuszt a status.log fájlba
        const logContent = `Dátum: ${new Date().toISOString()}
Státusz: SIKERES
Workflow ID: ${responseData.id}
Workflow Név: ${responseData.name}
n8n Host: ${N8N_HOST}
Supabase Project URL: ${SUPABASE_URL}
`;
        fs.writeFileSync(path.join(__dirname, '../status.log'), logContent);
        console.log("status.log fájl sikeresen létrehozva.");
      } catch (err) {
        console.error("Hiba a válasz feldolgozásakor:", err);
        console.log("Válasz body:", body);
        process.exit(1);
      }
    } else {
      console.error(`Hiba a telepítés során! HTTP státuszkód: ${res.statusCode}`);
      console.error("Válasz body:", body);
      process.exit(1);
    }
  });
});

req.on('error', (e) => {
  console.error(`Hiba a kérés elküldésekor: ${e.message}`);
  process.exit(1);
});

req.write(postData);
req.end();
