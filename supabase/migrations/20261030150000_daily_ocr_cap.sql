-- P-Search kör 2, Kenshin P1-5 (Péter, Telegram 12036: "Igen, napi 3 mindenkinek"): the financial-statement OCR
-- (process-master-document) is a paid vision call, and nothing limited it but the file size. At most 3 a day per
-- user, Pro and free alike, the same mechanism as the daily chat cap (20261025130000_daily_chat_cap.sql):
-- consume_daily_ocr checks, resets on a new day and increments under a row lock, so concurrent uploads cannot slip
-- past it; the edge function gives one back when the OCR fails (daily-search-refund.ts refundDailyOcr).
--
-- The two new columns are not in the column-level UPDATE grant of authenticated on profiles
-- (20260926150000_lock_entitlement_columns_and_rpc.sql), so a client cannot reset its own counter.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS daily_ocr_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS daily_ocr_date DATE;

CREATE OR REPLACE FUNCTION public.consume_daily_ocr(p_user uuid, p_cap integer)
RETURNS TABLE(allowed boolean, used integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cur integer;
  d date;
BEGIN
  SELECT daily_ocr_count, daily_ocr_date
    INTO cur, d
    FROM public.profiles
    WHERE id = p_user
    FOR UPDATE;
  IF NOT FOUND THEN
    -- No profile row: no counter to keep. Unlike the chat cap this is refused: an upload always belongs to a
    -- business profile of a signed-in user, whose profiles row exists (handle_new_user).
    RETURN QUERY SELECT false, 0;
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
    SET daily_ocr_count = COALESCE(cur, 0) + 1,
        daily_ocr_date = CURRENT_DATE
    WHERE id = p_user;
  RETURN QUERY SELECT true, COALESCE(cur, 0) + 1;
END;
$$;

-- Only the edge function (service_role) calls it; a client could otherwise spend another user's cap.
REVOKE EXECUTE ON FUNCTION public.consume_daily_ocr(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_daily_ocr(uuid, integer) TO service_role;
