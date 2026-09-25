// backfill-grant-chunks: chunk + embed every grant that has no grant_chunks row yet.
//
// Why (kanban: grant_chunks 5/63, 2026-09-25): 62 of 63 grants were inserted by
// scripts/ingest-grants without the chunk+embed step, and match_grant_chunks only
// searches chunks, so matching could reach ONE grant. This function closes that
// gap idempotently: a grant that already has chunks is never touched.
//
// Gate: the caller must send the service-role key as the bearer (admin job, not a
// user action). Body: {"dry_run": true} returns the plan and writes nothing;
// {"dry_run": false} embeds and inserts. `limit` caps the grants per call.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateEmbedding } from "../_shared/gemini.ts";
import { chunkGrant, type GrantTextRow } from "../_shared/grant-chunking.ts";

export type CreateClientFn = (url: string, key: string) => SupabaseClient;
export type EmbedFn = (text: string, apiKey: string) => Promise<number[]>;

export interface Deps {
  createClient: CreateClientFn;
  embed: EmbedFn;
  env: (name: string) => string | undefined;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export async function handler(req: Request, deps: Deps): Promise<Response> {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const serviceKey = deps.env("SUPABASE_SERVICE_ROLE_KEY");
  const auth = req.headers.get("Authorization") ?? "";
  if (!serviceKey || auth !== `Bearer ${serviceKey}`) {
    return json({ error: "service role bearer required" }, 401);
  }
  let body: { dry_run?: boolean; limit?: number } = {};
  try { body = await req.json(); } catch { body = {}; }
  const dryRun = body.dry_run !== false; // default: dry run -- writing is the explicit choice
  const limit = Math.max(1, Math.min(500, Number(body.limit) || 500));

  const supabase = deps.createClient(deps.env("SUPABASE_URL") ?? "", serviceKey);
  const { data: covered, error: coveredErr } = await supabase.from("grant_chunks").select("grant_id");
  if (coveredErr) return json({ error: `grant_chunks read failed: ${coveredErr.message}` }, 500);
  const coveredIds = new Set((covered ?? []).map((r: { grant_id: string }) => r.grant_id));
  const { data: grants, error: grantsErr } = await supabase
    .from("grants")
    .select("id,title,provider,grant_type,amount_min,amount_max,deadline,description,eligibility_criteria");
  if (grantsErr) return json({ error: `grants read failed: ${grantsErr.message}` }, 500);

  const todo = ((grants ?? []) as GrantTextRow[]).filter((g) => !coveredIds.has(g.id)).slice(0, limit);
  const plan = todo.map((g) => ({ grant_id: g.id, title: g.title ?? null, chunks: chunkGrant(g).length }));
  const totalChunks = plan.reduce((n, p) => n + p.chunks, 0);
  if (dryRun) {
    return json({ dry_run: true, grants_total: (grants ?? []).length, grants_covered: coveredIds.size, grants_to_backfill: plan.length, chunks_planned: totalChunks, plan });
  }

  const geminiApiKey = deps.env("GEMINI_API_KEY");
  if (!geminiApiKey) return json({ error: "GEMINI_API_KEY missing" }, 500);
  let inserted = 0; const failed: { grant_id: string; error: string }[] = [];
  for (const g of todo) {
    const rows: { grant_id: string; content: string; embedding: number[]; metadata: Record<string, unknown> }[] = [];
    try {
      const chunks = chunkGrant(g);
      for (let i = 0; i < chunks.length; i++) {
        const embedding = await deps.embed(chunks[i], geminiApiKey);
        rows.push({ grant_id: g.id, content: chunks[i], embedding, metadata: { source: "backfill-grant-chunks", index: i, total: chunks.length } });
      }
      if (rows.length === 0) continue;
      const { error } = await supabase.from("grant_chunks").insert(rows);
      if (error) throw new Error(error.message);
      inserted += rows.length;
    } catch (e) {
      failed.push({ grant_id: g.id, error: (e as Error).message });
    }
  }
  return json({ dry_run: false, grants_to_backfill: plan.length, chunks_planned: totalChunks, chunks_inserted: inserted, failed });
}

if (import.meta.main) {
  serve((req) => handler(req, { createClient, embed: generateEmbedding, env: (n) => Deno.env.get(n) }));
}
