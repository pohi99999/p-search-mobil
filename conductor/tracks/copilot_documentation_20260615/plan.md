# Implementation Plan - Copilot és Dokumentáció

## Phase 1: Action Plan UI
- [x] Task: Supabase adatmodell tervezése és migrációja.
    - [x] Létrehozni az `action_plans` és `action_tasks` táblákat a Supabase-ben.
    - [x] RLS szabályok és kapcsolatok (FK to business_profile / matches) beállítása.
- [ ] Task: Action Plan képernyő és UI implementálása.
    - [ ] React Native Paper lista és kártya alapú ToDo felület elkészítése.
    - [ ] Feladatok állapotának frissítése (Pending / In Progress / Completed) a felületen.
- [ ] Task: Pályázati követelmények automatikus feladattá bontása.
    - [ ] Olyan backend/n8n/Edge Function logika tervezése és integrációja, ami a kiválasztott pályázat specifikációi alapján feltölti a teendőket alapértelmezett feladatokkal.
- [ ] Task: Conductor - User Verification 'Phase 1' (Protocol in workflow.md)

## Phase 2: AI Asszisztens Chatbot
- [ ] Task: Chat felület (UI) elkészítése.
    - [ ] Beépíteni egy üzenetküldő felületet a mobilalkalmazásba.
    - [ ] Támogatni a sima szöveges válaszokat és a betöltési állapotokat (typing indicators).
- [ ] Task: Gemini AI Chat integráció.
    - [ ] Supabase Edge Function vagy n8n webhook fejlesztése, ami a Gemini API-n keresztül válaszol.
    - [ ] Kontextus átadása: cégprofil adatok + aktuális pályázati információk.
- [ ] Task: Interaktív adatgyűjtő és profil-pontosító logika.
    - [ ] Logika fejlesztése, amivel a chatbot képes a beszélgetésből kinyert adatokat közvetlenül a Supabase-be vagy az Action Plan-be menteni.
- [ ] Task: Conductor - User Verification 'Phase 2' (Protocol in workflow.md)

## Phase 3: Dokumentum Generátor
- [ ] Task: PDF export és megosztás modul integrációja.
    - [ ] Beépíteni az `expo-print` és `expo-sharing` modulokat.
    - [ ] Mintadokumentum (pl. HTML sablon) kigenerálása PDF formátumban és eszköz-szintű megosztása.
- [ ] Task: AI alapú sablon kitöltő motor.
    - [ ] Gemini prompt összeállítása, ami a cégprofil adatok és a chatbot beszélgetés alapján legenerálja az üzleti terv / nyilatkozat tartalmát.
- [ ] Task: Generált dokumentumok kezelése.
    - [ ] Felület a generált PDF-ek listázására, megtekintésére és helyi mentésére.
- [ ] Task: Conductor - User Verification 'Phase 3' (Protocol in workflow.md)
