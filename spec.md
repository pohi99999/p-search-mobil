# P-Search Mobil Alkalmazás Specifikáció

## 1. Projekt Áttekintés
A **P-Search Mobil** egy innovatív Android alkalmazás, amely automatizálja a kis- és középvállalkozások (KKV-k) számára a megfelelő pályázatok, állami támogatások és kedvezményes hitelek felkutatását. Egy beépített AI ágens (Asszisztens) segítségével az alkalmazás nemcsak megtalálja a legjobb lehetőségeket, de végig is kíséri a felhasználót az igénylés és a dokumentáció-összeállítás teljes folyamatán.

## 2. Üzleti és Célcsoport
- **Célcsoport:** KKV vezetők, egyéni vállalkozók, startup alapítók, akiknek nincs idejük és erőforrásuk pályázatírókat fizetni.
- **Monetizáció (Bevételszerzés):** 
  - **Freemium Modell:** Alap profil létrehozása és heti 1 találati riport ingyenes.
  - **Pro Előfizetés (In-App Purchase RevenueCat-en keresztül):** Napi mélyreható keresés, AI ágens aktív dokumentáció-generálási segítsége a "2. fázisban", lépésről-lépésre akciótervek.
  - **Zero-Budget Megközelítés:** Az infrastruktúrához kizárólag ingyenes/generous free-tier szolgáltatásokat használunk az első bevételekig.

## 3. Technológiai Stack (Zero-Budget, Profi Megoldások)
- **Kliens (Android App):** React Native + Expo (TypeScript). Lehetővé teszi a gyors, profi és natív érzetű mobil appok fejlesztését. UI komponensek: React Native Paper a modern "Material Design" megjelenésért.
- **Backend & Adatbázis:** Supabase (PostgreSQL, Auth, Edge Functions) - ingyenes szintje tökéletesen fedi a kezdeti igényeket.
- **Automatizáció & Keresés:** n8n (helyi futtatással, ingyenes) rendszeresen (cron) scrape-eli az ismert magyar pályázati portálokat és banki hitel oldalakat, majd feltölti a Supabase adatbázisba.
- **AI Ágens (Pályázat-illesztő & Asszisztens):** Google Gemini API / Ollama (helyi MI) vagy Supabase Edge Function-ből hívott LLM, amely összevezeti a felhasználó cégprofilját az aktuális pályázatokkal. A 2. fázisban ez az LLM generálja a dokumentumokat.

## 4. Alapfunkciók (Core Features)

### 1. Fázis: Profilozás és Kutatás (Matchmaking)
- **Cégprofil Építő (Onboarding):** AI-asszisztált interjú (chatbot UI), amely kikérdezi a felhasználót a cég adatairól (TEÁOR, létszám, árbevétel, célok).
- **Keresési Ütemező:** A felhasználó beállíthatja, milyen gyakran kér értesítést a cégére szabott új lehetőségekről (Napi/Heti).
- **Pályázati Feed:** A háttérben dolgozó ágens által pontozott (Match Score: 0-100%) pályázatok, hitelek listája, a cégprofilhoz illesztve.

### 2. Fázis: Pályázat kidolgozása (Copilot Mód)
- **Kiválasztás:** A felhasználó rányom az "Érdekel" gombra egy szimpatikus lehetőségnél.
- **Akcióterv (Roadmap):** Az ágens lebontja a pályázati követelményeket lépésekre (pl. 1. Pénzügyi terv, 2. Nyilatkozatok, 3. Üzleti terv).
- **Dokumentum Generátor:** Interaktív chat segítségével az ágens bekéri a hiányzó adatokat és legenerálja a beadandó dokumentumok piszkozatait.

## 5. Fejlesztési Architektúra és Eszközök
- A kódbázis a GitHub-on: `pohi99999/p-search-mobil`
- **Ágensek & Subagent-ek a fejlesztéshez:**
  - `Architect`: Megtervezi a Supabase sémákat és a React Native navigációt.
  - `Designer`: Létrehozza a prémium UI mockokat és komponens-struktúrákat.
  - `Code Implementer (Pickle Rick)`: Megírja az Expo app kódot.
  - `n8n-architect`: Összerakja a háttérben futó pályázat-figyelő workflow-t.
