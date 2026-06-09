# Implementation Plan: Monetizáció és App Store Publikálás

## Phase 1: Bevételszerzési (Monetizációs) Architektúra Beépítése
- [ ] Task: RevenueCat (vagy alternatív) Expo csomag (`react-native-purchases`) telepítése és alapkonfigurációja (`App.tsx`).
- [ ] Task: Fizetési fal (Paywall) képernyő létrehozása (`PaywallScreen.tsx`).
- [ ] Task: Keresési limitek bevezetése. A Supabase `profiles` vagy `business_profiles` tábla bővítése egy `search_count` mezővel.
- [ ] Task: Ha a felhasználó eléri az ingyenes limitet, a `PaywallScreen` jelenjen meg.

## Phase 2: App Store Optimization (ASO) és Anyagok
- [ ] Task: P-Search alkalmazás Ikon (`icon.png`) és Splash Screen (`splash.png`) dizájnolása (generálás AI segítségével).
- [ ] Task: Google Play Adatvédelmi nyilatkozat (Privacy Policy) és ÁSZF megírása, majd feltöltése egy publikus URL-re (pl. Vercel weboldalra).
- [ ] Task: App Store mock-up képernyőfotók elkészítése a főbb funkciókról.

## Phase 3: Technikai Build és Google Play Feltöltés
- [ ] Task: Expo EAS fiók ellenőrzése és inicializálása (`eas build:configure`).
- [ ] Task: `app.json` kiegészítése a Google Play szükséges metaadataival (package name, version, permissions).
- [ ] Task: Keystore generálása és az első `.aab` Android build futtatása (`eas build -p android`).
- [ ] Task: A buildelt fájl feltöltése a Google Play Console belső teszt (Internal Testing) sávjába.
