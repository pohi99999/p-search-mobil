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
