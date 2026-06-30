const fs    = require('fs');
const path  = require('path');
const http  = require('http');
const https = require('https');

// ─────────────────────────────────────────────────────────────
// 1. Manual .env loading (no dotenv dependency)
// ─────────────────────────────────────────────────────────────
const envPath = path.join(__dirname, '../.env');
const env = {};
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
    const t = line.trim();
    if (t && !t.startsWith('#') && t.includes('=')) {
      const idx = t.indexOf('=');
      env[t.slice(0, idx).trim()] = t.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
    }
  });
}

const N8N_HOST           = env.N8N_HOST           || process.env.N8N_HOST;
const N8N_API_KEY        = env.N8N_API_KEY         || process.env.N8N_API_KEY;
const N8N_OWNER_EMAIL    = env.N8N_OWNER_EMAIL     || process.env.N8N_OWNER_EMAIL;
const N8N_OWNER_PASSWORD = env.N8N_OWNER_PASSWORD  || process.env.N8N_OWNER_PASSWORD;
const SUPABASE_URL       = env.SUPABASE_URL        || env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY  = env.SUPABASE_ANON_KEY   || env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const N8N_WEBHOOK_SECRET = env.N8N_WEBHOOK_SECRET  || process.env.N8N_WEBHOOK_SECRET;
const EXISTING_WF_ID     = 'DNE7Xod35VnFeR6t';

if (!N8N_HOST) { console.error('Hiba: N8N_HOST hianyzik!'); process.exit(1); }
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) { console.error('Hiba: Supabase config hianyzik!'); process.exit(1); }

console.log('════════════════════════════════════════════════════');
console.log(' P-Search: n8n Workflow Deployment Script (v3)');
console.log('════════════════════════════════════════════════════');
console.log(`n8n Host:     ${N8N_HOST}`);
console.log(`Supabase URL: ${SUPABASE_URL}`);
console.log(`Target WF ID: ${EXISTING_WF_ID}`);
console.log('');

// ─────────────────────────────────────────────────────────────
// 2. Load + personalise workflow template
// ─────────────────────────────────────────────────────────────
const templatePath = path.join(__dirname, '../docs/n8n-workflow-template.json');
if (!fs.existsSync(templatePath)) { console.error('Sablon nem talalhato:', templatePath); process.exit(1); }
let tmpl = fs.readFileSync(templatePath, 'utf-8');
tmpl = tmpl.replace('https://YOUR_SUPABASE_PROJECT.supabase.co/functions/v1/ingest-n8n-grants',
                    `${SUPABASE_URL}/functions/v1/ingest-n8n-grants`);
tmpl = tmpl.replace('N8N_WEBHOOK_SECRET_PLACEHOLDER', N8N_WEBHOOK_SECRET || SUPABASE_ANON_KEY);
tmpl = tmpl.replace('SUPABASE_ANON_KEY_PLACEHOLDER', SUPABASE_ANON_KEY);
const wfData = JSON.parse(tmpl);
console.log(`Sablon személyre szabva: "${wfData.name}"`);
console.log(`Csomópontok: ${wfData.nodes.map(n => n.name).join(' → ')}\n`);

// ─────────────────────────────────────────────────────────────
// 3. HTTP helper (returns { statusCode, headers, body })
// ─────────────────────────────────────────────────────────────
function request(options, body) {
  return new Promise((resolve, reject) => {
    const mod = options.protocol === 'https:' ? https : http;
    const req = mod.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function opts(urlStr, method, extraHeaders, bodyLen) {
  const u = new URL(urlStr);
  return {
    protocol: u.protocol, hostname: u.hostname,
    port: u.port || (u.protocol === 'https:' ? 443 : 80),
    path: u.pathname + u.search, method,
    headers: { 'Content-Type': 'application/json',
               ...(bodyLen ? { 'Content-Length': bodyLen } : {}), ...extraHeaders },
  };
}

// ─────────────────────────────────────────────────────────────
// 4. Auth: Strategy A = X-N8N-API-KEY; Strategy B = email/password session cookie
// ─────────────────────────────────────────────────────────────
async function getAuth(base) {
  // Strategy A: stored API key
  if (N8N_API_KEY) {
    console.log('[Auth] Strategy A: X-N8N-API-KEY...');
    const p = await request(opts(`${base}/api/v1/workflows?limit=1`, 'GET', {'X-N8N-API-KEY': N8N_API_KEY}), null).catch(() => null);
    if (p && p.statusCode === 200) { console.log('[Auth] Strategy A OK'); return { type: 'apikey', headers: {'X-N8N-API-KEY': N8N_API_KEY} }; }
    console.log(`[Auth] Strategy A failed (${p?.statusCode})`);
  }

  // Strategy B: session cookie via owner login
  if (N8N_OWNER_EMAIL && N8N_OWNER_PASSWORD) {
    console.log('[Auth] Strategy B: email/password session...');
    const lb = JSON.stringify({ emailOrLdapLoginId: N8N_OWNER_EMAIL, password: N8N_OWNER_PASSWORD });
    const lr = await request(opts(`${base}/rest/login`, 'POST', {}, Buffer.byteLength(lb)), lb).catch(() => null);
    if (lr && lr.statusCode === 200) {
      const cookies = (lr.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
      if (cookies) { console.log('[Auth] Strategy B OK — session cookie'); return { type: 'cookie', headers: { Cookie: cookies } }; }
    }
    console.log(`[Auth] Strategy B failed (${lr?.statusCode}): ${(lr?.body||'').slice(0,80)}`);
  }
  return { type: 'none', headers: {} };
}

// ─────────────────────────────────────────────────────────────
// 5. Deploy: cookie→PATCH /rest/workflows/:id; apikey→PUT /api/v1/; POST fallback
// ─────────────────────────────────────────────────────────────
async function deploy() {
  const base = N8N_HOST.replace(/\/$/, '');
  const auth = await getAuth(base);

  const payload = JSON.stringify({
    name: wfData.name, nodes: wfData.nodes,
    connections: wfData.connections, settings: wfData.settings, active: wfData.active,
  });
  const pLen = Buffer.byteLength(payload);

  // Primary: session cookie → PATCH internal REST (most reliable with password auth)
  if (auth.type === 'cookie') {
    console.log(`\n[Deploy] PATCH /rest/workflows/${EXISTING_WF_ID} (session)...`);
    const r = await request(opts(`${base}/rest/workflows/${EXISTING_WF_ID}`, 'PATCH', auth.headers, pLen), payload);
    if (r.statusCode >= 200 && r.statusCode < 300) return success(r.body, 'PATCH /rest', auth.type);
    console.log(`[Deploy] PATCH failed (${r.statusCode}): ${r.body.slice(0,120)}`);

    // Fallback: POST to create new via internal REST
    console.log('[Deploy] POST /rest/workflows (create new)...');
    const r2 = await request(opts(`${base}/rest/workflows`, 'POST', auth.headers, pLen), payload);
    if (r2.statusCode >= 200 && r2.statusCode < 300) return success(r2.body, 'POST /rest', auth.type);
    console.log(`[Deploy] POST failed (${r2.statusCode}): ${r2.body.slice(0,120)}`);
  }

  // Alt: API key → PUT /api/v1/workflows/:id
  if (auth.type === 'apikey') {
    console.log(`\n[Deploy] PUT /api/v1/workflows/${EXISTING_WF_ID} (api key)...`);
    const r = await request(opts(`${base}/api/v1/workflows/${EXISTING_WF_ID}`, 'PUT', auth.headers, pLen), payload);
    if (r.statusCode >= 200 && r.statusCode < 300) return success(r.body, 'PUT /api/v1', auth.type);
    console.log(`[Deploy] PUT failed (${r.statusCode})`);

    console.log('[Deploy] POST /api/v1/workflows (create)...');
    const r2 = await request(opts(`${base}/api/v1/workflows`, 'POST', auth.headers, pLen), payload);
    if (r2.statusCode >= 200 && r2.statusCode < 300) return success(r2.body, 'POST /api/v1', auth.type);
  }

  // No auth — error with guidance
  console.error('\n[Deploy] Hiba: Hitelesítés nem sikerült.');
  console.error('Megoldás: n8n UI > Settings > API > Új API kulcs generálása,');
  console.error(`          majd frissítsd az N8N_API_KEY értéket: ${base}`);
  process.exit(1);
}

function success(bodyStr, method, authType) {
  const raw = JSON.parse(bodyStr);
  const wf  = raw.data || raw;
  console.log('\n════════════════════════════════════════════════════');
  console.log(' Sikeres n8n workflow deploy!');
  console.log('════════════════════════════════════════════════════');
  console.log(`  Workflow ID:  ${wf.id}`);
  console.log(`  Name:         ${wf.name}`);
  console.log(`  Active:       ${wf.active}`);
  console.log(`  Node count:   ${(wf.nodes||[]).length}`);
  console.log(`  Method:       ${method} (auth: ${authType})`);
  console.log('════════════════════════════════════════════════════\n');

  const log = [
    `Datum: ${new Date().toISOString()}`,
    `Statusz: SIKERES`,
    `Workflow ID: ${wf.id}`,
    `Workflow Nev: ${wf.name}`,
    `Method: ${method}`,
    `n8n Host: ${N8N_HOST}`,
    `Supabase URL: ${SUPABASE_URL}`,
  ].join('\n');
  fs.writeFileSync(path.join(__dirname, '../status.log'), log, 'utf-8');
  console.log('status.log frissitve.');
}

deploy().catch(e => { console.error('Vegzetes hiba:', e.message); process.exit(1); });