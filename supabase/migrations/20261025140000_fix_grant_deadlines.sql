-- Card [H2] (review 2026-10-25): three grants with a wrong deadline, read against palyazat.gov.hu (Brunella 4741).
-- The convention is the Budapest midnight that starts the last day (see _shared/deadline-normalize.ts). Each row is
-- matched by its exact current values, so the migration is idempotent and leaves a row alone that was changed since.

DO $$
DECLARE
  n integer;
  ginop_url constant text := 'https://www.palyazat.gov.hu/programok/szechenyi-terv-plusz/ginop-plusz/ginop-plusz-121-21/alapadatok';
BEGIN
  -- 1. GINOP_PLUSZ-1.2.1-21: an old hand seed. The source says the call closed on 2021.07.19 (and is suspended);
  --    here it was open until 2027-12-31 23:59:59Z with the portal's home page as its link. Deadline -> Budapest
  --    midnight of 2021-07-19 (summer time); link -> the call's own page, unless another row already has it.
  UPDATE public.grants
     SET deadline = '2021-07-18 22:00:00+00',
         source_url = CASE WHEN EXISTS (SELECT 1 FROM public.grants o WHERE o.source_url = ginop_url) THEN source_url ELSE ginop_url END
   WHERE title LIKE 'GINOP Plusz-1.2.1-21%'
     AND source_url = 'https://www.palyazat.gov.hu'
     AND deadline = '2027-12-31 23:59:59+00';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n > 1 THEN RAISE EXCEPTION 'GINOP_PLUSZ-1.2.1-21 matched % rows, expected at most 1', n; END IF;
  RAISE NOTICE 'GINOP_PLUSZ-1.2.1-21: % row(s) fixed', n;

  -- 2. DIMOP_PLUSZ-1.2.3/B1-24: source 2029.12.31; stored as Budapest 2029-12-30 23:00 (an hour off).
  UPDATE public.grants
     SET deadline = '2029-12-30 23:00:00+00'
   WHERE source_url = 'https://www.palyazat.gov.hu/palyazatok/redirect?program=Sz%C3%A9chenyi%20Terv%20Plusz&op=DIMOP_PLUSZ&code=DIMOP_PLUSZ-1.2.3%2FB1-24'
     AND deadline = '2029-12-30 22:00:00+00';
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'DIMOP_PLUSZ-1.2.3/B1-24: % row(s) fixed', n;

  -- 3. GINOP_PLUSZ-1.4.8-24: source 2030.12.31; stored as Budapest 2030-12-30 23:00 (an hour off).
  UPDATE public.grants
     SET deadline = '2030-12-30 23:00:00+00'
   WHERE source_url = 'https://www.palyazat.gov.hu/palyazatok/redirect?program=Sz%C3%A9chenyi%20Terv%20Plusz&op=GINOP_PLUSZ&code=GINOP_PLUSZ-1.4.8-24'
     AND deadline = '2030-12-30 22:00:00+00';
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'GINOP_PLUSZ-1.4.8-24: % row(s) fixed', n;
END $$;
