import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateEmbedding } from "../_shared/gemini.ts";

const allowedOrigin = Deno.env.get("ALLOWED_ORIGIN") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Length-independent, constant-time string comparison. Prevents an attacker
 * from recovering the shared webhook secret one character at a time by
 * measuring how long a rejected request takes.
 */
function secureCompare(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);

  // Fold the length difference into the result instead of returning early,
  // so comparison cost does not depend on where the first mismatch is.
  let mismatch = aBytes.length ^ bBytes.length;
  const max = Math.max(aBytes.length, bBytes.length);
  for (let i = 0; i < max; i++) {
    mismatch |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }
  return mismatch === 0;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const expectedKey = Deno.env.get("N8N_WEBHOOK_SECRET");

    // n8n may send the shared secret either bare, or prefixed with the
    // standard HTTP authorization scheme keyword. Both forms are accepted,
    // and compared in constant time so the secret cannot be recovered via
    // response-timing differences.
    const presentedKey = (authHeader ?? "").replace(/^Bearer\s+/i, "").trim();

    if (!authHeader || !expectedKey || !secureCompare(presentedKey, expectedKey)) {
      return new Response(
        JSON.stringify({
          error: "Nincs hitelesítési fejléc vagy érvénytelen kulcs",
        }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Initialize Supabase with service role key to bypass RLS
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseClient = createClient(supabaseUrl, supabaseKey);

    const payload = await req.json();
    const {
      title,
      description,
      provider,
      grant_type,
      amount_min,
      amount_max,
      deadline,
      eligibility_criteria,
      source_url,
    } = payload;

    if (!title) {
      return new Response(
        JSON.stringify({ error: "A title (cím) megadása kötelező" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 1. Insert main grant record
    const { data: grantData, error: grantError } = await supabaseClient
      .from("grants")
      .insert({
        title,
        description,
        provider,
        grant_type,
        amount_min,
        amount_max,
        deadline,
        eligibility_criteria,
        source_url,
      })
      .select("id")
      .single();

    if (grantError) {
      throw new Error(`Hiba a pályázat rögzítésekor: ${grantError.message}`);
    }

    const grantId = grantData.id;
    let chunksInserted = 0;

    // 2. Chunking the description
    if (description && typeof description === "string") {
      // Chunking by logical paragraphs (double newline)
      const paragraphs = description
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter((p) => p.length > 0);

      if (paragraphs.length > 0) {
        // Initialize Gemini
        const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
        if (!geminiApiKey) {
          console.warn(
            "GEMINI_API_KEY hiányzik, az embedding generálás sikertelen lesz.",
          );
        } else {
          const chunksToInsert = [];

          for (const chunkText of paragraphs) {
            try {
              const embedding = await generateEmbedding(chunkText, geminiApiKey);

              chunksToInsert.push({
                grant_id: grantId,
                content: chunkText,
                embedding: embedding,
              });
            } catch (embedError: any) {
              // Handle specific Google API errors
              console.error(
                "Hiba az embedding generálásakor:",
                embedError.message,
              );

              const status = embedError.status || embedError.response?.status;
              if (status === 503) {
                console.error("Google Generative AI API túlterhelt (503).");
              } else if (status === 400) {
                console.error(
                  "Érvénytelen kérés a Google Generative AI API felé (400).",
                );
              }
              // Folytatjuk a többi chunk-kal, nem szakítjuk meg teljesen
            }
          }

          if (chunksToInsert.length > 0) {
            const { error: chunkError } = await supabaseClient
              .from("grant_chunks")
              .insert(chunksToInsert);

            if (chunkError) {
              console.error(
                `Hiba a chunkok rögzítésekor: ${chunkError.message}`,
              );
            } else {
              chunksInserted = chunksToInsert.length;
            }
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        message: "Pályázat sikeresen rögzítve",
        grant_id: grantId,
        chunks_inserted: chunksInserted,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (err: any) {
    // Logged server-side in full, but never returned to the caller: the
    // message can contain Supabase/Gemini internals and connection strings.
    console.error("Végzetes hiba a webhook feldolgozása során:", err);
    return new Response(
      JSON.stringify({ error: "Belső hiba történt a feldolgozás során." }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
});
