# Implementation Plan - Monetizáció és Google Play Publikálás

## Phase 1: AdMob Hirdetések Integrációja
- [x] f259b55 Task: AdMob alapkonfiguráció és csomag beállítása.
    - [x] `react-native-google-mobile-ads` config plugin konfigurálása az `app.json`-ban teszt azonosítókkal.
- [ ] Task: Banner hirdetések elhelyezése a felületen.
    - [ ] Banner hirdetések integrálása a `HomeScreen.tsx` és a `OnboardingScreen.tsx` alján ingyenes felhasználók számára.
- [ ] Task: Interstitial (átvezető) hirdetés logikájának megírása.
    - [ ] Interstitial hirdetés betöltése és megjelenítése dokumentumgenerálás vagy új keresés indítása előtt ingyenes felhasználóknál.
- [ ] Task: Conductor - User Verification 'Phase 1' (Protocol in workflow.md)

## Phase 2: In-App Purchase (RevenueCat) Integráció
- [ ] Task: RevenueCat SDK konfiguráció a frontendben.
    - [ ] `react-native-purchases` inicializálása a RevenueCat API kulccsal.
- [ ] Task: PaywallScreen frissítése és vásárlási logika bekötése.
    - [ ] Csomagok (offerings) lekérése a RevenueCat-ből és megjelenítése a `PaywallScreen.tsx` felületén.
    - [ ] Vásárlás indítása, sikeres vásárlás után a Supabase `profiles.subscription_tier` frissítése 'pro'-ra.
- [ ] Task: Előfizetés állapotának ellenőrzése és helyreállítása (Restore purchases).
    - [ ] Restore gomb és logika a PaywallScreen-en, valamint aktív tagság ellenőrzése alkalmazás indításakor.
- [ ] Task: Conductor - User Verification 'Phase 2' (Protocol in workflow.md)

## Phase 3: Android 15 (API 35) & Google Play Tesztelés
- [ ] Task: Alkalmazás konfigurációjának frissítése (Android SDK 15 / API 35).
    - [ ] `app.json` `android.compileSdkVersion` és `android.targetSdkVersion` beállítása 35-re.
- [ ] Task: Zárt tesztelés technikai támogatása.
    - [ ] Lokális aktivitáskövető (pl. AsyncStorage alapú bejelentkezési naptár) és visszajelző modul írása a tesztelők 14 napos aktivitásának ösztönzésére.
- [ ] Task: Conductor - User Verification 'Phase 3' (Protocol in workflow.md)
