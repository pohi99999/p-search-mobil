-- grant_matches: a signed-in user could rewrite match_score, match_reasoning and status on their own rows.
--
-- 20261021120000_explicit_api_grants.sql grants UPDATE on the whole table to anon and authenticated (it copied the
-- live relacl), and the "Users can update matches for their business" policy lets every column of an own row
-- through. So `update grant_matches set match_score = 100 where id = <own match>` from the app's anon key + JWT
-- succeeded, and the score and the reasoning are what the matching engine wrote, not the user's to change.
--
-- The app writes only the "Hasznos / Nem releváns" feedback, and only through set_match_feedback()
-- (20261025120000_app_events_and_match_feedback.sql): SECURITY DEFINER, own matches only (business_id ->
-- business_profiles.user_id = auth.uid()), only feedback and feedback_at. status is written by the matching engine
-- (service_role) and the client never updates it, so no column-level UPDATE is granted back.
--
-- Kept on purpose: the UPDATE policy (with no UPDATE privilege it lets nothing through for anon/authenticated, and it
-- stays a guard should the function owner ever not bypass RLS) and service_role's UPDATE (the matching upsert).

REVOKE UPDATE ON public.grant_matches FROM PUBLIC, anon, authenticated;

-- The one write path the app keeps (unchanged from 20261025120000, restated so this file reads complete).
REVOKE EXECUTE ON FUNCTION public.set_match_feedback(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_match_feedback(uuid, text) TO authenticated, service_role;
