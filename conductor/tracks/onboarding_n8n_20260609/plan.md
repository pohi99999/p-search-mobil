# Implementation Plan

## Phase 1: Onboarding Felület és Navigáció
- [x] Task: Supabase tábla ellenőrzése és típusok (TypeScript) definiálása az Onboarding adatokhoz.
    - [x] Módosítani a `supabase-schema.sql`-t (ha szükséges) és legenerálni a TS típusokat.
- [x] Task: `OnboardingScreen.tsx` létrehozása.
    - [x] React Native Paper űrlap elemek beépítése (Cégnév, TEÁOR, Célok).
- [x] Task: Mentés funkció bekötése a Supabase-be.
    - [x] `handleSave` logika implementálása (Update user metadata or business table).
- [x] Task: Navigáció frissítése.
    - [x] Az `App.tsx` vagy a `HomeScreen.tsx` átirányítása az Onboardingra, ha a profil hiányos.
- [ ] Task: Conductor - User Manual Verification 'Phase 1' (Protocol in workflow.md)

## Phase 2: Háttérfolyamat (n8n) Előkészítés
- [ ] Task: Home Screen frissítése, hogy a "Keresés folyamatban" (Skeleton Loader) állapotot mutassa az onboarding után.
- [ ] Task: n8n Webhook / API hívás (vagy Supabase Webhook trigger) konfigurációjának megtervezése és rögzítése egy `docs/n8n-integration.md` fájlban.
- [ ] Task: Conductor - User Manual Verification 'Phase 2' (Protocol in workflow.md)
