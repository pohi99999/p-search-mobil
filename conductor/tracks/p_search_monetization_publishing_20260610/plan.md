# Implementation Plan: Monetizáció és App Store Publikálás

## Phase 1: Bevételszerzési (Monetizációs) Architektúra Beépítése
- [x] Task: RevenueCat (vagy alternatív) Expo csomag (`react-native-purchases`) telepítése és alapkonfigurációja (`App.tsx`).
- [x] Task: Fizetési fal (Paywall) képernyő létrehozása (`PaywallScreen.tsx`).
- [x] Task: Keresési limitek bevezetése. A Supabase `profiles` vagy `business_profiles` tábla bővítése egy `search_count` mezővel.
- [x] Task: Ha a felhasználó eléri az ingyenes limitet, a `PaywallScreen` jelenjen meg.

## Phase 2: App Store Optimization (ASO) és Anyagok
- [x] Task: P-Search alkalmazás Ikon (`icon.png`) és Splash Screen (`splash.png`) dizájnolása (generálás AI segítségével).
- [x] Task: Google Play Adatvédelmi nyilatkozat (Privacy Policy) és ÁSZF megírása, majd feltöltése egy publikus URL-re (pl. Vercel weboldalra).
- [ ] Task: App Store mock-up képernyőfotók elkészítése a főbb funkciókról.

## Phase 3: Technikai Build és Google Play Feltöltés
- [x] Task: Expo EAS fiók ellenőrzése és inicializálása (`eas build:configure`).
- [x] Task: `app.json` kiegészítése a Google Play szükséges metaadataival (package name, version, permissions).
- [x] Task: Keystore generálása és az első `.aab` Android build futtatása (`eas build -p android`).
- [x] Task: A buildelt fájl feltöltése a Google Play Console belső teszt (Internal Testing) sávjába.
