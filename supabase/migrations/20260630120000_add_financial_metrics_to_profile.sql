-- =============================================================
-- Migration: Add Financial Metrics to business_profiles
-- Task: Phase 5 / Step 3 — Master Document Base (Gemini OCR)
-- Date: 2026-06-30
-- =============================================================
-- Note: employee_count (INTEGER) already exists on business_profiles.
-- We add: net_revenue, ebitda, equity (NUMERIC), raw_ocr_json (JSONB)
-- and create the financial_documents tracking table.
-- =============================================================

-- 1. Add financial metric columns to business_profiles (idempotent)
ALTER TABLE public.business_profiles
  ADD COLUMN IF NOT EXISTS net_revenue   NUMERIC,
  ADD COLUMN IF NOT EXISTS ebitda        NUMERIC,
  ADD COLUMN IF NOT EXISTS equity        NUMERIC,
  ADD COLUMN IF NOT EXISTS raw_ocr_json  JSONB;

COMMENT ON COLUMN public.business_profiles.net_revenue  IS 'Nettó árbevétel (Ft) – Gemini OCR feldolgozás eredménye';
COMMENT ON COLUMN public.business_profiles.ebitda       IS 'EBITDA (Ft) – Gemini OCR feldolgozás eredménye';
COMMENT ON COLUMN public.business_profiles.equity       IS 'Saját tőke (Ft) – Gemini OCR feldolgozás eredménye';
COMMENT ON COLUMN public.business_profiles.raw_ocr_json IS 'Teljes OCR kinyerési eredmény JSON-ban tárolva (auditálhatóság)';

-- 2. Patch existing business_profiles RLS policies to use (select auth.uid()) subquery
--    for improved query-plan performance (avoids per-row function evaluation)
DO $$
BEGIN
  -- DROP and recreate UPDATE policy with (select auth.uid())
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'business_profiles'
      AND policyname = 'Users can update own business profile'
  ) THEN
    DROP POLICY "Users can update own business profile" ON public.business_profiles;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'business_profiles'
      AND policyname = 'Users can view own business profile'
  ) THEN
    DROP POLICY "Users can view own business profile" ON public.business_profiles;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'business_profiles'
      AND policyname = 'Users can insert own business profile'
  ) THEN
    DROP POLICY "Users can insert own business profile" ON public.business_profiles;
  END IF;
END $$;

CREATE POLICY "Users can view own business profile"
  ON public.business_profiles FOR SELECT
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can insert own business profile"
  ON public.business_profiles FOR INSERT
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can update own business profile"
  ON public.business_profiles FOR UPDATE
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- 3. Create financial_documents table (document upload tracking + OCR audit log)
CREATE TABLE IF NOT EXISTS public.financial_documents (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_profile_id UUID REFERENCES public.business_profiles(id) ON DELETE CASCADE NOT NULL,
  file_name           TEXT NOT NULL,
  document_type       TEXT DEFAULT 'balance_sheet' NOT NULL
                        CONSTRAINT financial_documents_type_check
                        CHECK (document_type IN ('balance_sheet', 'general_ledger', 'income_statement', 'other')),
  processing_status   TEXT DEFAULT 'pending' NOT NULL
                        CONSTRAINT financial_documents_status_check
                        CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
  ocr_result          JSONB,
  error_message       TEXT,
  created_at          TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at          TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

COMMENT ON TABLE public.financial_documents IS 'Pénzügyi dokumentumok feltöltési naplója és OCR feldolgozási állapota';

-- 4. RLS for financial_documents
ALTER TABLE public.financial_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own financial documents"
  ON public.financial_documents FOR SELECT
  USING (
    business_profile_id IN (
      SELECT id FROM public.business_profiles
      WHERE user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Users can insert own financial documents"
  ON public.financial_documents FOR INSERT
  WITH CHECK (
    business_profile_id IN (
      SELECT id FROM public.business_profiles
      WHERE user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Users can update own financial documents"
  ON public.financial_documents FOR UPDATE
  USING (
    business_profile_id IN (
      SELECT id FROM public.business_profiles
      WHERE user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    business_profile_id IN (
      SELECT id FROM public.business_profiles
      WHERE user_id = (SELECT auth.uid())
    )
  );

-- 5. Performance indexes
CREATE INDEX IF NOT EXISTS financial_documents_business_profile_id_idx
  ON public.financial_documents(business_profile_id);

CREATE INDEX IF NOT EXISTS financial_documents_status_idx
  ON public.financial_documents(processing_status);

CREATE INDEX IF NOT EXISTS business_profiles_net_revenue_idx
  ON public.business_profiles(net_revenue)
  WHERE net_revenue IS NOT NULL;
