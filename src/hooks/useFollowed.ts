import { useEffect, useState } from 'react';
import { loadFollowed, peekFollowed, subscribeFollowed, type FollowedGrant } from '../lib/followedGrants';

/** Round 11-21 (#5): the user's followed grants, kept in step with every follow and unfollow in this session. */
export function useFollowed(userId: string | null | undefined): { followed: FollowedGrant[]; loaded: boolean } {
  const [followed, setFollowed] = useState<FollowedGrant[]>(() => (userId ? peekFollowed(userId) ?? [] : []));
  const [loaded, setLoaded] = useState(() => (userId ? peekFollowed(userId) !== undefined : false));

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    const read = () => {
      void loadFollowed(userId).then((list) => {
        if (!alive) return;
        setFollowed(list);
        setLoaded(true);
      });
    };
    read();
    const unsubscribe = subscribeFollowed(read);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [userId]);

  return { followed, loaded };
}
