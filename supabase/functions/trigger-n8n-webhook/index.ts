
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedOrigin = Deno.env.get("ALLOWED_ORIGIN") || "*";

const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Dependency-injection seam so this handler can be exercised by Deno tests
// without hitting the network. Production usage (below, guarded by
// `import.meta.main`) always uses the real `createClient` from supabase-js
// and the real global `fetch`, so runtime behavior is unchanged.
export type CreateClientFn = typeof createClient
export type FetchFn = typeof fetch

export async function handler(
  req: Request,
  deps: { createClient: CreateClientFn; fetch: FetchFn } = { createClient, fetch }
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Nincs hitelesítési fejléc" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseClient = deps.createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Érvénytelen token vagy nem található felhasználó" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { business_id, action } = await req.json();

    if (!business_id || !action) {
       return new Response(JSON.stringify({ error: "Hiányzó paraméterek" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify the user owns the business profile
    const { data: businessProfile, error: profileError } = await supabaseClient
        .from("business_profiles")
        .select("id")
        .eq("id", business_id)
        .eq("user_id", user.id)
        .single();

    if (profileError || !businessProfile) {
        return new Response(JSON.stringify({ error: "Hozzáférés megtagadva" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }


    const n8nWebhookUrl = Deno.env.get("N8N_WEBHOOK_URL");
    if (!n8nWebhookUrl) {
        throw new Error("N8N_WEBHOOK_URL nincs beállítva");
    }

    const response = await deps.fetch(n8nWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        business_id: business_id,
        user_id: user.id,
        action: action
      })
    });

    if (!response.ok) {
       throw new Error(`N8N webhook hiba: ${response.status} ${response.statusText}`);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (err: any) {
    console.error("Végzetes hiba:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
}

// Only start the real HTTP listener when this file is the entry point
// (i.e. when Supabase's Edge Runtime executes it directly). When the module
// is imported from a test, `import.meta.main` is false, so no server binds
// to a port and `handler` can be invoked directly with a synthetic Request.
//
// Wrapped (not passed directly) because Deno's serve() calls its handler
// with a second (ConnInfo) argument -- passing `handler` directly would let
// that argument silently override `deps`'s default value, breaking
// `deps.createClient`/`deps.fetch` in production. The wrapper forwards only
// `req`.
if (import.meta.main) {
  serve((req) => handler(req));
}
