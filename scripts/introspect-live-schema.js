#!/usr/bin/env node
/**
 * Read-only introspection of the live Supabase schema via the PostgREST
 * OpenAPI document. Prints every exposed table and its columns so schema
 * drift between `supabase/migrations/` and production can be detected.
 *
 * Usage: node scripts/introspect-live-schema.js
 */
const fs = require('fs');
const path = require('path');

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  const out = {};
  if (!fs.existsSync(envPath)) return out;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m && !out[m[1]]) out[m[1]] = m[2].trim();
  }
  return out;
}

async function main() {
  const env = loadEnv();
  const url = env.EXPO_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
  }

  const res = await fetch(`${url}/rest/v1/`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) {
    console.error(`Introspection failed: ${res.status} ${res.statusText}`);
    process.exit(1);
  }
  const spec = await res.json();
  const defs = spec.definitions || {};
  const names = Object.keys(defs).sort();

  console.log(`Live tables/views exposed by PostgREST (${names.length}):\n`);
  for (const name of names) {
    const props = defs[name].properties || {};
    console.log(`### ${name}`);
    for (const [col, meta] of Object.entries(props)) {
      const pk = /Primary Key/i.test(meta.description || '') ? ' [PK]' : '';
      const fk = (meta.description || '').match(/`([^`]+)`\.`([^`]+)`/);
      console.log(
        `   - ${col}: ${meta.format || meta.type}${pk}${fk ? ` -> ${fk[1]}.${fk[2]}` : ''}`
      );
    }
    console.log('');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
