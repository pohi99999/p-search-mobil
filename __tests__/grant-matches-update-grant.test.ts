// grant_matches: a signed-in user must not be able to rewrite match_score / match_reasoning / status on their own
// rows (20261029120000_grant_matches_revoke_update.sql). Replays the GRANT/REVOKE UPDATE statements of the
// migrations in file order and checks what anon/authenticated end up with; the app writes only through the
// set_match_feedback RPC.
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..');
const migrationsDir = join(root, 'supabase', 'migrations');

/** UPDATE on public.grant_matches per API role after all migrations, from the table-level GRANT/REVOKE statements. */
function updateGrantsAfterMigrations(): Record<string, boolean> {
  const state: Record<string, boolean> = { anon: false, authenticated: false };
  const stmt = /\b(grant|revoke)\s+([a-z_,\s]+?)\s+on\s+(?:table\s+)?public\.grant_matches\b\s*(?:\([^)]*\))?\s*(to|from)\s+([a-z_,\s]+?);/gi;
  for (const f of readdirSync(migrationsDir).filter((n) => n.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(migrationsDir, f), 'utf8').replace(/--.*$/gm, '');
    for (const m of sql.matchAll(stmt)) {
      const privileges = m[2].toLowerCase().split(',').map((p) => p.trim());
      if (!privileges.includes('update') && !privileges.includes('all')) continue;
      const on = m[1].toLowerCase() === 'grant';
      for (const role of m[4].toLowerCase().split(',').map((r) => r.trim())) {
        if (role in state) state[role] = on;
      }
    }
  }
  return state;
}

it('anon and authenticated end up without UPDATE on grant_matches', () => {
  expect(updateGrantsAfterMigrations()).toEqual({ anon: false, authenticated: false });
});

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) { if (!/__tests__/.test(e)) walk(p, out); }
    else if (/\.tsx?$/.test(e)) out.push(p);
  }
  return out;
}

it('the app never updates grant_matches directly; the feedback goes through the set_match_feedback RPC', () => {
  const files = walk(join(root, 'src'));
  const direct = files.filter((f) => /from\(\s*['"]grant_matches['"]\s*\)[\s\S]{0,200}?\.(update|upsert)\(/.test(readFileSync(f, 'utf8')));
  expect(direct).toEqual([]);
  const events = readFileSync(join(root, 'src', 'services', 'events.ts'), 'utf8');
  expect(events).toMatch(/rpc\(\s*'set_match_feedback'/);
});
