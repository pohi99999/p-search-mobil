# P-Search Mobil Alkalmazás Fejlesztési Terv (Conductor Plan)

## Fázis 1: Alapok és Architektúra (Foundation)
- [ ] **1.1. Projekt Setup:** Expo / React Native inicializálása TypeScript támogatással, a GitHub tároló (`p-search-mobil`) összekötése.
- [ ] **1.2. Supabase Integráció:** Ingyenes Supabase projekt létrehozása, PostgreSQL adatbázissémák (users, business_profiles, grants, matches) definiálása.
- [ ] **1.3. Hitelesítés (Auth):** Bejelentkezési / Regisztrációs képernyők elkészítése (Email/Jelszó és Google Social Login) a Supabase Auth segítségével.

## Fázis 2: Cégprofilozás és Adatgyűjtés (Data & Profile)
- [ ] **2.1. Onboarding UI:** Chat-szerű vagy lépésről-lépésre (Wizard) UI létrehozása a cégadatok bekérésére.
- [ ] **2.2. Web Scraper n8n Workflow:** n8n munkafolyamat elkészítése a pályázatfigyelő portálok és banki hiteloldalak adatainak begyűjtésére, majd automatikus feltöltésére a Supabase `grants` táblába.
- [ ] **2.3. Ütemezés (Scheduling):** A Supabase/App UI-ban annak beállítása, hogy a felhasználó milyen gyakran kéri az egyezések lefutását (napi/heti).

## Fázis 3: AI Matchmaking és Feed (Phase 1 of App)
- [ ] **3.1. Matchmaking Engine (Edge Function):** Supabase Edge Function írása, ami egy LLM-et (pl. Gemini API) használva összehasonlítja a cégprofilt a nyitott pályázatokkal, és egy %-os illeszkedési (Match) pontszámot számol.
- [ ] **3.2. Feed UI:** A felhasználó főképernyője (Home Screen), ahol Tinder-szerűen vagy egy letisztult listában láthatja a javasolt pályázatokat és hiteleket.
- [ ] **3.3. Részletes nézet:** Egy pályázatra kattintva a kritériumok, támogatási összegek, határidők és a nyerési esély elemzésének megjelenítése.

## Fázis 4: Copilot és Dokumentáció (Phase 2 of App)
- [ ] **4.1. Action Plan UI:** "Érdekel" gombra kattintva a pályázat követelményeinek lebontása feladatokra (Trello/Kanban stílus).
- [ ] **4.2. AI Asszisztens Chatbot:** React Native Gifted Chat beépítése, ahol az AI válaszol a pályázattal kapcsolatos kérdésekre és bekéri az információkat.
- [ ] **4.3. Dokumentum Generátor:** A kinyert információk és a cégadatok alapján az LLM segítségével kitöltött sablonok (pl. üzleti terv, nyilatkozatok) generálása PDF vagy DOCX formátumban.

## Fázis 5: Monetizáció és Élesítés
- [ ] **5.1. Paywall és RevenueCat:** `react-native-purchases` beépítése, Pro csomag (in-app purchase) konfigurálása.
- [ ] **5.2. Design Polish:** Prémium animációk (Lottie), mikrointerakciók és sötét/világos mód tesztelése.
- [ ] **5.3. Play Store és App Store Deploy:** EAS Build (Expo Application Services) beállítása és az első béta verzió kigenerálása tesztelésre.
