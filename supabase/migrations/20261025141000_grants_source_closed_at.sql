-- Card [H2] (review 2026-10-25, Brunella 4750): a call that is no longer Aktív at the source (suspended, closed) must
-- not stay open here. Rows are never deleted (grant_matches and action plans point at them); instead the loader
-- (scripts/ingest-grants) stamps source_closed_at when a call it loaded drops out of the source's Aktív list, and
-- clears it if the call comes back. The matching candidates and the home list treat a stamped row like an expired one.
-- Additive: one nullable column, no data change.

ALTER TABLE public.grants
  ADD COLUMN IF NOT EXISTS source_closed_at timestamptz;

COMMENT ON COLUMN public.grants.source_closed_at IS
  'When the loader found the call no longer Aktív at the source; NULL = open at the source (or not from the loader).';
