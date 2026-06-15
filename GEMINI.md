# P-Search Mobil - Projekt Protokoll

Ez a dokumentum a projekt alapvető iránytűje. A mesterséges intelligenciának (M.I.) ezt a fájlt kell figyelembe vennie a projekt betöltésekor.

## 1. Conductor Framework (KÖTELEZŐ)
Ez a projekt **Szigorúan Conductor Üzemmódban** működik. 
- Minden fejlesztési fázist és feladatot a `conductor/` mappában lévő track-ek (pl. `conductor/tracks/onboarding_n8n_20260609/`) és a `conductor/workflow.md` alapján kell végezni.
- Ha egy új feladatba kezdesz, **MINDIG** ellenőrizd az aktív track-ek állapotát a `conductor/tracks.md` fájlban!
- A fejlesztéshez az `implement` (conductor plugin) skillt, vagy a `subagent-driven-development` / `pickle-rick` skilleket kell használni a maximális minőség érdekében.

## 2. Architektúra & Technológia
- **Frontend:** React Native (Expo)
- **UI:** React Native Paper (Material Design 3 - Letisztult, "Glass Box" stílus, wow-élmény)
- **Backend:** Supabase (Auth, PostgreSQL, RLS)
- **Külső API/Adat:** n8n munkafolyamatok és külső web scraper-ek

## 3. Stratégia
- **Zero-Budget:** Ingyenes, nyílt forráskódú eszközök használata, professzionális enterprise köntösben.
- Ha elakadsz vagy új funkciót kell építeni, először használd a `brainstorming` skillt.

Kérlek, tartsd be ezeket az irányelveket minden interakció során!

## 4. Aktuális Haladás
- **2026. 06. 10. (Monetizáció & Google Play):**
  - **EAS Build:** Beállítottuk az Expo EAS szolgáltatást, elkészült az első belső tesztelésre szánt Android `.aab` fájl.
  - **Google Play Console:** Létrehoztuk a Google Play API hozzáférést (Service Account), és feltöltöttük a legelső belső teszt verziót. Ezzel a jövőbeli automata CI/CD folyamatokhoz lefektettük az alapokat.
- **2026. 06. 15. (Fázis 5 - Monetizáció és Google Play Publikálás lezárása):**
  - **AdMob integráció:** Elkészítettük az `AdBanner` komponenst a HomeScreen és az OnboardingScreen alján, és a `useInterstitialAd` hookot a dokumentumgenerálás előtti átvezető hirdetésekhez (ingyenes felhasználóknak).
  - **RevenueCat IAP:** Beállítottuk a BillingContext-et a Purchases konfigurációjával, és felépítettük a prémium PaywallScreen felületet előfizetéssel és korábbi tranzakciók visszaállításával.
  - **Android 15 (API 35/36) & Gradle hibajavítások:** Beállítottuk a Compile SDK-t 36-ra, a Target SDK-t 35-re az app.json-ban, és felvettük a gyökérszintű AdMob android_app_id kulcsot a natív indítási összeomlások elhárítására.
  - **Google Play zárt tesztelés:** Hozzáadtuk a 14 napos aktivitást AsyncStorage-ban naplózó `TesterProgress` komponenst, valamint megírtuk a `TESTING_GUIDE.md` manuális verifikációs útmutatót.
  - **Hibakeresés és Bypass Tesztelés (S25 Ultra diagnosztika):**
    - **Development Client Beállítás:** Létrehoztuk a `development-client` EAS build profilt az [eas.json](file:///Z:/001_Workspace/p-search%20mobil/eas.json) fájlban, és telepítettük a `@expo/vector-icons` modult.
    - **Vektoros Ikonok Javítása:** Az [AuthScreen.tsx](file:///Z:/001_Workspace/p-search%20mobil/src/screens/AuthScreen.tsx) fájlban az ikonokat explicit `MaterialCommunityIcons` komponensekre cseréltük, megoldva a hiányzó ikonok problémáját Android 15+ eszközökön.
    - **Supabase Auth & DB Bypass:** A [src/lib/supabase.ts](file:///Z:/001_Workspace/p-search%20mobil/src/lib/supabase.ts) fájlban transzparens proxy wrapper segítségével mockoltuk a Supabase Auth és adatbázis hívásokat fejlesztési módban (`__DEV__`), így az app azonnal bejelentkezik és tesztelhető a Supabase RLS korlátok és e-mail megerősítési akadályok nélkül.
