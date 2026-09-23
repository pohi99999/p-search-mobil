import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// delete-account: removes the CALLING user's own data and auth account.
//
// Google Play requires an in-app account deletion for apps with account
// creation. The user id comes ONLY from the verified JWT (never from the
// request body), so a user can delete nothing but their own rows.
//
// Live schema (measured 2026-09-23, kanban 841f0376) and the order it forces:
//   grant_matches.business_id  -> business_profiles.id  [NO ACTION]  => delete first
//   business_profiles.user_id  -> profiles.id           [NO ACTION]  => before profiles
//     action_plans / financial_documents -> business_profiles [CASCADE]
//     action_tasks -> action_plans [CASCADE]
//   profiles.id -> auth.users.id                         [NO ACTION]  => before auth user
//   processed_webhook_events: no user link, kept on purpose (purchase audit trail).
//   storage: no buckets exist, nothing to remove.

const allowedOrigin = Deno.env.get("ALLOWED_ORIGIN") || "*";

const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export type CreateClientFn = typeof createClient;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

export async function handler(
  req: Request,
  deps: { createClient: CreateClientFn } = { createClient },
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json(405, { error: "Csak POST" });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json(401, { error: "Nincs hitelesítési fejléc" });
    }

    const userClient = deps.createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return json(401, { error: "Érvénytelen token vagy nem található felhasználó" });
    }

    // Explicit confirmation in the body guards against accidental calls from
    // a mistyped invoke(); the real safeguard is the UI confirmation.
    let body: { confirm?: unknown } = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    if (body.confirm !== true) {
      return json(400, { error: "Hiányzó megerősítés (confirm: true)" });
    }

    const admin = deps.createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deps_serviceRoleKey(),
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const uid = user.id;
    const removed: Record<string, number> = {};

    // 1) business profile ids of THIS user
    const { data: businesses, error: bErr } = await admin
      .from("business_profiles")
      .select("id")
      .eq("user_id", uid);
    if (bErr) throw new Error(`business_profiles lekérés: ${bErr.message}`);
    const businessIds: string[] = (businesses ?? []).map((b: { id: string }) => b.id);

    // 2) grant_matches (NO ACTION FK, must go before business_profiles)
    if (businessIds.length > 0) {
      const { data, error } = await admin
        .from("grant_matches")
        .delete()
        .in("business_id", businessIds)
        .select("id");
      if (error) throw new Error(`grant_matches törlés: ${error.message}`);
      removed.grant_matches = (data ?? []).length;
    } else {
      removed.grant_matches = 0;
    }

    // 3) business_profiles (cascades: action_plans -> action_tasks, financial_documents)
    {
      const { data, error } = await admin
        .from("business_profiles")
        .delete()
        .eq("user_id", uid)
        .select("id");
      if (error) throw new Error(`business_profiles törlés: ${error.message}`);
      removed.business_profiles = (data ?? []).length;
    }

    // 4) profiles (NO ACTION FK to auth.users, must go before the auth user)
    {
      const { data, error } = await admin
        .from("profiles")
        .delete()
        .eq("id", uid)
        .select("id");
      if (error) throw new Error(`profiles törlés: ${error.message}`);
      removed.profiles = (data ?? []).length;
    }

    // 5) the auth user itself
    const { error: delErr } = await admin.auth.admin.deleteUser(uid);
    if (delErr) throw new Error(`auth user törlés: ${delErr.message}`);

    // Post-condition: nothing of this user is left in the two root tables.
    const { count: leftProfiles } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("id", uid);
    const { count: leftBusinesses } = await admin
      .from("business_profiles")
      .select("id", { count: "exact", head: true })
      .eq("user_id", uid);
    if ((leftProfiles ?? 0) > 0 || (leftBusinesses ?? 0) > 0) {
      throw new Error(`utóellenőrzés: profiles=${leftProfiles} business_profiles=${leftBusinesses}`);
    }

    console.log(`delete-account: user ${uid} removed`, removed);
    return json(200, { deleted: true, removed });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("delete-account hiba:", message);
    return json(500, { error: message });
  }
}

function Deps_serviceRoleKey(): string {
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY nincs beállítva");
  return key;
}

if (import.meta.main) {
  serve((req) => handler(req));
}
