-- Security advisor extension_in_public: move pgvector out of the public schema (card bc8e4135).
-- Applied to the live project on 2026-10-04 16:23:30 (owner GO, Telegram 6025), after a complete
-- logical backup (store/backups/psearch-vector-move-2026-10-04/20261004-162238).
-- match_grant_chunks pins search_path = public and uses the <=> operator unqualified; after the move
-- the operator lives in "extensions", so without the second statement it fails with
-- "operator does not exist: extensions.vector <=> extensions.vector" (measured on a restored copy).
-- Measured live after: same 5 matches for a stored embedding (ids and similarities identical),
-- column type extensions.vector(768), a PostgREST-style write works, the HNSW index is usable,
-- the advisor no longer reports extension_in_public.
begin;
alter extension vector set schema extensions;
alter function public.match_grant_chunks(extensions.vector, double precision, integer)
  set search_path = public, extensions;
commit;
