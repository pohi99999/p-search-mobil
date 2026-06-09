# Specification: P-Search Monetizáció és App Store Publikálás

## 1. Vízió és Üzleti Modell
A cél a P-Search (Pályázat Kereső) mobilalkalmazás hivatalos piacra dobása a Google Play Áruházban (és Apple App Store-ban), valamint a bevételszerzési stratégia beágyazása az alkalmazás architektúrájába, a "Zero-Budget Growth" filozófia szerint.

## 2. Javasolt Bevételszerzési Módszerek (Monetizáció)

### A. Freemium Modell (Alapelv)
*   **Ingyenes Tier:** A felhasználók ingyenesen letölthetik az alkalmazást, regisztrálhatnak, és láthatják a számukra releváns "alap" pályázatokat, illetve korlátozott számú (pl. havi 1) AI mélykeresést indíthatnak.
*   **Pro Tier (Előfizetés):** Korlátlan AI keresés, "Premium" és rejtett pályázati lehetőségek, illetve automatikus push értesítések az új releváns pályázatok megjelenésekor.

### B. Eszközök és Implementáció
1.  **RevenueCat Integráció:**
    *   Az alkalmazáson belüli vásárlások (In-App Purchases - IAP) és előfizetések kezelésére a legstabilabb, ingyenes szinttel rendelkező megoldás.
    *   Lehetővé teszi a Pro paywall (fizetési kapu) zökkenőmentes megjelenítését a "Keresés indítása" gomb lenyomásakor, ha a limit lejárt.
2.  **AdMob (Választható / Ingyenes Tier kompenzáció):**
    *   Kizárólag a Freemium felhasználóknak lehet natív hirdetéseket (pl. banner a lista alján) megjeleníteni.
    *   A Pro előfizetéssel azonnal eltűnnek a reklámok (Ad-free élmény).
3.  **Lead Generation (B2B Upsell):**
    *   A regisztrált cégek, akik a P-Search-öt használják, valójában a mi B2B Lead-jeink. Az appból felajánlhatunk nekik "Díjmentes Fejlesztési Auditot", ami a fő webfejlesztési szolgáltatásunk felé tereli őket.

## 3. App Store és Google Play Publikálási Stratégia

### A. Technikai Előkészületek (Expo EAS)
*   **App Ikon & Splash Screen:** Profi, megnyerő grafikák készítése.
*   **EAS Build:** `eas build --platform android` és `ios` folyamatok beállítása.
*   **Aláíró Kulcsok (Keystore):** A Google Play Console-hoz szükséges kulcsok biztonságos generálása.

### B. App Store Optimization (ASO)
*   **Kulcsszavakra Optimalizált Cím és Leírás:** "Pályázat Kereső", "Cégfejlesztés", "Vállalkozás".
*   **Képernyőfotók:** Vonzó, a funkciókat (Onboarding, AI keresés) bemutató mock-up képek készítése.
*   **Adatvédelmi Nyilatkozat (Privacy Policy):** Létre kell hoznunk egy egyszerű weboldalt vagy dokumentumot, amely megfelel a boltok adatvédelmi követelményeinek.

## 4. Jövőbeli Skálázás
*   Később beépíthető egy "Pályázatíró keresése" funkció, amivel jutalékos rendszerben (Affiliate) összekötjük a felhasználót pályázatíró cégekkel.
