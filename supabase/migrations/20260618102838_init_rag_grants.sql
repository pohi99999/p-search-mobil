-- pgvector kiterjesztés engedélyezése
CREATE EXTENSION IF NOT EXISTS vector;

-- 1. Pályázatok törzsadat táblája
CREATE TABLE IF NOT EXISTS public.grants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,                                   -- Pályázat címe (pl. GINOP Plusz-3.2.1)
    provider TEXT,                                         -- Kiíró (pl. Nemzetgazdasági Minisztérium)
    grant_type TEXT,                                       -- Pályázat típusa (vissza nem térítendő, hitel, hibrid)
    amount_min BIGINT DEFAULT 0,                           -- Minimum elnyerhető összeg (Ft)
    amount_max BIGINT,                                     -- Maximum elnyerhető összeg (Ft)
    deadline TIMESTAMP WITH TIME ZONE,                     -- Beadási határidő
    eligibility_criteria TEXT,                             -- Alapvető jogosultsági feltételek
    description TEXT,                                      -- Rövid összefoglaló leírás
    source_url TEXT,                                       -- Hivatalos forrás link (palyazat.gov.hu)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Pályázati szövegrészletek (Chunks) táblája vektoros kereséshez
CREATE TABLE IF NOT EXISTS public.grant_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grant_id UUID REFERENCES public.grants(id) ON DELETE CASCADE NOT NULL,
    content TEXT NOT NULL,                                 -- A pályázati kiírás egy bekezdése / logikai egysége
    embedding vector(768) NOT NULL,                        -- 768 dimenziós embedding (Gemini text-embedding-004-hez méretezve)
    metadata JSONB DEFAULT '{}'::jsonb NOT NULL,           -- Opcionális metaadatok hibrid kereséshez
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Automatikus updated_at trigger a grants táblához
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER set_grants_updated_at
    BEFORE UPDATE ON public.grants
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Row-Level Security (RLS) beállítások
ALTER TABLE public.grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grant_chunks ENABLE ROW LEVEL SECURITY;

-- Olvasási szabályok (Minden bejelentkezett felhasználó olvashatja a pályázatokat)
CREATE POLICY "Allow read access for authenticated users on grants"
    ON public.grants FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Allow read access for authenticated users on grant_chunks"
    ON public.grant_chunks FOR SELECT
    TO authenticated
    USING (true);

-- Írási/Módosítási szabályok (Kizárólag a service_role írhatja/módosíthatja)
CREATE POLICY "Allow all access for service_role on grants"
    ON public.grants FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Allow all access for service_role on grant_chunks"
    ON public.grant_chunks FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- HNSW Index a koszinusz-hasonlóságra optimalizálva
CREATE INDEX IF NOT EXISTS grant_chunks_embedding_hnsw_idx 
    ON public.grant_chunks USING hnsw (embedding vector_cosine_ops);

-- Hasonlósági Kereső Függvény (RPC)
CREATE OR REPLACE FUNCTION public.match_grant_chunks(
    query_embedding vector(768),
    match_threshold float,
    match_count int
)
RETURNS TABLE (
    chunk_id UUID,
    grant_id UUID,
    grant_title TEXT,
    content TEXT,
    similarity float
)
LANGUAGE plpgsql STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT
        gc.id AS chunk_id,
        gc.grant_id,
        g.title AS grant_title,
        gc.content,
        (1 - (gc.embedding <=> query_embedding))::float AS similarity
    from public.grant_chunks gc
    join public.grants g ON gc.grant_id = g.id
    where 1 - (gc.embedding <=> query_embedding) > match_threshold
    ORDER BY gc.embedding <=> query_embedding ASC
    LIMIT match_count;
END;
$$;
