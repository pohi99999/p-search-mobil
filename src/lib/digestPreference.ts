// Round 6, item A (Péter 18328, Marveen 9160/9199): the weekly e-mail digest is opt-in, OFF by default. The app asks
// once (after the first successful search) and offers a switch in Settings. It writes only the two columns the
// migration grants to the client (20261126120000_weekly_digest.sql): weekly_digest and weekly_digest_asked_at; the
// consent time is stamped by the database.
import { supabase } from './supabase';

export interface DigestPreference {
  enabled: boolean;
  /** When the one-time question was answered (either way); null = not asked yet. */
  askedAt: string | null;
}

async function currentUserId(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

/** The signed-in user's preference; throws when it cannot be read (the caller shows nothing rather than a guess). */
export async function loadDigestPreference(): Promise<DigestPreference> {
  const userId = await currentUserId();
  if (!userId) throw new Error('Nincs aktív felhasználói munkamenet.');
  const { data, error } = await supabase
    .from('profiles')
    .select('weekly_digest, weekly_digest_asked_at')
    .eq('id', userId)
    .single();
  if (error) throw new Error(error.message);
  const row = data as { weekly_digest: boolean | null; weekly_digest_asked_at: string | null } | null;
  return { enabled: row?.weekly_digest === true, askedAt: row?.weekly_digest_asked_at ?? null };
}

/** Turns the digest on or off, and records that the question has been answered. Throws when the write fails. */
export async function saveDigestPreference(enabled: boolean, now: Date = new Date()): Promise<DigestPreference> {
  const userId = await currentUserId();
  if (!userId) throw new Error('Nincs aktív felhasználói munkamenet.');
  const askedAt = now.toISOString();
  const { error } = await supabase
    .from('profiles')
    .update({ weekly_digest: enabled, weekly_digest_asked_at: askedAt })
    .eq('id', userId);
  if (error) throw new Error(error.message);
  return { enabled, askedAt };
}

export const DIGEST_COPY = {
  title: 'Heti e-mail összefoglaló',
  description: 'Hétfő reggel: az új, hozzád illő kiírások és a közelgő határidők. Bármikor kikapcsolhatod.',
  question: 'Kérsz hetente egy e-mailt az új, hozzád illő kiírásokról és a közelgő határidőkről?',
  yes: 'Igen, kérem',
  no: 'Most nem',
  saveError: 'Nem sikerült menteni. Próbáld újra.',
} as const;
