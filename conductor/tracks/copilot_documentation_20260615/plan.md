# Implementation Plan - Copilot és Dokumentáció

## Phase 1: Action Plan UI
- [x] Task: Supabase adatmodell tervezése és migrációja.
    - [x] Létrehozni az `action_plans` és `action_tasks` táblákat a Supabase-ben.
    - [x] RLS szabályok és kapcsolatok (FK to business_profile / matches) beállítása.
- [x] Task: Action Plan képernyő és UI implementálása.
    - [x] React Native Paper lista és kártya alapú ToDo felület elkészítése.
    - [x] Feladatok állapotának frissítése (Pending / In Progress / Completed) a felületen.
- [x] Task: Pályázati követelmények automatikus feladattá bontása.
    - [x] Olyan backend/n8n/Edge Function logika tervezése és integrációja, ami a kiválasztott pályázat specifikációi alapján feltölti a teendőket alapértelmezett feladatokkal.
- [x] Task: Conductor - User Verification 'Phase 1' (Protocol in workflow.md)

## Phase 2: AI Asszisztens Chatbot
- [x] Task: Chat felület (UI) elkészítése.
    - [x] Beépíteni egy üzenetküldő felületet a mobilalkalmazásba.
    - [x] Támogatni a sima szöveges válaszokat és a betöltési állapotokat (typing indicators).
- [x] Task: Gemini AI Chat integráció.
    - [x] Supabase Edge Function vagy n8n webhook fejlesztése, ami a Gemini API-n keresztül válaszol.
    - [x] Kontextus átadása: cégprofil adatok + aktuális pályázati információk.
- [x] Task: Interaktív adatgyűjtő és profil-pontosító logika.
    - [x] Logika fejlesztése, amivel a chatbot képes a beszélgetésből kinyert adatokat közvetlenül a Supabase-be vagy az Action Plan-be menteni.
- [x] Task: Conductor - User Verification 'Phase 2' (Protocol in workflow.md)

## Phase 3: Dokumentum Generátor
- [x] Task: PDF export és megosztás modul integrációja.
    - [x] Beépíteni az `expo-print` és `expo-sharing` modulokat.
    - [x] Mintadokumentum (pl. HTML sablon) kigenerálása PDF formátumban és eszköz-szintű megosztása.
- [x] Task: AI alapú sablon kitöltő motor.
    - [x] Gemini prompt összeállítása, ami a cégprofil adatok és a chatbot beszélgetés alapján legenerálja az üzleti terv / nyilatkozat tartalmát.
- [x] Task: Generált dokumentumok kezelése.
    - [x] Felület a generált PDF-ek listázására, megtekintésére és helyi mentésére.
- [x] Task: Conductor - User Verification 'Phase 3' (Protocol in workflow.md)
