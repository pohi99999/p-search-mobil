import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * RevenueCat webhook -> mirrors Pro entitlement into profiles.subscription_tier.
 *
 * Auth: RevenueCat sends the Authorization header value configured in the
 * dashboard; we compare it to REVENUECAT_WEBHOOK_SECRET (set from the vault).
 * Mapping: app_user_id MUST be the Supabase user id, which requires the client
 * to call Purchases.logIn(user.id) (see BillingContext). Event -> tier:
 *   pro  on: INITIAL_PURCHASE, RENEWAL, PRODUCT_CHANGE, UNCANCELLATION,
 *            NON_RENEWING_PURCHASE, SUBSCRIPTION_EXTENDED, TRIAL/started
 *   free on: EXPIRATION, (and a REFUND that ends access)
 * CANCELLATION only turns auto-renew off; access lasts until EXPIRATION, so we
 * do NOT downgrade on CANCELLATION. Unknown types are ignored (200, no write).
 */
export type CreateClientFn = typeof createClient;

const PRO_EVENTS = new Set([
  'INITIAL_PURCHASE', 'RENEWAL', 'PRODUCT_CHANGE', 'UNCANCELLATION',
  'NON_RENEWING_PURCHASE', 'SUBSCRIPTION_EXTENDED', 'TRIAL_STARTED', 'TRIAL_CONVERTED',
]);
const FREE_EVENTS = new Set(['EXPIRATION', 'SUBSCRIPTION_PAUSED']);

/** Pure: event type -> new tier, or null when the event should not change tier. */
export function tierForEvent(eventType: string | undefined | null): 'pro' | 'free' | null {
  if (!eventType) return null;
  if (PRO_EVENTS.has(eventType)) return 'pro';
  if (FREE_EVENTS.has(eventType)) return 'free';
  return null; // CANCELLATION, TEST, TRANSFER, BILLING_ISSUE, unknown -> no change
}

export async function handler(
  req: Request,
  deps: { createClient: CreateClientFn } = { createClient },
): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
  }
  const secret = Deno.env.get('REVENUECAT_WEBHOOK_SECRET');
  const auth = req.headers.get('Authorization');
  if (!secret || auth !== secret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  let payload: { event?: { type?: string; app_user_id?: string } } = {};
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const event = payload.event;
  const tier = tierForEvent(event?.type);
  const appUserId = event?.app_user_id;
  if (!tier || !appUserId) {
    // Nothing to change (or anonymous id). Ack so RevenueCat does not retry.
    return new Response(JSON.stringify({ ok: true, changed: false }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  const admin = deps.createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );
  const { error } = await admin.from('profiles').update({ subscription_tier: tier }).eq('id', appUserId);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
  return new Response(JSON.stringify({ ok: true, changed: true, tier }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

if (import.meta.main) {
  serve((req) => handler(req));
}
