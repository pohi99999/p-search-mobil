# Track Specification: Monetizáció és Google Play Publikálás (Fázis 5)

## 1. Cél
A P-Search Mobil alkalmazás felkészítése a bevételszerzésre és a Google Play Áruházban történő publikálásra. Ez magában foglalja a Freemium modell támogatását hirdetésekkel (AdMob), a prémium előfizetési rendszer kiépítését (RevenueCat IAP), a legújabb Android SDK irányelvek teljesítését, és a zárt tesztelési folyamat technikai előkészítését.

## 2. Funkciók és Technikai Célok
- **AdMob integráció:** Banner hirdetések elhelyezése a képernyők alján (pl. HomeScreen, ha nem Pro felhasználó) és átvezető (interstitial) hirdetések megjelenítése bizonyos műveletek után (pl. dokumentum generálás vagy keresés után).
- **RevenueCat IAP (In-App Purchase):** Pro tagság vásárlása és feloldása. RevenueCat SDK (`react-native-purchases`) használata az előfizetések kezelésére és szinkronizálására a Google Play Billing Library-val.
- **Android Target API Level 35:** Az `app.json` vagy `build.gradle` konfigurációk frissítése az Android 15 (API Level 35) eléréséhez, igazodva a Google Play 2026-os kötelező követelményeihez.
- **Zárt tesztelés támogatása:** Olyan analitikai vagy aktivitáskövető modul bevezetése, ami megkönnyíti a zárt tesztelés alatt álló 20 tesztelő 14 napos aktivitásának mérését és ösztönzését (pl. napi bejelentkezési csík, vagy push értesítések).

## 3. Technikai részletek
- **AdMob:** `react-native-google-mobile-ads` könyvtár és Expo config plugin beállítása.
- **IAP:** `react-native-purchases` RevenueCat kliens.
- **Expo SDK config:** `app.json` módosítása (sdkVersion 56, és build properties a compile/target SDK 35 eléréséhez).
