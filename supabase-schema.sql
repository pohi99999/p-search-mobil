-- P-Search Mobil Alkalmazás Adatbázis Séma
-- Futtasd le ezt a Supabase SQL Editorjában

-- 1. Felhasználói profilok tábla (Kiterjeszti az alap Supabase Auth usert)
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  updated_at TIMESTAMP WITH TIME ZONE,
  full_name TEXT,
  avatar_url TEXT,
  subscription_tier TEXT DEFAULT 'free', -- 'free' vagy 'pro'
  search_frequency TEXT DEFAULT 'weekly', -- 'weekly' vagy 'daily'
  search_count INTEGER DEFAULT 0 -- Ingyenes keresések száma
);

-- 2. Cégprofilok tábla
CREATE TABLE public.business_profiles (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) NOT NULL,
  company_name TEXT NOT NULL,
  tax_number TEXT,
  industry_code TEXT, -- TEÁOR
  employee_count INTEGER,
  yearly_revenue BIGINT,
  goals TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Pályázatok és Hitelek (Ide tölt az n8n)
CREATE TABLE public.grants (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  provider TEXT, -- Állam, EU, vagy Bank
  grant_type TEXT, -- 'támogatás', 'hitel', 'pályázat'
  amount_min BIGINT,
  amount_max BIGINT,
  deadline TIMESTAMP WITH TIME ZONE,
  eligibility_criteria TEXT,
  source_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Match (Egyezések) tábla a Cégprofil és Pályázatok között
CREATE TABLE public.grant_matches (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  business_id UUID REFERENCES public.business_profiles(id) NOT NULL,
  grant_id UUID REFERENCES public.grants(id) NOT NULL,
  match_score INTEGER NOT NULL, -- 0-100%
  match_reasoning TEXT, -- AI által generált indoklás
  status TEXT DEFAULT 'new', -- 'new', 'interested', 'ignored', 'applied'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Row Level Security (RLS) beállítások a biztonság érdekében
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grant_matches ENABLE ROW LEVEL SECURITY;

-- Profilok olvasása és írása csak a tulajdonosnak
CREATE POLICY "Users can view own profile." ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can insert their own profile." ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile." ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Cégprofilhoz RLS
CREATE POLICY "Users can view own business profile" ON public.business_profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own business profile" ON public.business_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own business profile" ON public.business_profiles FOR UPDATE USING (auth.uid() = user_id);

-- Pályázatok nyilvánosan olvashatók
CREATE POLICY "Grants are viewable by everyone" ON public.grants FOR SELECT USING (true);

-- Match tábla RLS
CREATE POLICY "Users can view matches for their business" ON public.grant_matches FOR SELECT USING (
  business_id IN (SELECT id FROM public.business_profiles WHERE user_id = auth.uid())
);
CREATE POLICY "Users can update matches for their business" ON public.grant_matches FOR UPDATE USING (
  business_id IN (SELECT id FROM public.business_profiles WHERE user_id = auth.uid())
);

-- 5. Akciótervek (Action Plans) tábla
CREATE TABLE public.action_plans (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  business_profile_id UUID REFERENCES public.business_profiles(id) ON DELETE CASCADE NOT NULL,
  match_id UUID REFERENCES public.grant_matches(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  ai_context JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. Akcióterv Feladatok (Action Tasks) tábla
CREATE TABLE public.action_tasks (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  plan_id UUID REFERENCES public.action_plans(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'todo' NOT NULL CONSTRAINT action_tasks_status_check CHECK (status IN ('todo', 'in_progress', 'done')),
  order_index INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS engedélyezése az új táblákon
ALTER TABLE public.action_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_tasks ENABLE ROW LEVEL SECURITY;

-- Policy-k az action_plans táblához
CREATE POLICY "Users can view own action plans" ON public.action_plans FOR SELECT USING (
  business_profile_id IN (SELECT id FROM public.business_profiles WHERE user_id = auth.uid())
);
CREATE POLICY "Users can insert own action plans" ON public.action_plans FOR INSERT WITH CHECK (
  business_profile_id IN (SELECT id FROM public.business_profiles WHERE user_id = auth.uid())
);
CREATE POLICY "Users can update own action plans" ON public.action_plans FOR UPDATE USING (
  business_profile_id IN (SELECT id FROM public.business_profiles WHERE user_id = auth.uid())
);
CREATE POLICY "Users can delete own action plans" ON public.action_plans FOR DELETE USING (
  business_profile_id IN (SELECT id FROM public.business_profiles WHERE user_id = auth.uid())
);

-- Policy-k az action_tasks táblához
CREATE POLICY "Users can view tasks for their plans" ON public.action_tasks FOR SELECT USING (
  plan_id IN (SELECT id FROM public.action_plans WHERE business_profile_id IN (SELECT id FROM public.business_profiles WHERE user_id = auth.uid()))
);
CREATE POLICY "Users can insert tasks for their plans" ON public.action_tasks FOR INSERT WITH CHECK (
  plan_id IN (SELECT id FROM public.action_plans WHERE business_profile_id IN (SELECT id FROM public.business_profiles WHERE user_id = auth.uid()))
);
CREATE POLICY "Users can update tasks for their plans" ON public.action_tasks FOR UPDATE USING (
  plan_id IN (SELECT id FROM public.action_plans WHERE business_profile_id IN (SELECT id FROM public.business_profiles WHERE user_id = auth.uid()))
);
CREATE POLICY "Users can delete tasks for their plans" ON public.action_tasks FOR DELETE USING (
  plan_id IN (SELECT id FROM public.action_plans WHERE business_profile_id IN (SELECT id FROM public.business_profiles WHERE user_id = auth.uid()))
);
