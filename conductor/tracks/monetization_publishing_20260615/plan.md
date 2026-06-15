# Implementation Plan - Monetizáció és Google Play Publikálás

## Phase 1: AdMob Hirdetések Integrációja
- [x] f259b55 Task: AdMob alapkonfiguráció és csomag beállítása.
    - [x] `react-native-google-mobile-ads` config plugin konfigurálása az `app.json`-ban teszt azonosítókkal.
- [x] 5ed6f31 Task: Banner hirdetések elhelyezése a felületen.
    - [x] Banner hirdetések integrálása a `HomeScreen.tsx` és a `OnboardingScreen.tsx` alján ingyenes felhasználók számára.
- [x] 19424ef Task: Interstitial (átvezető) hirdetés logikájának megírása.
    - [x] Interstitial hirdetés betöltése és megjelenítése dokumentumgenerálás vagy új keresés indítása előtt ingyenes felhasználóknál.
- [x] 5ed6f31 Task: Conductor - User Verification 'Phase 1' (Protocol in workflow.md)

## Phase 2: In-App Purchase (RevenueCat) Integráció
- [x] 3465ec9 Task: RevenueCat SDK konfiguráció a frontendben.
    - [x] `react-native-purchases` inicializálása a RevenueCat API kulccsal.
- [x] 3465ec9 Task: PaywallScreen frissítése és vásárlási logika bekötése.
    - [x] Csomagok (offerings) lekérése a RevenueCat-ből és megjelenítése a `PaywallScreen.tsx` felületén.
    - [x] Vásárlás indítása, sikeres vásárlás után a Supabase `profiles.subscription_tier` frissítése 'pro'-ra.
- [x] 3465ec9 Task: Előfizetés állapotának ellenőrzése és helyreállítása (Restore purchases).
    - [x] Restore gomb és logika a PaywallScreen-en, valamint aktív tagság ellenőrzése alkalmazás indításakor.
- [x] 5ed6f31 Task: Conductor - User Verification 'Phase 2' (Protocol in workflow.md)

## Phase 3: Android 15 (API 35) & Google Play Tesztelés
- [x] 5ed6f31 Task: Alkalmazás konfigurációjának frissítése (Android SDK 15 / API 35).
    - [x] `app.json` `android.compileSdkVersion` és `android.targetSdkVersion` beállítása 35-re.
- [x] 5ed6f31 Task: Zárt tesztelés technikai támogatása.
    - [x] Lokális aktivitáskövető (pl. AsyncStorage alapú bejelentkezési naptár) és visszajelző modul írása a tesztelők 14 napos aktivitásának ösztönzésére.
- [x] 5ed6f31 Task: Conductor - User Verification 'Phase 3' (Protocol in workflow.md)
