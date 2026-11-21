import { useEffect, useState } from 'react';
import { takePreviousVisit } from '../lib/seenMatches';
import { fetchGrantFreshness, type GrantFreshness } from '../lib/grantFreshness';

export interface HomeStatus {
  /** The previous visit (ISO); null on a first visit, undefined while it is read. */
  previousVisit: string | null | undefined;
  /** The grant list's freshness, or null while unread or when the read failed. */
  freshness: GrantFreshness | null;
}

/**
 * P-Search round 11-21 (#2, #4): the previous visit of this user and the grant list's freshness, read once per mount.
 * `refreshKey` reads the freshness again (pull-to-refresh, a finished search); the previous visit is fixed for the session.
 */
export function useHomeStatus(userId: string | null | undefined, refreshKey: unknown): HomeStatus {
  const [previousVisit, setPreviousVisit] = useState<string | null | undefined>(undefined);
  const [freshness, setFreshness] = useState<GrantFreshness | null>(null);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    void takePreviousVisit(userId).then((v) => {
      if (alive) setPreviousVisit(v);
    });
    return () => {
      alive = false;
    };
  }, [userId]);

  useEffect(() => {
    let alive = true;
    void fetchGrantFreshness().then((f) => {
      if (alive) setFreshness(f);
    });
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  return { previousVisit, freshness };
}
