-- Enforce one grant per source_url so re-ingest is idempotent at the DB level
-- and races cannot create duplicates. The app-side ingest also dedups by
-- source_url (scripts/ingest-grants/mapTender.ts), so this is a durable
-- belt-and-suspenders guarantee, not the only line of defence.
--
-- A UNIQUE constraint permits multiple NULLs; our ingest always sets source_url
-- (mapTender.buildSourceUrl), so NULLs are not expected here. Data verified
-- duplicate-free before adding this constraint (2026-09-12: 5 rows, 5 distinct
-- URLs, 0 nulls, 0 duplicate groups).
ALTER TABLE public.grants
  ADD CONSTRAINT grants_source_url_key UNIQUE (source_url);
