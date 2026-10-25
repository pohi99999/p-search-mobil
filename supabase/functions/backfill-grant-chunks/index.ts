// backfill-grant-chunks: chunk + embed every grant that has no grant_chunks row yet.
//
// Why (kanban: grant_chunks 5/63, 2026-09-25): 62 of 63 grants were inserted by
// scripts/ingest-grants without the chunk+embed step, and match_grant_chunks only
// searches chunks, so matching could reach ONE grant. This function closes that
// gap idempotently: a grant that already has chunks is never touched.
//
// Gate: the bearer must equal the runtime's SUPABASE_SERVICE_ROLE_KEY (admin job, not a user action). On this
// project that is the new secret key (sb_secret_...), not the legacy service_role JWT: the legacy JWT gets 401
// (measured 2026-10-25, Brunella 4889). Body: {"dry_run": true} returns the plan and writes nothing;
// {"dry_run": false} embeds and inserts. `limit` caps the grants per call.
//
// Regenerate (Irisz 4868 (a), Brunella 4872): the default mode never touches a grant that already has chunks,
// so a chunk written from older grant values (BAY_VOUCHER: a 2026-09-30 deadline) stays. Body
// {"mode": "regenerate", "grant_ids": [...]} rebuilds the chunks of exactly those grants from today's row.
// It is a dry run unless "dry_run": false, and the dry run lists the chunk ids it would delete and the texts it
// would write. Writing inserts the new chunks first and deletes the old ones only after that succeeded, so a
// failed grant keeps its old chunks (at worst both, reported), never none.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateEmbedding, GeminiUnavailableError } from "../_shared/gemini.ts";
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
  let body: { dry_run?: boolean; limit?: number; mode?: string; grant_ids?: unknown; max_embeds?: unknown } = {};
  try { body = await req.json(); } catch { body = {}; }
  const dryRun = body.dry_run !== false; // default: dry run -- writing is the explicit choice
  const limit = Math.max(1, Math.min(500, Number(body.limit) || 500));

  const supabase = deps.createClient(deps.env("SUPABASE_URL") ?? "", serviceKey);
  if (body.mode === "regenerate") return regenerate(supabase, deps, body.grant_ids, body.max_embeds, dryRun);
  if (body.mode !== undefined) return json({ error: `unknown mode: ${String(body.mode)}` }, 400);
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

const GRANT_COLUMNS = "id,title,provider,grant_type,amount_min,amount_max,deadline,description,eligibility_criteria";
export const REGENERATE_MAX_GRANTS = 100;
/**
 * Embedding calls one regenerate run may spend (Brunella 4897/4908, Irisz 4895). Measured 2026-10-25: the limit is per
 * minute, quotaId EmbedContentRequestsPerMinutePerProjectPerModel-FreeTier, 100 (function_logs 13:24:59Z), and the users'
 * searches share it. One call stays under it; the next call can follow after a minute.
 */
export const REGENERATE_DEFAULT_MAX_EMBEDS = 90;
export const REGENERATE_MAX_EMBEDS_LIMIT = 100;

async function regenerate(supabase: SupabaseClient, deps: Deps, rawIds: unknown, rawMaxEmbeds: unknown, dryRun: boolean): Promise<Response> {
  if (!Array.isArray(rawIds) || rawIds.length === 0 || !rawIds.every((x) => typeof x === "string" && x.length > 0)) {
    return json({ error: "regenerate needs grant_ids: a non-empty list of grant ids" }, 400);
  }
  const ids = Array.from(new Set(rawIds as string[]));
  if (ids.length > REGENERATE_MAX_GRANTS) return json({ error: `at most ${REGENERATE_MAX_GRANTS} grant_ids per call` }, 400);
  const maxEmbeds = rawMaxEmbeds === undefined ? REGENERATE_DEFAULT_MAX_EMBEDS : rawMaxEmbeds;
  if (typeof maxEmbeds !== "number" || !Number.isInteger(maxEmbeds) || maxEmbeds < 1 || maxEmbeds > REGENERATE_MAX_EMBEDS_LIMIT) {
    return json({ error: `max_embeds must be a whole number from 1 to ${REGENERATE_MAX_EMBEDS_LIMIT}` }, 400);
  }

  const { data: grants, error: grantsErr } = await supabase.from("grants").select(GRANT_COLUMNS).in("id", ids);
  if (grantsErr) return json({ error: `grants read failed: ${grantsErr.message}` }, 500);
  const { data: existing, error: chunksErr } = await supabase.from("grant_chunks").select("id,grant_id").in("grant_id", ids);
  if (chunksErr) return json({ error: `grant_chunks read failed: ${chunksErr.message}` }, 500);

  const found = (grants ?? []) as GrantTextRow[];
  const notFound = ids.filter((id) => !found.some((g) => g.id === id));
  const plan = found.map((g) => ({
    grant_id: g.id,
    title: g.title ?? null,
    delete_chunk_ids: ((existing ?? []) as { id: string; grant_id: string }[]).filter((c) => c.grant_id === g.id).map((c) => c.id),
    new_chunks: chunkGrant(g),
  }));
  // The grants that fit in max_embeds, in order; a grant is taken whole or not at all, so the budget never leaves one
  // half embedded.
  let budgetUsed = 0;
  let overAt = plan.length;
  for (const [i, p] of plan.entries()) {
    if (budgetUsed + p.new_chunks.length > maxEmbeds) { overAt = i; break; }
    budgetUsed += p.new_chunks.length;
  }
  const summary = {
    mode: "regenerate",
    grants_requested: ids.length,
    not_found: notFound,
    chunks_to_delete: plan.reduce((n, p) => n + p.delete_chunk_ids.length, 0),
    chunks_to_write: plan.reduce((n, p) => n + p.new_chunks.length, 0),
    max_embeds: maxEmbeds,
    embeds_in_this_run: budgetUsed,
    grants_in_this_run: plan.slice(0, overAt).map((p) => p.grant_id),
    grants_over_budget: plan.slice(overAt).map((p) => p.grant_id),
  };
  if (dryRun) return json({ dry_run: true, ...summary, plan });

  const geminiApiKey = deps.env("GEMINI_API_KEY");
  if (!geminiApiKey) return json({ error: "GEMINI_API_KEY missing" }, 500);
  let inserted = 0, deleted = 0;
  const failed: { grant_id: string; stage: string; error: string }[] = [];
  // Brunella 4894/4908: on 2026-10-25 the per-minute embedding quota ran out mid-run (429), and every later grant would
  // only have hit 429 again. The run stops at the first quota error; remaining_grant_ids (that grant and the ones
  // not reached) is the list for the next call.
  let remaining: string[] = summary.grants_over_budget;
  let stoppedReason: string | null = remaining.length > 0 ? "max_embeds" : null;
  let quotaId: string | null = null;
  for (const [index, p] of plan.slice(0, overAt).entries()) {
    // A grant whose row gives no chunk keeps the old ones: deleting them would leave it unsearchable.
    if (p.new_chunks.length === 0) { failed.push({ grant_id: p.grant_id, stage: "chunk", error: "no chunk from the current row, old chunks kept" }); continue; }
    let stage = "embed";
    try {
      const rows = [];
      for (let i = 0; i < p.new_chunks.length; i++) {
        const embedding = await deps.embed(p.new_chunks[i], geminiApiKey);
        rows.push({ grant_id: p.grant_id, content: p.new_chunks[i], embedding, metadata: { source: "backfill-grant-chunks:regenerate", index: i, total: p.new_chunks.length } });
      }
      stage = "insert";
      const { error: insErr } = await supabase.from("grant_chunks").insert(rows);
      if (insErr) throw new Error(insErr.message);
      inserted += rows.length;
      if (p.delete_chunk_ids.length > 0) {
        stage = "delete";
        const { error: delErr } = await supabase.from("grant_chunks").delete().in("id", p.delete_chunk_ids);
        if (delErr) throw new Error(delErr.message);
        deleted += p.delete_chunk_ids.length;
      }
    } catch (e) {
      failed.push({ grant_id: p.grant_id, stage, error: (e as Error).message });
      if (e instanceof GeminiUnavailableError && e.status === 429) {
        stoppedReason = "gemini_quota";
        quotaId = e.quotaId;
        remaining = plan.slice(index).map((r) => r.grant_id);  // includes the over-budget ones
        break;
      }
    }
  }
  return json({
    dry_run: false, ...summary, chunks_inserted: inserted, chunks_deleted: deleted, failed,
    stopped_reason: stoppedReason, quota_id: quotaId, remaining_grant_ids: remaining,
  });
}

if (import.meta.main) {
  serve((req) => handler(req, { createClient, embed: generateEmbedding, env: (n) => Deno.env.get(n) }));
}
