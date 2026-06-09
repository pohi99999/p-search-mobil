# Track Specification: Cégprofilozás (Onboarding) és n8n integráció

## 1. Cél
Létrehozni egy felhasználóbarát "varázsló" (wizard) felületet a mobilalkalmazásban, ahol a regisztrált cégvezetők megadhatják a legfontosabb adataikat (TEÁOR, létszám, árbevétel, célok). Ez az adat bekerül a Supabase adatbázisba, és ez alapján az n8n automatizáció el tudja kezdeni a pályázatok keresését.

## 2. Funkciók (Features)
- **Onboarding Képernyő:** Egy több lépéses (vagy egyetlen görgethető, okosan felépített) form, amit a bejelentkezés után lát a felhasználó, ha még nincs kitöltött profilja.
- **Supabase Mentés:** Az űrlap adatai a `businesses` (vagy hasonló) Supabase táblába mentődnek a bejelentkezett felhasználóhoz csatolva.
- **n8n Webhook előkészítés:** A frontendből (vagy a Supabase database triggeren keresztül) meghívásra kerül egy n8n webhook, hogy "Új cég regisztrált, kezdd el a kutatást".
- **Home Screen frissítés:** Ha a profil kitöltött, a Home Screen-en egy töltő képernyő vagy Dashboard jelenjen meg, ami várja az n8n eredményeit.

## 3. Technikai részletek
- React Native Paper form komponensek (TextInput, Button, SegmentedButtons).
- Supabase API (Insert / Update).
- React Navigation navigáció az Onboarding és a Home között.
