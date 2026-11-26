// The digest-unsubscribe Edge Function's logic (round 6, item A): no sign-in, and a GET never changes anything.
//
// GET (the link in the e-mail): only checks the token and redirects to the static Hungarian page on the web app
// (public/leiratkozas.html, served as /leiratkozas like /reset-password) with a confirm button. A mail scanner or link
// checker that opens every link (a company spam filter does) must not unsubscribe the reader (Ellenőr 9371, tip 1;
// Marveen 9374). The user id and the token travel in the URL FRAGMENT, which the browser never sends to a server, so
// they are not in the web host's logs.
// POST from that page (form field confirm=page): turns the digest off, 303 to /leiratkozas?ok=1 (ok=0 when not).
// POST without it (RFC 8058 one-click, sent by the mail client from the List-Unsubscribe header): turns it off, 200.
// A bad or missing token changes nothing.
//
// The HMAC key is DIGEST_UNSUBSCRIBE_SECRET, not the scheduler secret: rotating the scheduler secret must not break
// every unsubscribe link already sent (tip 3). Without it no token is valid.
import { DEFAULT_APP_URL, unsubscribeUrl, verifyUnsubscribeToken } from './digest.ts';

export interface UnsubscribeDeps {
  env: (name: string) => string | undefined;
  /** weekly_digest = false for the user (the consent stamp is cleared by the trigger). */
  optOut: (userId: string) => Promise<void>;
  log?: (line: string) => void;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const pageUrl = (appUrl: string) => `${appUrl.replace(/\/+$/, '')}/leiratkozas`;

function to(location: string, status = 302): Response {
  return new Response(null, { status, headers: { Location: location } });
}

/** The form field the confirm page sends; the RFC 8058 one-click body is "List-Unsubscribe=One-Click". */
async function isPageConfirm(req: Request): Promise<boolean> {
  try {
    return new URLSearchParams(await req.text()).get('confirm') === 'page';
  } catch {
    return false;
  }
}

export async function handleUnsubscribe(req: Request, deps: UnsubscribeDeps): Promise<Response> {
  const log = deps.log ?? ((l: string) => console.log(l));
  const appUrl = deps.env('DIGEST_APP_URL') || DEFAULT_APP_URL;
  if (req.method !== 'GET' && req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const url = new URL(req.url);
  const userId = url.searchParams.get('u') ?? '';
  const token = url.searchParams.get('t') ?? '';
  const secret = deps.env('DIGEST_UNSUBSCRIBE_SECRET') ?? '';
  const valid = UUID_RE.test(userId) && (await verifyUnsubscribeToken(secret, userId, token));

  if (req.method === 'GET') {
    const supabaseUrl = deps.env('SUPABASE_URL');
    if (!valid || !supabaseUrl) {
      log(`unsubscribe invalid method=GET`);
      return to(`${pageUrl(appUrl)}?ok=0`);
    }
    // nothing is changed here; the page's button POSTs to this same URL
    const action = unsubscribeUrl(supabaseUrl, userId, token);
    return to(`${pageUrl(appUrl)}#a=${encodeURIComponent(action)}`);
  }

  const fromPage = await isPageConfirm(req);
  const answer = (ok: boolean, status: number, body: string) =>
    fromPage ? to(`${pageUrl(appUrl)}?ok=${ok ? 1 : 0}`, 303) : new Response(body, { status });

  if (!valid) {
    log(`unsubscribe invalid method=POST page=${fromPage}`);
    return answer(false, 400, 'invalid');
  }
  try {
    await deps.optOut(userId);
  } catch (err) {
    log(`unsubscribe user=${userId} failed=${err instanceof Error ? err.message : String(err)}`);
    return answer(false, 500, 'error');
  }
  log(`unsubscribe user=${userId} ok page=${fromPage}`);
  return answer(true, 200, 'ok');
}
