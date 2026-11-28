// The digest-unsubscribe Edge Function's logic (round 6, item A): one click, no sign-in.
// GET (the link in the e-mail): turns the digest off and redirects to a static Hungarian page on the web app
// (public/leiratkozas.html, served as /leiratkozas like /reset-password), so this function never has to serve HTML itself.
// POST (RFC 8058 one-click, sent by the mail client from the List-Unsubscribe header): turns it off, 200.
// A bad or missing token changes nothing; the page then says the link is not valid.
import { DEFAULT_APP_URL, verifyUnsubscribeToken } from './digest.ts';

export interface UnsubscribeDeps {
  env: (name: string) => string | undefined;
  /** weekly_digest = false for the user (the consent stamp is cleared by the trigger). */
  optOut: (userId: string) => Promise<void>;
  log?: (line: string) => void;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function redirect(appUrl: string, ok: boolean): Response {
  return new Response(null, { status: 302, headers: { Location: `${appUrl.replace(/\/+$/, '')}/leiratkozas?ok=${ok ? 1 : 0}` } });
}

export async function handleUnsubscribe(req: Request, deps: UnsubscribeDeps): Promise<Response> {
  const log = deps.log ?? ((l: string) => console.log(l));
  const appUrl = deps.env('DIGEST_APP_URL') || DEFAULT_APP_URL;
  const isPost = req.method === 'POST';
  if (req.method !== 'GET' && !isPost) return new Response('Method not allowed', { status: 405 });

  const url = new URL(req.url);
  const userId = url.searchParams.get('u') ?? '';
  const token = url.searchParams.get('t') ?? '';
  const secret = deps.env('SCHEDULER_SECRET') ?? '';

  const valid = UUID_RE.test(userId) && (await verifyUnsubscribeToken(secret, userId, token));
  if (!valid) {
    log(`unsubscribe invalid method=${req.method}`);
    return isPost ? new Response('invalid', { status: 400 }) : redirect(appUrl, false);
  }
  try {
    await deps.optOut(userId);
  } catch (err) {
    log(`unsubscribe user=${userId} failed=${err instanceof Error ? err.message : String(err)}`);
    return isPost ? new Response('error', { status: 500 }) : redirect(appUrl, false);
  }
  log(`unsubscribe user=${userId} ok method=${req.method}`);
  return isPost ? new Response('ok', { status: 200 }) : redirect(appUrl, true);
}
