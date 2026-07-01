-- =============================================================
-- Migration: Production RLS Performance Indexing
-- Task: Phase 5 / Step 5 — Database Performance Hardening & Production Indexing
-- Date: 2026-07-01
-- Context: Qodo Code Review flagged that nested RLS policy checks across
--          action_tasks -> action_plans -> business_profiles, and
--          financial_documents -> business_profiles, evaluate
--          (select auth.uid()) without backing indexes on the join/filter
--          columns, forcing sequential scans in production.
--
-- Notes:
--  * All indexes are created with IF NOT EXISTS to remain idempotent and
--    non-blocking on repeated runs.
--  * CREATE INDEX CONCURRENTLY cannot run inside a transaction block, and
--    the Supabase CLI wraps each migration file in a transaction by
--    default. Since these tables are still small (early production
--    stage) we use standard CREATE INDEX for transactional safety; revisit
--    with CONCURRENTLY + separate migration if tables grow large enough
--    to make a brief ACCESS EXCLUSIVE lock risky.
-- =============================================================

-- 1. action_tasks.plan_id
--    Backing index for: action_tasks RLS EXISTS-subquery join to action_plans.id
CREATE INDEX IF NOT EXISTS idx_action_tasks_plan_id_fk
  ON public.action_tasks (plan_id);

-- 2. action_plans (business_profile_id, match_id)
--    Backing composite index for: action_plans RLS IN-subquery filter on
--    business_profile_id, plus match_id lookups used by generate-action-plan
--    and chat-with-gemini Edge Functions.
CREATE INDEX IF NOT EXISTS idx_action_plans_business_profile_id_match_id_fk
  ON public.action_plans (business_profile_id, match_id);

-- 3. financial_documents (business_profile_id, processing_status)
--    Backing composite index for: financial_documents RLS IN-subquery
--    filter on business_profile_id, plus status-based polling queries
--    (pending/processing/completed/failed) from the OCR pipeline.
CREATE INDEX IF NOT EXISTS idx_financial_documents_business_profile_id_status_fk
  ON public.financial_documents (business_profile_id, processing_status);

-- 4. business_profiles.user_id
--    Backing index for: (select auth.uid()) = user_id evaluation at the
--    root of every nested RLS policy chain (action_tasks, action_plans,
--    financial_documents all bottom out here).
CREATE INDEX IF NOT EXISTS idx_business_profiles_user_id_fk
  ON public.business_profiles (user_id);

COMMENT ON INDEX public.idx_action_tasks_plan_id_fk IS
  'RLS perf: supports EXISTS join from action_tasks to action_plans.id';
COMMENT ON INDEX public.idx_action_plans_business_profile_id_match_id_fk IS
  'RLS perf: supports IN-subquery filter on business_profile_id and match_id lookups';
COMMENT ON INDEX public.idx_financial_documents_business_profile_id_status_fk IS
  'RLS perf: supports IN-subquery filter on business_profile_id and status polling';
COMMENT ON INDEX public.idx_business_profiles_user_id_fk IS
  'RLS perf: supports (select auth.uid()) = user_id root check for all tenant-scoped policies';
