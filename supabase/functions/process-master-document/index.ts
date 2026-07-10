import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { GoogleGenerativeAI } from "npm:@google/generative-ai";

const allowedOrigin = Deno.env.get("ALLOWED_ORIGIN") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ---------------------------------------------------------------------------
// Structured JSON extraction prompt for Hungarian financial documents
// ---------------------------------------------------------------------------
const EXTRACTION_PROMPT = `Te egy precíz pénzügyi adatkinyerő AI rendszer vagy.
Az alábbi dokumentum egy magyar vállalkozás pénzügyi kimutatása (mérleg, főkönyv vagy éves beszámoló).

A feladatod: Olvasd ki pontosan az alábbi pénzügyi mutatókat a dokumentumból.
Válaszod KIZÁRÓLAG érvényes JSON objektum legyen — semmilyen extra szöveg, markdown vagy magyarázat NEM szerepelhet!

KINYERENDŐ ADATOK:
- net_revenue      : Nettó árbevétel (= Értékesítés nettó árbevétele) — egész szám, Ft-ban
- ebitda           : EBITDA — ha nem szerepel közvetlenül, számítsd ki:
                     Üzemi (üzleti) tevékenység eredménye + Értékcsökkenési leírás
                     — egész szám, Ft-ban
- equity           : Saját tőke összesen — egész szám, Ft-ban
- employee_count   : Statisztikai átlagos állományi létszám / Foglalkoztatottak száma — egész szám
- document_year    : A pénzügyi év éve (pl. 2023) — egész szám
- extraction_confidence : Az adatkinyerés megbízhatósága — "high" | "medium" | "low"
- notes            : Rövid megjegyzés a kinyerésről (pl. forrás, számítás módja, hiányzó adatok)

KÖTELEZŐ SZABÁLYOK:
1. Ha egy mező NEM TALÁLHATÓ a dokumentumban → értéke legyen null (soha ne találj ki adatot!)
2. Minden pénzügyi értéket egész számként adj meg (Ft), tizedespont NÉLKÜL
3. A kimenet CSAK a JSON objektum, semmi más
4. JSON kulcsok pontosan: net_revenue, ebitda, equity, employee_count, document_year, extraction_confidence, notes

Kötelező kimeneti formátum példa:
{
  "net_revenue": 45000000,
  "ebitda": 5200000,
  "equity": 12800000,
  "employee_count": 23,
  "document_year": 2023,
  "extraction_confidence": "high",
  "notes": "2023. évi éves beszámolóból. EBITDA = üzemi eredmény (4.1M) + értékcsökkentés (1.1M)."
}`;

// ---------------------------------------------------------------------------
// Accepted MIME types for document upload
// ---------------------------------------------------------------------------
const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "application/pdf",
];

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
serve(async (req) => {
  console.log(
    "process-master-document: kérés megérkezett. Metódus:",
    req.method,
  );

  if (req.method === "OPTIONS") {
    console.log("OPTIONS preflight lekezelve.");
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  // Service-role client — bypasses RLS for upsert operations
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  let docId: string | null = null;

  try {
    // ------------------------------------------------------------------
    // 1. Authorization header ellenőrzése
    // ------------------------------------------------------------------
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Hiányzó Authorization fejléc" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // ------------------------------------------------------------------
    // 2. JWT validálása — user identity kinyerése
    // ------------------------------------------------------------------
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false },
      },
    );
    const {
      data: { user },
      error: userError,
    } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      console.error("Hitelesítési hiba:", userError?.message);
      return new Response(
        JSON.stringify({ error: "Érvénytelen vagy lejárt token" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    console.log("Hitelesített felhasználó:", user.id);

    // ------------------------------------------------------------------
    // 3. Kérés törzs beolvasása és validálása
    // ------------------------------------------------------------------
    const body = await req.json();
    const { business_profile_id, file_base64, mime_type, file_name } = body as {
      business_profile_id?: string;
      file_base64?: string;
      mime_type?: string;
      file_name?: string;
    };

    if (!business_profile_id || !file_base64 || !mime_type) {
      return new Response(
        JSON.stringify({
          error:
            "Hiányzó kötelező mezők: business_profile_id, file_base64, mime_type",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!ALLOWED_MIME_TYPES.includes(mime_type)) {
      return new Response(
        JSON.stringify({
          error: `Nem támogatott fájltípus: ${mime_type}. Engedélyezettek: ${ALLOWED_MIME_TYPES.join(", ")}`,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // ------------------------------------------------------------------
    // 4. Ownership ellenőrzése — a profil valóban ehhez a userhez tartozik?
    // ------------------------------------------------------------------
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("business_profiles")
      .select("id, company_name, user_id")
      .eq("id", business_profile_id)
      .single();

    if (profileError || !profile) {
      console.error("Profil nem található:", profileError?.message);
      return new Response(
        JSON.stringify({ error: "Cégprofil nem található" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (profile.user_id !== user.id) {
      console.warn(
        `Jogosulatlan hozzáférés! Kérelmező: ${user.id}, Profil tulajdonos: ${profile.user_id}`,
      );
      return new Response(
        JSON.stringify({
          error: "Hozzáférés megtagadva — ez a profil nem a tied",
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    console.log(`Profil tulajdonos ellenőrizve: ${profile.company_name}`);

    // ------------------------------------------------------------------
    // 5. financial_documents rekord létrehozása 'processing' státusszal
    // ------------------------------------------------------------------
    const { data: docRecord, error: docInsertError } = await supabaseAdmin
      .from("financial_documents")
      .insert({
        business_profile_id,
        file_name: file_name ?? "feltoltott_dokumentum",
        document_type: "balance_sheet",
        processing_status: "processing",
      })
      .select("id")
      .single();

    if (docInsertError || !docRecord) {
      // Non-fatal — feldolgozást folytatjuk rekord nélkül is
      console.warn(
        "Dokumentum rekord létrehozás nem sikerült (non-fatal):",
        docInsertError?.message,
      );
    } else {
      docId = docRecord.id;
      console.log("Dokumentum rekord létrehozva, ID:", docId);
    }

    // ------------------------------------------------------------------
    // 6. Gemini Vision OCR — pénzügyi adatok kinyerése
    // ------------------------------------------------------------------
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey)
      throw new Error("GEMINI_API_KEY nincs beállítva a Supabase Secrets-ben");

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        temperature: 0.1, // Alacsony hőmérséklet = determinisztikus kinyerés
        maxOutputTokens: 1024,
        responseMimeType: "application/json",
      },
    });

    console.log(
      "Gemini Vision OCR hívás indítása. Fájl típus:",
      mime_type,
      "| Base64 méret (char):",
      file_base64.length,
    );

    const geminiResult = await model.generateContent([
      EXTRACTION_PROMPT,
      {
        inlineData: {
          mimeType: mime_type,
          data: file_base64,
        },
      },
    ]);

    const rawOcrText = geminiResult.response.text();
    console.log("Gemini OCR nyers válasz:", rawOcrText);

    // ------------------------------------------------------------------
    // 7. JSON parse és validálás
    // ------------------------------------------------------------------
    let extracted: Record<string, unknown> = {};
    try {
      extracted = JSON.parse(rawOcrText.trim());
    } catch (parseErr) {
      console.error(
        "JSON parse hiba a Gemini válaszban:",
        parseErr,
        "Nyers szöveg:",
        rawOcrText,
      );
      throw new Error(
        `A Gemini nem adott vissza érvényes JSON-t. Nyers válasz: ${rawOcrText.slice(0, 200)}`,
      );
    }
    console.log("Kinyert pénzügyi adatok:", JSON.stringify(extracted));

    // ------------------------------------------------------------------
    // 8. business_profiles upsert — csak érvényes (nem null) értékeket írunk
    // ------------------------------------------------------------------
    const profileUpdates: Record<string, unknown> = {
      raw_ocr_json: extracted,
      updated_at: new Date().toISOString(),
    };

    if (typeof extracted.net_revenue === "number")
      profileUpdates.net_revenue = extracted.net_revenue;
    if (typeof extracted.ebitda === "number")
      profileUpdates.ebitda = extracted.ebitda;
    if (typeof extracted.equity === "number")
      profileUpdates.equity = extracted.equity;
    if (typeof extracted.employee_count === "number")
      profileUpdates.employee_count = extracted.employee_count;

    console.log(
      "Cégprofil frissítése a következő mezőkkel:",
      Object.keys(profileUpdates).join(", "),
    );

    const { error: updateError } = await supabaseAdmin
      .from("business_profiles")
      .update(profileUpdates)
      .eq("id", business_profile_id);

    if (updateError) {
      throw new Error(`Adatbázis frissítés sikertelen: ${updateError.message}`);
    }
    console.log("Cégprofil sikeresen frissítve.");

    // ------------------------------------------------------------------
    // 9. financial_documents rekord 'completed' státuszra állítása
    // ------------------------------------------------------------------
    if (docId) {
      const { error: docUpdateError } = await supabaseAdmin
        .from("financial_documents")
        .update({
          processing_status: "completed",
          ocr_result: extracted,
          updated_at: new Date().toISOString(),
        })
        .eq("id", docId);

      if (docUpdateError) {
        console.warn(
          "Dokumentum státusz frissítési hiba (non-fatal):",
          docUpdateError.message,
        );
      } else {
        console.log("Dokumentum rekord 'completed' státuszra frissítve.");
      }
    }

    // ------------------------------------------------------------------
    // 10. Sikeres válasz
    // ------------------------------------------------------------------
    return new Response(
      JSON.stringify({
        success: true,
        document_id: docId,
        message: `${profile.company_name} pénzügyi adatai sikeresen feldolgozva és frissítve.`,
        extracted_data: {
          net_revenue: extracted.net_revenue ?? null,
          ebitda: extracted.ebitda ?? null,
          equity: extracted.equity ?? null,
          employee_count: extracted.employee_count ?? null,
          document_year: extracted.document_year ?? null,
          extraction_confidence: extracted.extraction_confidence ?? null,
          notes: extracted.notes ?? null,
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(
      "Végzetes hiba a process-master-document futása során:",
      errMsg,
    );

    // financial_documents rekord 'failed' státuszra állítása
    if (docId) {
      await supabaseAdmin
        .from("financial_documents")
        .update({
          processing_status: "failed",
          error_message: errMsg,
          updated_at: new Date().toISOString(),
        })
        .eq("id", docId);
      console.log("Dokumentum rekord 'failed' státuszra frissítve.");
    }

    return new Response(JSON.stringify({ error: errMsg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
