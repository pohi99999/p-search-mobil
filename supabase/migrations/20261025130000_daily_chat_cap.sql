-- Card [L] (review 2026-10-25): every Copilot chat message is a paid AI call, and a free account could send any
-- number of them. A daily cap for non-Pro users, the same mechanism as the daily search cap
-- (20260912150000_daily_search_cap.sql): consume_daily_chat checks, resets on a new day and increments under a row
-- lock, so concurrent calls cannot slip past it. The cap value is passed in by the edge function
-- (FREE_DAILY_CHAT_CAP, a technical ceiling against abuse; the final free/Pro line is the owner's decision).
--
-- The two new columns are not in the column-level UPDATE grant of authenticated on profiles
-- (20260926150000_lock_entitlement_columns_and_rpc.sql), so a client cannot reset its own counter.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS daily_chat_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS daily_chat_date DATE;

CREATE OR REPLACE FUNCTION public.consume_daily_chat(p_user uuid, p_cap integer)
RETURNS TABLE(allowed boolean, used integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cur integer;
  d date;
  tier text;
BEGIN
  SELECT daily_chat_count, daily_chat_date, subscription_tier
    INTO cur, d, tier
    FROM public.profiles
    WHERE id = p_user
    FOR UPDATE;
  IF NOT FOUND THEN
    -- No profile row: treated like the search cap does (a client cannot insert or delete profile rows,
    -- 20261016100000_lock_profiles_insert.sql, so this is not a way around the cap).
    RETURN QUERY SELECT true, 1;
    RETURN;
  END IF;
  IF tier = 'pro' THEN
    RETURN QUERY SELECT true, COALESCE(cur, 0);
    RETURN;
  END IF;
  IF d IS DISTINCT FROM CURRENT_DATE THEN
    cur := 0;
  END IF;
  IF COALESCE(cur, 0) >= p_cap THEN
    RETURN QUERY SELECT false, COALESCE(cur, 0);
    RETURN;
  END IF;
  UPDATE public.profiles
    SET daily_chat_count = COALESCE(cur, 0) + 1,
        daily_chat_date = CURRENT_DATE
    WHERE id = p_user;
  RETURN QUERY SELECT true, COALESCE(cur, 0) + 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.consume_daily_chat(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_daily_chat(uuid, integer) TO service_role;
