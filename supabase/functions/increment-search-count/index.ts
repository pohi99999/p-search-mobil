import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const allowedOrigin = Deno.env.get('ALLOWED_ORIGIN') || '*';

const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Dependency-injection seam so this handler can be exercised by Deno tests
// without hitting the network. Production usage (below, guarded by
// `import.meta.main`) always uses the real `createClient` from supabase-js,
// so runtime behavior is unchanged.
export type CreateClientFn = typeof createClient

export async function handler(
  req: Request,
  deps: { createClient: CreateClientFn } = { createClient }
): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('No authorization header')
    }

    const supabaseClient = deps.createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    // Admin client to bypass RLS if needed, but we can just use it to update the user's count securely
    const supabaseAdmin = deps.createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) throw new Error('Error getting user')

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('search_count')
      .eq('id', user.id)
      .single()

    if (profileError) throw profileError

    const currentCount = profile.search_count || 0
    if (currentCount >= 1) {
      return new Response(JSON.stringify({ allowed: false, error: 'Limit reached' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    const newCount = currentCount + 1
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({ search_count: newCount })
      .eq('id', user.id)

    if (updateError) throw updateError

    return new Response(JSON.stringify({ allowed: true, newCount }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
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
// `deps.createClient` in production. The wrapper forwards only `req`.
if (import.meta.main) {
  serve((req) => handler(req))
}
